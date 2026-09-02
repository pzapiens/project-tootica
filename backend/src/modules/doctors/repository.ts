import { prisma } from '../../common/db/prisma';
import { nextDoctorCode } from '../../common/utils/codes';
import type { CreateDoctorInput, UpdateDoctorInput } from './schema';

// Include the linked user's name so the list can show a human-readable doctor,
// plus the branch the doctor is assigned to.
const withUserName = {
  user: { select: { title: true, firstName: true, lastName: true } },
  branch: { select: { id: true, code: true, name: true } },
} as const;

export const doctorRepository = {
  // `branchId` partitions the list to a single branch; undefined = clinic-wide.
  findMany: (clinicId: string, branchId?: string) =>
    prisma.doctor.findMany({
      where: { clinicId, ...(branchId ? { branchId } : {}) },
      orderBy: { createdAt: 'desc' },
      include: withUserName,
    }),

  findById: (clinicId: string, id: string) =>
    prisma.doctor.findFirst({ where: { id, clinicId } }),

  create: async (clinicId: string, data: CreateDoctorInput) =>
    prisma.doctor.create({ data: { ...data, clinicId, code: await nextDoctorCode() } }),

  update: (clinicId: string, id: string, data: UpdateDoctorInput) =>
    prisma.doctor.updateMany({ where: { id, clinicId }, data }),

  remove: (clinicId: string, id: string) =>
    prisma.doctor.deleteMany({ where: { id, clinicId } }),
};
