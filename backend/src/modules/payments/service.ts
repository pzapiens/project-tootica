import { HttpError } from '../../common/utils/httpError';
import { paymentRepository as repo } from './repository';
import type { CreatePaymentInput } from './schema';

type PaymentRow = Awaited<ReturnType<typeof repo.create>>;

// Shape a row for the client — Prisma returns Decimal for `amount`, so convert
// it to a plain JS number the frontend can total/format directly.
const toPayment = (r: PaymentRow) => ({
  id: r.id,
  description: r.description,
  amount: Number(r.amount),
  paid: r.paid,
  createdAt: r.createdAt,
});

async function ensureAppointment(clinicId: string, appointmentId: string) {
  const appt = await repo.findAppointment(clinicId, appointmentId);
  if (!appt) {
    throw new HttpError(404, 'Appointment not found');
  }
  return appt;
}

export const paymentService = {
  /** All payment entries for an appointment (each carries its own `paid` flag). */
  bundle: async (clinicId: string, appointmentId: string) => {
    await ensureAppointment(clinicId, appointmentId);
    const payments = await repo.listForAppointment(appointmentId);
    return { payments: payments.map(toPayment) };
  },

  add: async (clinicId: string, appointmentId: string, data: CreatePaymentInput) => {
    await ensureAppointment(clinicId, appointmentId);
    return toPayment(await repo.create(appointmentId, data));
  },

  remove: async (clinicId: string, appointmentId: string, paymentId: string) => {
    await ensureAppointment(clinicId, appointmentId);
    const { count } = await repo.remove(clinicId, paymentId);
    if (count === 0) {
      throw new HttpError(404, 'Payment not found');
    }
  },

  setPaid: async (clinicId: string, appointmentId: string, paymentId: string, paid: boolean) => {
    await ensureAppointment(clinicId, appointmentId);
    const { count } = await repo.setPaid(clinicId, paymentId, paid);
    if (count === 0) {
      throw new HttpError(404, 'Payment not found');
    }
    return { paid };
  },
};
