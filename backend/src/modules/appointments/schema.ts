import { z } from 'zod';

export const appointmentStatuses = [
  'SCHEDULED',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;

const appointmentBase = z.object({
  patientId: z.string().min(1),
  doctorId: z.string().min(1),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  status: z.enum(appointmentStatuses).optional(),
  notes: z.string().optional(),
});

export const createAppointmentSchema = appointmentBase.refine(
  (data) => data.endTime > data.startTime,
  { message: 'endTime must be after startTime', path: ['endTime'] },
);

export const updateAppointmentSchema = appointmentBase.partial();

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
