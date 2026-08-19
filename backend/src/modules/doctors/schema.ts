import { z } from 'zod';

export const createDoctorSchema = z.object({
  // Links to an existing auth user (see users table). The auth step will
  // typically create the user and doctor profile together.
  userId: z.string().min(1),
  specialization: z.string().optional(),
  licenseNumber: z.string().optional(),
  phone: z.string().optional(),
  bio: z.string().optional(),
});

export const updateDoctorSchema = createDoctorSchema.omit({ userId: true }).partial();

export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;
export type UpdateDoctorInput = z.infer<typeof updateDoctorSchema>;
