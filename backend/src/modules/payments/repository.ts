import { prisma } from '../../common/db/prisma';
import type { CreatePaymentInput } from './schema';

// Payments are scoped to their clinic through the appointment they belong to
// (no clinic column of their own), so every lookup joins back to the appointment
// with the caller's clinicId to stay tenant-safe.
export const paymentRepository = {
  /** The appointment when it belongs to the clinic (existence/tenant check). */
  findAppointment: (clinicId: string, appointmentId: string) =>
    prisma.appointment.findFirst({
      where: { id: appointmentId, clinicId },
      select: { id: true },
    }),

  listForAppointment: (appointmentId: string) =>
    prisma.payment.findMany({ where: { appointmentId }, orderBy: { createdAt: 'asc' } }),

  create: (appointmentId: string, data: CreatePaymentInput) =>
    prisma.payment.create({ data: { appointmentId, ...data } }),

  // Delete scoped by clinic (via the appointment) so one tenant can't remove
  // another's payment by id.
  remove: (clinicId: string, id: string) =>
    prisma.payment.deleteMany({ where: { id, appointment: { clinicId } } }),

  // Toggle one entry's paid flag, scoped by clinic through its appointment.
  setPaid: (clinicId: string, id: string, paid: boolean) =>
    prisma.payment.updateMany({ where: { id, appointment: { clinicId } }, data: { paid } }),
};
