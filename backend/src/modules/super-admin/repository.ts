import { prisma } from '../../common/db/prisma';
import {
  nextBranchCode,
  nextClinicCode,
  nextDoctorCode,
} from '../../common/utils/codes';
import type { Role } from '../../generated/prisma/enums';
import type { CreateClinicInput, UpdateClinicInput } from './schema';

interface BranchInput {
  name: string;
  picName?: string;
  contact?: string;
}

interface AccountInput {
  clinicId: string;
  /** Branch for a doctor/receptionist; null for a clinic-wide admin. */
  branchId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  title?: string;
  phone?: string;
  role: Role;
  /** Hash of the temporary password the account first logs in with. */
  passwordHash: string;
  withDoctorProfile: boolean;
}

// Super-admin operates across all tenants, so these queries are intentionally
// NOT scoped by clinicId.
export const superAdminRepository = {
  // Include each clinic's client admin so the super-admin list can show a
  // person-in-charge (PIC) name + contact per clinic.
  findClinics: () =>
    prisma.clinic.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        users: {
          where: { role: 'CLIENT_ADMIN' },
          select: { firstName: true, lastName: true, phone: true },
          // Prefer a named admin as the PIC (Postgres sorts NULLs last on ASC),
          // falling back to the earliest-created client admin.
          orderBy: [{ firstName: 'asc' }, { createdAt: 'asc' }],
          take: 1,
        },
      },
    }),

  // All branches across every clinic (super admin is cross-tenant), each with
  // its person-in-charge for the name + contact columns.
  findBranches: () =>
    prisma.branch.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        pic: { select: { firstName: true, lastName: true, phone: true } },
      },
    }),

  findBranchById: (id: string) =>
    prisma.branch.findUnique({
      where: { id },
      include: { pic: { select: { firstName: true, lastName: true, phone: true } } },
    }),

  updateBranch: (id: string, data: { name?: string; picName?: string | null; contact?: string | null }) =>
    prisma.branch.update({
      where: { id },
      data,
      include: { pic: { select: { firstName: true, lastName: true, phone: true } } },
    }),

  deleteBranch: (id: string) => prisma.branch.delete({ where: { id } }),

  findClinicById: (id: string) => prisma.clinic.findUnique({ where: { id } }),

  createClinic: async (data: CreateClinicInput) =>
    prisma.clinic.create({ data: { ...data, code: await nextClinicCode() } }),

  /** Create a clinic together with one or more branches in one transaction. */
  createClinicWithBranches: async (data: CreateClinicInput, branches: BranchInput[]) => {
    const clinicCode = await nextClinicCode();
    const branchCodes = await Promise.all(branches.map(() => nextBranchCode()));
    return prisma.$transaction(async (tx) => {
      const clinic = await tx.clinic.create({ data: { ...data, code: clinicCode } });
      const createdBranches = [];
      for (let i = 0; i < branches.length; i++) {
        createdBranches.push(
          await tx.branch.create({
            data: {
              clinicId: clinic.id,
              code: branchCodes[i],
              name: branches[i].name,
              picName: branches[i].picName ?? null,
              contact: branches[i].contact ?? null,
            },
          }),
        );
      }
      return { clinic, branches: createdBranches };
    });
  },

  /** Add a single branch to an existing clinic. */
  createBranch: async (clinicId: string, branch: BranchInput) =>
    prisma.branch.create({
      data: {
        clinicId,
        code: await nextBranchCode(),
        name: branch.name,
        picName: branch.picName ?? null,
        contact: branch.contact ?? null,
      },
      include: { pic: { select: { firstName: true, lastName: true, phone: true } } },
    }),

  findUserByEmail: (email: string) => prisma.user.findUnique({ where: { email } }),

  findUserById: (id: string) =>
    prisma.user.findUnique({
      where: { id },
      include: { branch: { select: { id: true, code: true, name: true } } },
    }),

  /** All staff accounts under a clinic, newest first (super admins excluded). */
  findUsersByClinic: (clinicId: string) =>
    prisma.user.findMany({
      where: { clinicId },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      include: { branch: { select: { id: true, code: true, name: true } } },
    }),

  updateAccount: (
    id: string,
    data: {
      title?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      phone?: string | null;
      status?: 'ACTIVE' | 'SUSPENDED';
    },
  ) =>
    prisma.user.update({
      where: { id },
      data,
      include: { branch: { select: { id: true, code: true, name: true } } },
    }),

  /**
   * Hard-delete a staff account. FK-safe: unlinks any branches this user is the
   * PIC of, and if they have a doctor profile, removes its appointments (no
   * cascade) and the profile itself (shifts cascade) before deleting the user.
   */
  deleteAccount: (id: string) =>
    prisma.$transaction(async (tx) => {
      await tx.branch.updateMany({ where: { picUserId: id }, data: { picUserId: null } });
      const doctor = await tx.doctor.findUnique({ where: { userId: id }, select: { id: true } });
      if (doctor) {
        await tx.appointment.deleteMany({ where: { doctorId: doctor.id } });
        await tx.doctor.delete({ where: { id: doctor.id } });
      }
      await tx.user.delete({ where: { id } });
    }),

  /** Create a staff account (user), plus a doctor profile when needed. */
  createAccount: (data: AccountInput) =>
    prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          clinicId: data.clinicId,
          branchId: data.branchId,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          title: data.title ?? null,
          phone: data.phone ?? null,
          role: data.role,
          status: 'ACTIVE',
          // Temporary password + forced first-login reset (mustResetPassword
          // defaults to true in the schema).
          passwordHash: data.passwordHash,
        },
      });
      if (data.withDoctorProfile) {
        await tx.doctor.create({
          data: {
            userId: user.id,
            clinicId: data.clinicId,
            branchId: data.branchId,
            code: await nextDoctorCode(),
          },
        });
      }
      return user;
    }),

  updateClinic: (id: string, data: UpdateClinicInput) =>
    prisma.clinic.update({ where: { id }, data }),

  /**
   * Delete a clinic and everything it owns, atomically. The children are
   * removed in dependency order (leaves first) so no foreign key is left
   * dangling; the whole thing runs in one transaction, so a failure at any step
   * rolls the entire delete back.
   *
   * Order notes:
   *  - Appointments reference patients + doctors, so they go first.
   *  - Doctor shifts cascade on doctor delete, but are cleared explicitly too.
   *  - Branch ⇄ User is a cycle (a branch's PIC is a user; a user's branchId is
   *    a branch), so both links are nulled before either side is deleted.
   */
  removeClinic: (id: string) =>
    prisma.$transaction([
      prisma.appointment.deleteMany({ where: { clinicId: id } }),
      prisma.doctorShift.deleteMany({ where: { clinicId: id } }),
      prisma.doctor.deleteMany({ where: { clinicId: id } }),
      prisma.patient.deleteMany({ where: { clinicId: id } }),
      // Break the Branch ⇄ User cycle before deleting either table.
      prisma.user.updateMany({ where: { clinicId: id }, data: { branchId: null } }),
      prisma.branch.updateMany({ where: { clinicId: id }, data: { picUserId: null } }),
      prisma.user.deleteMany({ where: { clinicId: id } }),
      prisma.branch.deleteMany({ where: { clinicId: id } }),
      prisma.clinic.delete({ where: { id } }),
    ]),
};
