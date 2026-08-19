import { prisma } from '../../common/db/prisma';
import type { CreateAppointmentInput, UpdateAppointmentInput } from './schema';

export const appointmentRepository = {
  findMany: (clinicId: string) =>
    prisma.appointment.findMany({ where: { clinicId }, orderBy: { startTime: 'asc' } }),

  findById: (clinicId: string, id: string) =>
    prisma.appointment.findFirst({ where: { id, clinicId } }),

  create: (clinicId: string, data: CreateAppointmentInput) =>
    prisma.appointment.create({ data: { ...data, clinicId } }),

  update: (clinicId: string, id: string, data: UpdateAppointmentInput) =>
    prisma.appointment.updateMany({ where: { id, clinicId }, data }),

  remove: (clinicId: string, id: string) =>
    prisma.appointment.deleteMany({ where: { id, clinicId } }),
};
