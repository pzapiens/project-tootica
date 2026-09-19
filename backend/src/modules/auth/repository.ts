import { prisma } from '../../common/db/prisma';

// The clinic (for the `me` payload) + the caller's doctor specialization (shown
// on the Profile page; null for non-doctors) are joined on every user lookup.
const userInclude = {
  clinic: true,
  doctor: { select: { specialization: true } },
} as const;

export const authRepository = {
  findByEmail: (email: string) =>
    prisma.user.findUnique({ where: { email }, include: userInclude }),

  /** Resolve an account by its (normalized) phone — the phone + OTP login path. */
  findByPhone: (phone: string) =>
    prisma.user.findUnique({ where: { phone }, include: userInclude }),

  findById: (id: string) =>
    prisma.user.findUnique({ where: { id }, include: userInclude }),

  /** Update the caller's own profile fields (only the keys provided). */
  updateProfile: (
    id: string,
    data: { firstName?: string; lastName?: string; phone?: string | null; email?: string },
  ) => prisma.user.update({ where: { id }, data, include: userInclude }),

  /** Set the specialization on the user's doctor profile (no-op if not a doctor). */
  updateDoctorSpecialization: (userId: string, specialization: string) =>
    prisma.doctor.updateMany({ where: { userId }, data: { specialization } }),

  /** Active clinic-admin count for the caller's clinic (last-admin delete guard). */
  countActiveClinicAdmins: (clinicId: string) =>
    prisma.user.count({ where: { clinicId, role: 'CLIENT_ADMIN', status: 'ACTIVE' } }),

  /**
   * Delete the caller's own account, unwinding the relations that would
   * otherwise block it: detach any appointments from (and delete) their doctor
   * profile — cascading shifts/blocks — and clear any branch person-in-charge
   * link, all in one transaction.
   */
  deleteAccount: (userId: string) =>
    prisma.$transaction(async (tx) => {
      const doctor = await tx.doctor.findUnique({ where: { userId }, select: { id: true } });
      if (doctor) {
        await tx.appointment.updateMany({
          where: { doctorId: doctor.id },
          data: { doctorId: null },
        });
        await tx.doctor.delete({ where: { id: doctor.id } });
      }
      await tx.branch.updateMany({ where: { picUserId: userId }, data: { picUserId: null } });
      await tx.user.delete({ where: { id: userId } });
    }),

  updatePassword: (id: string, passwordHash: string) =>
    prisma.user.update({ where: { id }, data: { passwordHash } }),

  /** First-time password setup via invite — also activates the account. */
  setInitialPassword: (id: string, passwordHash: string) =>
    prisma.user.update({ where: { id }, data: { passwordHash, status: 'ACTIVE' } }),

  /**
   * Completes the forced first-login flow: sets the chosen password, clears the
   * reset requirement, and records Terms & Conditions acceptance.
   */
  completeOnboarding: (id: string, passwordHash: string) =>
    prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustResetPassword: false,
        termsAcceptedAt: new Date(),
      },
    }),
};
