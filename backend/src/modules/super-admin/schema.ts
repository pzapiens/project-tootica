import { z } from 'zod';

export const clinicPlans = ['FREE', 'BASIC', 'PRO', 'ENTERPRISE'] as const;
export const clinicStatuses = ['ACTIVE', 'SUSPENDED', 'INACTIVE'] as const;

export const createClinicSchema = z.object({
  name: z.string().min(1),
  plan: z.enum(clinicPlans).optional(),
  status: z.enum(clinicStatuses).optional(),
});

export const updateClinicSchema = createClinicSchema.partial();

export type CreateClinicInput = z.infer<typeof createClinicSchema>;
export type UpdateClinicInput = z.infer<typeof updateClinicSchema>;
