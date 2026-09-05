import { HttpError } from '../../common/utils/httpError';
import { appointmentRepository } from './repository';
import type {
  AvailabilityQuery,
  CreateAppointmentInput,
  ListAppointmentsQuery,
  UpdateAppointmentInput,
} from './schema';

// Clinic business hours, in minutes-from-midnight (09:00–18:00, local time).
const OPEN_MIN = 9 * 60;
const CLOSE_MIN = 18 * 60;

// Clinic breaks shown on the availability chart. Fixed lunch (13:00–14:00) for
// now; could become per-clinic/-doctor later.
const BREAKS = [{ start: '13:00', end: '14:00', label: 'Lunch' }];

const pad2 = (n: number) => String(n).padStart(2, '0');
/** Local minutes-from-midnight of a Date (server tz == clinic tz assumption). */
const minutesOfDay = (d: Date): number => d.getHours() * 60 + d.getMinutes();
/** Local "HH:mm" of a Date. */
const hhmm = (d: Date): string => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
/** "HH:mm" → minutes-from-midnight. */
const toMinutes = (hm: string): number => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};
/** minutes-from-midnight → "h:mm AM" (for user-facing messages). */
const to12h = (min: number): string => {
  const h24 = Math.floor(min / 60);
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h = h24 % 12 || 12;
  return `${h}:${pad2(min % 60)} ${period}`;
};

// Break windows in minutes-from-midnight, for overlap checks.
const BREAK_WINDOWS = BREAKS.map((b) => ({
  start: toMinutes(b.start),
  end: toMinutes(b.end),
  label: b.label,
}));
/** The clinic break a [from,to) slot overlaps, or null if it's clear. */
const overlappingBreak = (fromMin: number, toMin: number) =>
  BREAK_WINDOWS.find((b) => b.start < toMin && b.end > fromMin) ?? null;

type ListRow = Awaited<ReturnType<typeof appointmentRepository.findMany>>[number];

/** Flatten the joined patient/doctor into the shape the dashboard table uses. */
function toListItem(row: ListRow) {
  const doctorName = [row.doctor.user.firstName, row.doctor.user.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  return {
    id: row.id,
    code: row.code,
    startTime: row.startTime,
    endTime: row.endTime,
    status: row.status,
    consultationType: row.consultationType,
    sourceOfEnquiry: row.sourceOfEnquiry,
    notes: row.notes,
    patient: {
      id: row.patient.id,
      code: row.patient.code,
      name: row.patient.name,
      phone: row.patient.phone,
      email: row.patient.email,
      dob: row.patient.dob,
      gender: row.patient.gender,
    },
    doctor: {
      id: row.doctor.id,
      name: doctorName || null,
      specialization: row.doctor.specialization,
    },
  };
}

export const appointmentService = {
  list: async (clinicId: string, query: ListAppointmentsQuery = {}, branchId?: string) => {
    const rows = await appointmentRepository.findMany(clinicId, query, branchId);
    return rows.map(toListItem);
  },

  get: async (clinicId: string, id: string) => {
    const appointment = await appointmentRepository.findById(clinicId, id);
    if (!appointment) {
      throw new HttpError(404, 'Appointment not found');
    }
    return appointment;
  },

  /**
   * Availability for the clinic's doctors on a date. When `from`/`to` are given,
   * each doctor also gets an `available` flag (within business hours AND no
   * overlapping booking); otherwise it just returns the day's bookings.
   */
  availability: async (clinicId: string, query: AvailabilityQuery, branchId?: string) => {
    const [y, m, d] = query.date.split('-').map(Number);
    const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
    const dayEnd = new Date(y, m - 1, d, 23, 59, 59, 999);

    const fromMin = query.from ? toMinutes(query.from) : null;
    const toMin = query.to ? toMinutes(query.to) : null;
    const hasSlot = fromMin !== null && toMin !== null;
    const withinHours = hasSlot
      ? fromMin >= OPEN_MIN && toMin <= CLOSE_MIN && fromMin < toMin
      : null;

    const doctors = await appointmentRepository.findClinicDoctors(
      clinicId,
      query.doctorId,
      branchId,
    );
    const ids = doctors.map((doc) => doc.id);
    const appts = ids.length
      ? await appointmentRepository.findDayAppointments(
          clinicId,
          ids,
          dayStart,
          dayEnd,
          query.excludeAppointmentId,
        )
      : [];

    return {
      businessHours: { open: '09:00', close: '18:00' },
      breaks: BREAKS,
      date: query.date,
      withinHours,
      doctors: doctors.map((doc) => {
        const bookings = appts
          .filter((a) => a.doctorId === doc.id)
          .map((a) => ({
            start: hhmm(a.startTime),
            end: hhmm(a.endTime),
            patientName: a.patient.name,
          }));
        let available: boolean | null = null;
        let reason: 'outside-hours' | 'conflict' | 'break' | null = null;
        if (hasSlot) {
          if (!withinHours) {
            available = false;
            reason = 'outside-hours';
          } else if (overlappingBreak(fromMin!, toMin!)) {
            available = false;
            reason = 'break';
          } else {
            const conflict = bookings.some(
              (b) => toMinutes(b.start) < toMin! && toMinutes(b.end) > fromMin!,
            );
            available = !conflict;
            reason = conflict ? 'conflict' : null;
          }
        }
        return {
          id: doc.id,
          name: [doc.user.firstName, doc.user.lastName].filter(Boolean).join(' ').trim() || null,
          specialization: doc.specialization,
          bookings,
          available,
          reason,
        };
      }),
    };
  },

  create: async (clinicId: string, input: CreateAppointmentInput) => {
    const { nonMandatory, ...data } = input;
    // Unless the appointment is flagged non-mandatory, enforce that it's within
    // business hours AND the doctor isn't already booked in that window.
    if (!nonMandatory) {
      const fromMin = minutesOfDay(data.startTime);
      const toMin = minutesOfDay(data.endTime);
      if (fromMin < OPEN_MIN || toMin > CLOSE_MIN) {
        throw new HttpError(
          400,
          'Appointment must be within business hours (9:00 AM–6:00 PM). Tick "Skip time & availability check" to book outside hours.',
        );
      }
      const br = overlappingBreak(fromMin, toMin);
      if (br) {
        throw new HttpError(
          400,
          `This time falls within the clinic ${br.label.toLowerCase()} break (${to12h(br.start)}–${to12h(br.end)}). Tick "Skip time & availability check" to book anyway.`,
        );
      }
      const clash = await appointmentRepository.findOverlappingForDoctor(
        clinicId,
        data.doctorId,
        data.startTime,
        data.endTime,
      );
      if (clash) {
        throw new HttpError(
          409,
          'The selected doctor already has an appointment in this time range.',
        );
      }
    }
    return appointmentRepository.create(clinicId, data);
  },

  update: async (clinicId: string, id: string, data: UpdateAppointmentInput) => {
    const { count } = await appointmentRepository.update(clinicId, id, data);
    if (count === 0) {
      throw new HttpError(404, 'Appointment not found');
    }
    return appointmentService.get(clinicId, id);
  },

  remove: async (clinicId: string, id: string) => {
    const { count } = await appointmentRepository.remove(clinicId, id);
    if (count === 0) {
      throw new HttpError(404, 'Appointment not found');
    }
  },
};
