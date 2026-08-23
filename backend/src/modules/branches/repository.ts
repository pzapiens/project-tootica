import { prisma } from '../../common/db/prisma';

export const branchRepository = {
  /** Branches for a clinic, oldest first, with their person-in-charge. */
  listByClinic: (clinicId: string) =>
    prisma.branch.findMany({
      where: { clinicId },
      orderBy: { createdAt: 'asc' },
      include: {
        pic: { select: { firstName: true, lastName: true, phone: true } },
      },
    }),
};
