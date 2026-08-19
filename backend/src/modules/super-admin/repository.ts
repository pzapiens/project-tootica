import { prisma } from '../../common/db/prisma';
import type { CreateClinicInput, UpdateClinicInput } from './schema';

// Super-admin operates across all tenants, so these queries are intentionally
// NOT scoped by clinicId.
export const superAdminRepository = {
  findClinics: () => prisma.clinic.findMany({ orderBy: { createdAt: 'desc' } }),

  findClinicById: (id: string) => prisma.clinic.findUnique({ where: { id } }),

  createClinic: (data: CreateClinicInput) => prisma.clinic.create({ data }),

  updateClinic: (id: string, data: UpdateClinicInput) =>
    prisma.clinic.update({ where: { id }, data }),

  removeClinic: (id: string) => prisma.clinic.delete({ where: { id } }),
};
