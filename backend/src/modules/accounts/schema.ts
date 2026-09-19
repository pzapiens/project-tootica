import { z } from 'zod';

import { passwordSchema } from '../auth/schema';

/** Optional Indian phone: +91 + 10 digits (spaces/dashes ignored). */
const optionalPhone = z
  .string()
  .optional()
  .refine((v) => !v || /^\+?91\d{10}$/.test(v.replace(/[\s-]/g, '')), {
    message: 'Enter a valid phone number: +91 followed by 10 digits.',
  });

const titles = ['Mr', 'Mrs', 'Ms', 'Dr'] as const;

// A clinic admin can only create branch staff — never other admins.
export const staffAccountTypes = ['DOCTOR', 'RECEPTIONIST'] as const;

/** A clinic admin creating a doctor / receptionist at one of their branches. */
export const createStaffSchema = z.object({
  branchId: z.string().min(1, 'A branch is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  title: z.enum(titles).optional(),
  accountType: z.enum(staffAccountTypes),
  email: z.string().email('Enter a valid email address'),
  phone: optionalPhone,
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;

/** An admin / super admin setting a new password for a clinic account. */
export const resetAccountPasswordSchema = z.object({
  password: passwordSchema,
});

export type ResetAccountPasswordInput = z.infer<typeof resetAccountPasswordSchema>;
