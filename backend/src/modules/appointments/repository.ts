import { prisma } from '../../common/db/prisma';
import { nextAppointmentCode } from '../../common/utils/codes';
import type {
  CreateAppointmentData,
  ListAppointmentsQuery,
  UpdateAppointmentInput,
} from './schema';

// Bookings that occupy a slot — cancellations and no-shows free it up.
const BLOCKING_STATUSES = ['SCHEDULED', 'CONFIRMED', 'COMPLETED'] as const;

// Join the patient + doctor (with the doctor's user name) so the list can show
// human-readable rows without extra round-trips.
const listInclude = {
  patient: {
    select: { id: true, code: true, name: true, phone: true, email: true, dob: true, gender: true },
  },
  doctor: {
    select: {
      id: true,
      specialization: true,
      user: { select: { firstName: true, lastName: true } },
    },
  },
} as const;

export const appointmentRepository = {
  // `branchId` partitions the list to one branch: appointments have no branch
  // column, so we scope them through their doctor's branch.
  findMany: (clinicId: string, query: ListAppointmentsQuery = {}, branchId?: string) => {
    const startTime =
      query.from || query.to ? { gte: query.from, lte: query.to } : undefined;
    // Normalise the status filter (single or several) into a Prisma `in` clause.
    const statusList = query.status
      ? Array.isArray(query.status)
        ? query.status
        : [query.status]
      : undefined;
    return prisma.appointment.findMany({
      where: {
        clinicId,
        startTime,
        status: statusList ? { in: statusList } : undefined,
        ...(branchId ? { doctor: { branchId } } : {}),
      },
      orderBy: { startTime: 'desc' },
      take: query.limit ?? 100,
      include: listInclude,
    });
  },

  findById: (clinicId: string, id: string) =>
    prisma.appointment.findFirst({ where: { id, clinicId } }),

  create: async (clinicId: string, data: CreateAppointmentData) =>
    prisma.appointment.create({
      data: { ...data, clinicId, code: await nextAppointmentCode(data.startTime) },
    }),

  /** The clinic's doctors (optionally a single one / one branch), with names. */
  findClinicDoctors: (clinicId: string, doctorId?: string, branchId?: string) =>
    prisma.doctor.findMany({
      where: {
        clinicId,
        ...(doctorId ? { id: doctorId } : {}),
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        specialization: true,
        user: { select: { firstName: true, lastName: true } },
      },
    }),

  /** Active (slot-occupying) appointments for the given doctors on one day.
   *  `excludeId` drops one appointment (the one being edited) from the results. */
  findDayAppointments: (
    clinicId: string,
    doctorIds: string[],
    dayStart: Date,
    dayEnd: Date,
    excludeId?: string,
  ) =>
    prisma.appointment.findMany({
      where: {
        clinicId,
        doctorId: { in: doctorIds },
        startTime: { gte: dayStart, lte: dayEnd },
        status: { in: [...BLOCKING_STATUSES] },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      orderBy: { startTime: 'asc' },
      select: {
        doctorId: true,
        startTime: true,
        endTime: true,
        patient: { select: { name: true } },
      },
    }),

  /** First active appointment for a doctor overlapping [start, end), if any. */
  findOverlappingForDoctor: (clinicId: string, doctorId: string, start: Date, end: Date) =>
    prisma.appointment.findFirst({
      where: {
        clinicId,
        doctorId,
        status: { in: [...BLOCKING_STATUSES] },
        startTime: { lt: end },
        endTime: { gt: start },
      },
    }),

  update: (clinicId: string, id: string, data: UpdateAppointmentInput) =>
    prisma.appointment.updateMany({ where: { id, clinicId }, data }),

  remove: (clinicId: string, id: string) =>
    prisma.appointment.deleteMany({ where: { id, clinicId } }),
};
