import { z } from 'zod';

/** Optional Indian phone: +91 + 10 digits (spaces/dashes ignored). */
const optionalPhone = z
  .string()
  .optional()
  .refine((v) => !v || /^\+?91\d{10}$/.test(v.replace(/[\s-]/g, '')), {
    message: 'Enter a valid phone number: +91 followed by 10 digits.',
  });

/**
 * "New Doctor Profile" (Figma) creates a GUEST doctor — a visiting doctor
 * captured directly on the Doctors page with just their name / email / phone /
 * specialization. It's created inside the current clinic (no branch picker), and
 * provisions a GUEST_DOCTOR user + doctor profile server-side. Employed doctors
 * with logins are created through the account/staff flow instead.
 */
export const createDoctorSchema = z.object({
  name: z.string().min(1, 'Doctor name is required'),
  // Optional — guest doctors have no login. Treat blank as absent; when given it
  // must be a valid email. The service provisions a placeholder when omitted.
  email: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().email('Enter a valid email address').optional(),
  ),
  phone: optionalPhone,
  specialization: z.string().optional(),
});

/** Editing a guest doctor's profile — all fields optional (partial update). */
export const updateDoctorSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email('Enter a valid email address').optional(),
  phone: optionalPhone,
  specialization: z.string().optional(),
});

export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;
export type UpdateDoctorInput = z.infer<typeof updateDoctorSchema>;

/* ------------------------------------------------------------- shifts / blocks

 * The Edit Doctor Shift screen and the Doctor Availability popup save the whole
 * set at once, so shifts/blocks use replace-all (PUT) semantics. Times are
 * canonical "HH:mm" 24h; dates are "YYYY-MM-DD" (date-only). Client-supplied ids
 * are ignored — the DB assigns them.
 */
const timeHHmm = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Time must be HH:mm (24h)');
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
const SHIFT_FREQUENCIES = ['Day', 'Weekly', 'Biweekly', 'Monthly', 'Yearly', 'Every day'] as const;

const shiftEntrySchema = z
  .object({
    groupId: z.string().nullable().optional(),
    frequency: z.enum(SHIFT_FREQUENCIES),
    date: dateOnly,
    startTime: timeHHmm,
    endTime: timeHHmm,
  })
  .refine((s) => s.startTime < s.endTime, {
    message: 'Shift end time must be after the start time',
  });

export const putShiftsSchema = z.object({
  shifts: z.array(shiftEntrySchema).max(500),
});

const blockEntrySchema = z
  .object({
    date: dateOnly,
    startTime: timeHHmm,
    endTime: timeHHmm,
  })
  .refine((b) => b.startTime < b.endTime, {
    message: 'Block end time must be after the start time',
  });

export const putBlocksSchema = z.object({
  blocks: z.array(blockEntrySchema).max(500),
});

export type PutShiftsInput = z.infer<typeof putShiftsSchema>;
export type PutBlocksInput = z.infer<typeof putBlocksSchema>;
