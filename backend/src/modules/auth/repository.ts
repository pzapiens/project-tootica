import { prisma } from '../../common/db/prisma';

export const authRepository = {
  findByEmail: (email: string) =>
    prisma.user.findUnique({ where: { email }, include: { clinic: true } }),

  findById: (id: string) =>
    prisma.user.findUnique({ where: { id }, include: { clinic: true } }),

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
