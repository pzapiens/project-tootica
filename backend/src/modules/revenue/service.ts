import { revenueRepository as repo } from './repository';

export const revenueService = {
  /**
   * The clinic's revenue transactions (one per payment entry). Amounts are
   * converted from Prisma's Decimal to a plain number; each row gets a stable
   * per-clinic transaction code (`<clinicCode>-TT000001`, by creation order).
   * The client derives the summary totals + filters/sorts this list.
   */
  transactions: async (clinicId: string) => {
    const [clinic, rows] = await Promise.all([
      repo.clinicCode(clinicId),
      repo.listTransactions(clinicId),
    ]);
    const prefix = clinic?.code ? `${clinic.code}-TT` : 'TT';
    return rows.map((r, i) => ({
      id: r.id,
      code: `${prefix}${String(i + 1).padStart(6, '0')}`,
      patientName: r.appointment.patient?.name ?? '—',
      consultationType: r.appointment.consultationType ?? null,
      amount: Number(r.amount),
      paid: r.paid,
      date: r.appointment.startTime,
      // The branch the appointment's doctor belongs to (null when unassigned) —
      // lets the clinic-selection overview scope revenue by branch.
      branchId: r.appointment.doctor?.branchId ?? null,
    }));
  },
};
