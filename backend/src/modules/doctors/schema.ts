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
