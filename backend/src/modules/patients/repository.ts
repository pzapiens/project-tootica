import { prisma } from '../../common/db/prisma';
import { nextPatientCode } from '../../common/utils/codes';
import type { CreatePatientInput, UpdatePatientInput } from './schema';

// Every query is scoped by clinicId so one tenant can never read or mutate
// another tenant's rows.
export const patientRepository = {
  findMany: (clinicId: string) =>
    prisma.patient.findMany({ where: { clinicId }, orderBy: { createdAt: 'desc' } }),

  findById: (clinicId: string, id: string) =>
    prisma.patient.findFirst({ where: { id, clinicId } }),

  create: async (clinicId: string, data: CreatePatientInput) =>
    prisma.patient.create({ data: { ...data, clinicId, code: await nextPatientCode() } }),

  update: (clinicId: string, id: string, data: UpdatePatientInput) =>
    prisma.patient.updateMany({ where: { id, clinicId }, data }),

  // Deleting a patient also removes their appointments (the Appointment→Patient
  // relation has no DB-level cascade), so do both atomically. The patient
  // delete's `count` still drives the 404 check in the service.
  remove: (clinicId: string, id: string) =>
    prisma.$transaction(async (tx) => {
      await tx.appointment.deleteMany({ where: { patientId: id, clinicId } });
      return tx.patient.deleteMany({ where: { id, clinicId } });
    }),
};
