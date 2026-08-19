import { prisma } from '../../common/db/prisma';
import type { CreatePatientInput, UpdatePatientInput } from './schema';

// Every query is scoped by clinicId so one tenant can never read or mutate
// another tenant's rows.
export const patientRepository = {
  findMany: (clinicId: string) =>
    prisma.patient.findMany({ where: { clinicId }, orderBy: { createdAt: 'desc' } }),

  findById: (clinicId: string, id: string) =>
    prisma.patient.findFirst({ where: { id, clinicId } }),

  create: (clinicId: string, data: CreatePatientInput) =>
    prisma.patient.create({ data: { ...data, clinicId } }),

  update: (clinicId: string, id: string, data: UpdatePatientInput) =>
    prisma.patient.updateMany({ where: { id, clinicId }, data }),

  remove: (clinicId: string, id: string) =>
    prisma.patient.deleteMany({ where: { id, clinicId } }),
};
