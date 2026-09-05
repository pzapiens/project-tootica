import { prisma } from '../../common/db/prisma';
import { nextDoctorCode } from '../../common/utils/codes';

// Include the linked user's name, email and role so the list can show a
// human-readable doctor and tell apart employed doctors (role DOCTOR, managed
// via the account flow) from guest doctors (role GUEST_DOCTOR, editable here),
// plus the branch the doctor is assigned to.
const withUser = {
  user: {
    select: { title: true, firstName: true, lastName: true, email: true, role: true },
  },
  branch: { select: { id: true, code: true, name: true } },
} as const;

/** Fields for provisioning a guest doctor's user + profile. */
interface GuestDoctorInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  specialization?: string;
  /** Branch to pin the guest to (the one being viewed); undefined = clinic-wide. */
  branchId?: string;
}

export const doctorRepository = {
  // `branchId` partitions the list to a single branch; undefined = clinic-wide.
  findMany: (clinicId: string, branchId?: string) =>
    prisma.doctor.findMany({
      where: { clinicId, ...(branchId ? { branchId } : {}) },
      orderBy: { createdAt: 'desc' },
      include: withUser,
    }),

  findById: (clinicId: string, id: string) =>
    prisma.doctor.findFirst({ where: { id, clinicId }, include: withUser }),

  /** A user with this email, if any (emails are unique across all users). */
  findUserByEmail: (email: string) => prisma.user.findUnique({ where: { email } }),

  /** Provision a guest doctor: a GUEST_DOCTOR user + its doctor profile. */
  createGuest: (clinicId: string, data: GuestDoctorInput) =>
    prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          clinicId,
          branchId: data.branchId ?? null,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          title: 'Dr',
          phone: data.phone ?? null,
          // Guest doctors are visiting staff — no login, so no password.
          role: 'GUEST_DOCTOR',
          status: 'ACTIVE',
        },
      });
      return tx.doctor.create({
        data: {
          userId: user.id,
          clinicId,
          branchId: data.branchId ?? null,
          specialization: data.specialization ?? null,
          phone: data.phone ?? null,
          code: await nextDoctorCode(),
        },
        include: withUser,
      });
    }),

  /** Update a doctor's profile (and, for guests, the linked user's identity). */
  updateProfile: (
    clinicId: string,
    id: string,
    userId: string,
    userData: { firstName?: string; lastName?: string; email?: string; phone?: string | null },
    doctorData: { specialization?: string; phone?: string | null },
  ) =>
    prisma.$transaction(async (tx) => {
      if (Object.keys(userData).length > 0) {
        await tx.user.update({ where: { id: userId }, data: userData });
      }
      if (Object.keys(doctorData).length > 0) {
        await tx.doctor.update({ where: { id }, data: doctorData });
      }
      return tx.doctor.findFirstOrThrow({ where: { id, clinicId }, include: withUser });
    }),

  remove: (clinicId: string, id: string) =>
    prisma.doctor.deleteMany({ where: { id, clinicId } }),
};
