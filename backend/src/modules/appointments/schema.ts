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
  consultationType: z.string().optional(),
  sourceOfEnquiry: z.string().optional(),
  notes: z.string().optional(),
});

export const createAppointmentSchema = appointmentBase
  .extend({
    // When true, skip the business-hours + doctor-conflict checks (the
    // "Non-mandatory" option) — the appointment may be booked at any time.
    nonMandatory: z.boolean().optional(),
  })
  // A non-mandatory appointment with no time picked is stored as zero-duration
  // (start == end) and rendered as "--"; otherwise the end must be after start.
  .refine((data) => (data.nonMandatory ? data.endTime >= data.startTime : data.endTime > data.startTime), {
    message: 'endTime must be after startTime',
    path: ['endTime'],
  });

export const updateAppointmentSchema = appointmentBase.partial();

/**
 * Availability lookup for the New Appointment form. `from`/`to` are 24h `HH:mm`
 * in the clinic's local time; when both are present the response says whether
 * each doctor is free for that slot, otherwise it just returns their bookings.
 */
export const availabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  from: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'from must be HH:mm')
    .optional(),
  to: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'to must be HH:mm')
    .optional(),
  doctorId: z.string().optional(),
  // When editing an appointment, its own booking must not count as a conflict
  // against the new slot — exclude it from the day's bookings.
  excludeAppointmentId: z.string().optional(),
});

/** Optional filters for the appointments list (dashboard table / calendar). */
export const listAppointmentsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  // Accepts one status (`status=COMPLETED`) or several (`status=SCHEDULED&
  // status=CONFIRMED`) — the display filter maps a bucket to 1..n real statuses.
  status: z
    .union([z.enum(appointmentStatuses), z.array(z.enum(appointmentStatuses))])
    .optional(),
  // Most-recent-first cap; 1..500, defaults applied in the repository.
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
/** The stored appointment fields (create input minus the `nonMandatory` flag). */
export type CreateAppointmentData = Omit<CreateAppointmentInput, 'nonMandatory'>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
export type ListAppointmentsQuery = z.infer<typeof listAppointmentsQuerySchema>;
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
