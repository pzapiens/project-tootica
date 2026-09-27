import { prisma } from '../../common/db/prisma';

// Revenue reads the clinic's payment entries (scoped to the clinic through the
// appointment each payment belongs to — payments have no clinic column).
export const revenueRepository = {
  clinicCode: (clinicId: string) =>
    prisma.clinic.findUnique({ where: { id: clinicId }, select: { code: true } }),

  /** Every payment in the clinic, oldest first (so a stable per-clinic
   *  transaction sequence can be assigned), joined with its appointment's
   *  patient + consultation type + date. */
  listTransactions: (clinicId: string) =>
    prisma.payment.findMany({
      where: { appointment: { clinicId } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        amount: true,
        paid: true,
        appointment: {
          select: {
            startTime: true,
            consultationType: true,
            patient: { select: { name: true } },
            doctor: { select: { branchId: true } },
          },
        },
      },
    }),
};
