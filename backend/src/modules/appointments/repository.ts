import { prisma } from '../../common/db/prisma';
import { nextAppointmentCode, nextPatientCode } from '../../common/utils/codes';
import type {
  CreateAppointmentData,
  ListAppointmentsQuery,
  UpdateAppointmentInput,
} from './schema';

/** Digits-only form of a phone number, for tolerant matching (ignores +, spaces). */
const digitsOf = (phone: string): string => phone.replace(/\D/g, '');

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
  // Each payment's paid flag — the list derives the row's payment-status glyph
  // (any payments? all paid?) from these without a separate query.
  payments: { select: { paid: true } },
} as const;

export const appointmentRepository = {
  // `branchId` partitions the list to one branch: appointments have no branch
  // column, so we scope them through their doctor's branch. Doctor-less
  // appointments (pending WhatsApp bookings, and the date-&-time flow's
  // unassigned bookings) belong to no branch, so they surface in every branch's
  // view — otherwise the branch-scoped appointments page (and its "WhatsApp
  // Appointments" popup) would never see a pending WhatsApp booking to triage.
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
        ...(branchId ? { OR: [{ doctor: { branchId } }, { doctorId: null }] } : {}),
      },
      orderBy: { startTime: 'desc' },
      take: query.limit ?? 100,
      include: listInclude,
    });
  },

  findById: (clinicId: string, id: string) =>
    prisma.appointment.findFirst({ where: { id, clinicId } }),

  // `assignCode: false` creates a code-less appointment — used for pending
  // WhatsApp bookings, which only claim a sequential code when accepted (so a
  // rejected request never burns a number). Defaults to assigning one.
  create: async (
    clinicId: string,
    data: CreateAppointmentData,
    opts: { assignCode?: boolean } = {},
  ) => {
    const code = opts.assignCode === false ? null : await nextAppointmentCode(clinicId);
    return prisma.appointment.create({ data: { ...data, clinicId, code } });
  },

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

  // Accepts an optional `code` alongside the editable fields so the service can
  // mint one when a pending WhatsApp booking is accepted (see service.update).
  update: (clinicId: string, id: string, data: UpdateAppointmentInput & { code?: string }) =>
    prisma.appointment.updateMany({ where: { id, clinicId }, data }),

  remove: (clinicId: string, id: string) =>
    prisma.appointment.deleteMany({ where: { id, clinicId } }),

  /**
   * Find-or-create a patient by phone within a clinic — used by the inbound
   * WhatsApp booking, where the sender is identified only by their number.
   * Matching is digits-only so "+91 99999 99999" and "9999999999" resolve to the
   * same patient. A new patient is created with a generated code when unmatched.
   */
  findOrCreatePatientByPhone: async (
    clinicId: string,
    phone: string,
    fallback: { name?: string; email?: string },
  ) => {
    const digits = digitsOf(phone);
    const candidates = await prisma.patient.findMany({
      where: { clinicId, phone: { not: null } },
      select: { id: true, phone: true },
    });
    const match = candidates.find((p) => p.phone && digitsOf(p.phone) === digits);
    if (match) return match.id;

    const created = await prisma.patient.create({
      data: {
        clinicId,
        code: await nextPatientCode(clinicId),
        // A WhatsApp lead we haven't met yet: label with the number until staff
        // fill in the real name from the chat.
        name: fallback.name?.trim() || `WhatsApp ${phone}`,
        phone,
        email: fallback.email,
      },
      select: { id: true },
    });
    return created.id;
  },
};
