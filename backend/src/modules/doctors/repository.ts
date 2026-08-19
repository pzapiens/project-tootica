import { prisma } from '../../common/db/prisma';
import type { CreateDoctorInput, UpdateDoctorInput } from './schema';

export const doctorRepository = {
  findMany: (clinicId: string) =>
    prisma.doctor.findMany({ where: { clinicId }, orderBy: { createdAt: 'desc' } }),

  findById: (clinicId: string, id: string) =>
    prisma.doctor.findFirst({ where: { id, clinicId } }),

  create: (clinicId: string, data: CreateDoctorInput) =>
    prisma.doctor.create({ data: { ...data, clinicId } }),

  update: (clinicId: string, id: string, data: UpdateDoctorInput) =>
    prisma.doctor.updateMany({ where: { id, clinicId }, data }),

  remove: (clinicId: string, id: string) =>
    prisma.doctor.deleteMany({ where: { id, clinicId } }),
};
