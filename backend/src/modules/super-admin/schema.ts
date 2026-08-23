import { z } from 'zod';

export const clinicPlans = ['FREE', 'BASIC', 'PRO', 'ENTERPRISE'] as const;
export const clinicStatuses = ['ACTIVE', 'SUSPENDED', 'INACTIVE'] as const;
export const accountTypes = ['ADMIN', 'DOCTOR', 'RECEPTIONIST'] as const;
export const titles = ['Mr', 'Mrs', 'Ms', 'Dr'] as const;

/**
 * Optional Indian phone number: the `91` country code + 10 digits (optional
 * leading `+`, spaces/dashes ignored). Empty/absent is allowed (optional field).
 */
const optionalPhone = z
  .string()
  .optional()
  .refine((v) => !v || /^\+?91\d{10}$/.test(v.replace(/[\s-]/g, '')), {
    message: 'Enter a valid phone number: +91 followed by 10 digits.',
  });

export const createClinicSchema = z.object({
  name: z.string().min(1),
  plan: z.enum(clinicPlans).optional(),
  status: z.enum(clinicStatuses).optional(),
});

/** A first branch to create alongside a new clinic (from the admin form). */
export const branchInputSchema = z.object({
  name: z.string().min(1, 'Branch name is required'),
  picName: z.string().min(1).optional(),
  contact: optionalPhone,
});

export const createClinicWithBranchSchema = createClinicSchema.extend({
  branch: branchInputSchema.optional(),
});

export const updateBranchSchema = z.object({
  name: z.string().min(1, 'Branch name is required').optional(),
  picName: z.string().optional(),
  contact: optionalPhone,
});

export const updateClinicSchema = createClinicSchema.partial();

export const createAccountSchema = z.object({
  clinicId: z.string().min(1, 'A clinic must be selected'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  title: z.enum(titles).optional(),
  accountType: z.enum(accountTypes),
  email: z.string().email('Enter a valid email address'),
  phone: optionalPhone,
});

export type CreateClinicInput = z.infer<typeof createClinicSchema>;
export type CreateClinicWithBranchInput = z.infer<typeof createClinicWithBranchSchema>;
export type UpdateClinicInput = z.infer<typeof updateClinicSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
export type AccountType = (typeof accountTypes)[number];
