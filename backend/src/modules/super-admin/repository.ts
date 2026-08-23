import { prisma } from '../../common/db/prisma';
import type { Role } from '../../generated/prisma/enums';
import type { CreateClinicInput, UpdateClinicInput } from './schema';

interface BranchInput {
  name: string;
  picName?: string;
  contact?: string;
}

interface AccountInput {
  clinicId: string;
  email: string;
  firstName: string;
  lastName: string;
  title?: string;
  phone?: string;
  role: Role;
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

  createClinic: (data: CreateClinicInput) => prisma.clinic.create({ data }),

  /** Create a clinic and, optionally, its first branch in one transaction. */
  createClinicWithBranch: (data: CreateClinicInput, branch?: BranchInput) =>
    prisma.$transaction(async (tx) => {
      const clinic = await tx.clinic.create({ data });
      let createdBranch = null;
      if (branch) {
        // Next sequential code: c001, c002, … (zero-padded so string order == numeric).
        const last = await tx.branch.findFirst({
          orderBy: { code: 'desc' },
          select: { code: true },
        });
        const nextNum = last ? parseInt(last.code.replace(/\D/g, ''), 10) + 1 : 1;
        const code = `c${String(nextNum).padStart(3, '0')}`;
        createdBranch = await tx.branch.create({
          data: {
            clinicId: clinic.id,
            code,
            name: branch.name,
            picName: branch.picName ?? null,
            contact: branch.contact ?? null,
          },
        });
      }
      return { clinic, branch: createdBranch };
    }),

  findUserByEmail: (email: string) => prisma.user.findUnique({ where: { email } }),

  /** Create a staff account (user), plus a doctor profile when needed. */
  createAccount: (data: AccountInput) =>
    prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          clinicId: data.clinicId,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          title: data.title ?? null,
          phone: data.phone ?? null,
          role: data.role,
          status: 'ACTIVE',
        },
      });
      if (data.withDoctorProfile) {
        await tx.doctor.create({ data: { userId: user.id, clinicId: data.clinicId } });
      }
      return user;
    }),

  updateClinic: (id: string, data: UpdateClinicInput) =>
    prisma.clinic.update({ where: { id }, data }),

  removeClinic: (id: string) => prisma.clinic.delete({ where: { id } }),
};
