import { prisma } from '../../common/db/prisma';

export const authRepository = {
  findByEmail: (email: string) => prisma.user.findUnique({ where: { email } }),

  findById: (id: string) => prisma.user.findUnique({ where: { id } }),

  updatePassword: (id: string, passwordHash: string) =>
    prisma.user.update({ where: { id }, data: { passwordHash } }),

  /** First-time password setup via invite — also activates the account. */
  setInitialPassword: (id: string, passwordHash: string) =>
    prisma.user.update({ where: { id }, data: { passwordHash, status: 'ACTIVE' } }),
};
