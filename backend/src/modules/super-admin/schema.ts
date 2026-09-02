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

/** A branch to create alongside a new clinic (from the admin form). */
export const branchInputSchema = z.object({
  name: z.string().min(1, 'Branch name is required'),
  picName: z.string().min(1).optional(),
  contact: optionalPhone,
});

/** Create a clinic together with one or more branches. */
export const createClinicWithBranchesSchema = createClinicSchema.extend({
  branches: z
    .array(branchInputSchema)
    .min(1, 'Add at least one branch')
    .max(20, 'Too many branches'),
});

/** Add a branch to an existing clinic. */
export const createBranchSchema = z.object({
  clinicId: z.string().min(1, 'A clinic is required'),
  name: z.string().min(1, 'Branch name is required'),
  picName: z.string().min(1).optional(),
  contact: optionalPhone,
});

export const updateBranchSchema = z.object({
  name: z.string().min(1, 'Branch name is required').optional(),
  picName: z.string().optional(),
  contact: optionalPhone,
});

export const updateClinicSchema = createClinicSchema.partial();

export const createAccountSchema = z.object({
  clinicId: z.string().min(1, 'A clinic must be selected'),
  // The branch a doctor / receptionist is assigned to. Ignored for admins
  // (they're clinic-wide). Optional so an admin can be created without one.
  branchId: z.string().optional(),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  title: z.enum(titles).optional(),
  accountType: z.enum(accountTypes),
  email: z.string().email('Enter a valid email address'),
  phone: optionalPhone,
});

/** Editable fields for an existing staff account (all optional / partial). */
export const updateAccountSchema = z.object({
  firstName: z.string().min(1, 'First name is required').optional(),
  lastName: z.string().min(1, 'Last name is required').optional(),
  title: z.enum(titles).nullable().optional(),
  phone: optionalPhone,
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});

export type CreateClinicInput = z.infer<typeof createClinicSchema>;
export type CreateClinicWithBranchesInput = z.infer<typeof createClinicWithBranchesSchema>;
export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateClinicInput = z.infer<typeof updateClinicSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
export type AccountType = (typeof accountTypes)[number];
