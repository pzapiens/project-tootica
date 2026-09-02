/**
 * Appointment seed — 30 appointments per clinic on distinct past dates.
 *
 *   npm run db:seed:appointments
 *
 * For every clinic it:
 *   - tops up a small pool of patients (appointments need a patient FK),
 *   - deletes that clinic's existing appointments,
 *   - creates 30 appointments on 30 distinct dates, all on or before the LAST
 *     day of the previous month (nothing in the current month), spread over the
 *     preceding ~6 months.
 *
 * Uses a seeded RNG so re-runs — and runs on another machine — produce the exact
 * same data. Refuses to run when NODE_ENV=production.
 */
import { nextAppointmentCode, nextPatientCode } from '../src/common/utils/codes';
import { prisma } from '../src/common/db/prisma';
import type { AppointmentStatus } from '../src/generated/prisma/enums';

const APPOINTMENTS_PER_CLINIC = 30;
const MIN_PATIENTS_PER_CLINIC = 10;
const WINDOW_MONTHS = 6; // how far back the date window reaches

// --- deterministic RNG (mulberry32) -----------------------------------------
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = makeRng(20260830);
const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
const randInt = (min: number, max: number): number => min + Math.floor(rng() * (max - min + 1));

// --- data pools -------------------------------------------------------------
const PATIENT_NAMES: Array<[string, string]> = [
  ['James', 'Carter'], ['Emma', 'Thompson'], ['William', 'Garcia'], ['Charlotte', 'Kim'],
  ['Benjamin', 'Silva'], ['Amelia', 'Johnson'], ['Lucas', 'Brown'], ['Harper', 'Davis'],
  ['Henry', 'Walsh'], ['Evelyn', 'Wilson'], ['Alexander', 'Moore'], ['Abigail', 'Taylor'],
  ['Daniel', 'Anderson'], ['Emily', 'Thomas'], ['Michael', 'Reyes'], ['Grace', 'Patel'],
  ['Samuel', 'Nguyen'], ['Chloe', 'Martin'], ['David', 'Lopez'], ['Sofia', 'Rossi'],
];
const MEDICAL_NOTES = [
  'No known allergies', 'Penicillin allergy', 'Hypertension — monitor before anaesthetic',
  'Type 2 diabetic', 'Nut allergy', null,
];
// Past appointments: mostly completed, some missed / cancelled.
const STATUS_WEIGHTS: Array<[AppointmentStatus, number]> = [
  ['COMPLETED', 68], ['NO_SHOW', 14], ['CANCELLED', 14], ['CONFIRMED', 4],
];
const APPOINTMENT_NOTES: Record<AppointmentStatus, string[]> = {
  COMPLETED: ['Routine check-up', 'Scaling & polishing', 'Filling', 'Follow-up review', 'Root canal — session complete'],
  NO_SHOW: ['Patient did not attend', 'No show — did not call'],
  CANCELLED: ['Cancelled by patient', 'Rescheduled — cancelled slot'],
  CONFIRMED: ['Consultation', 'Whitening consultation'],
  SCHEDULED: ['Consultation'],
};

function weightedStatus(): AppointmentStatus {
  const total = STATUS_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng() * total;
  for (const [status, w] of STATUS_WEIGHTS) {
    roll -= w;
    if (roll <= 0) return status;
  }
  return 'COMPLETED';
}

let patientCursor = 0;

/** Inclusive list of every date from `start` to `end` (local midnight). */
function daysBetween(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (d <= end) {
    out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Pick `count` distinct entries from `arr` (Fisher–Yates on a copy). */
function sampleDistinct<T>(arr: T[], count: number): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(count, copy.length));
}

async function ensurePatients(clinicId: string, target: number): Promise<Array<{ id: string }>> {
  const existing = await prisma.patient.findMany({ where: { clinicId }, select: { id: true } });
  const toCreate = Math.max(0, target - existing.length);
  const created: Array<{ id: string }> = [];
  for (let i = 0; i < toCreate; i++) {
    const [first, last] = PATIENT_NAMES[patientCursor % PATIENT_NAMES.length];
    patientCursor++;
    const patient = await prisma.patient.create({
      data: {
        clinicId,
        code: await nextPatientCode(),
        name: `${first} ${last}`,
        email: `${first}.${last}${patientCursor}@example.com`.toLowerCase(),
        phone: `+9198${String(10000000 + patientCursor * 7).slice(-8)}`,
        dob: new Date(Date.UTC(1965 + ((patientCursor * 3) % 45), patientCursor % 12, 1 + (patientCursor % 27))),
        medicalNotes: MEDICAL_NOTES[patientCursor % MEDICAL_NOTES.length],
        createdAt: new Date(Date.UTC(2024, 0, 1)),
      },
    });
    created.push({ id: patient.id });
  }
  return [...existing, ...created];
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed appointments with NODE_ENV=production');
  }

  // Date window: from ~WINDOW_MONTHS ago up to the LAST day of last month.
  const now = new Date();
  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endPrevMonth = new Date(firstOfThisMonth.getTime() - 24 * 60 * 60 * 1000);
  const windowStart = new Date(endPrevMonth.getFullYear(), endPrevMonth.getMonth() - WINDOW_MONTHS + 1, 1);
  const candidateDays = daysBetween(windowStart, endPrevMonth);

  const clinics = await prisma.clinic.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, name: true } });
  if (clinics.length === 0) {
    throw new Error('No clinics found — run `npm run db:provision` first.');
  }

  let grandTotal = 0;
  for (const clinic of clinics) {
    const doctors = await prisma.doctor.findMany({ where: { clinicId: clinic.id }, select: { id: true } });
    if (doctors.length === 0) {
      console.warn(`  ! ${clinic.name}: no doctors — skipping.`);
      continue;
    }

    const patients = await ensurePatients(clinic.id, MIN_PATIENTS_PER_CLINIC);

    // Fresh slate for this clinic's appointments.
    await prisma.appointment.deleteMany({ where: { clinicId: clinic.id } });

    // 30 distinct dates within the window.
    const dates = sampleDistinct(candidateDays, APPOINTMENTS_PER_CLINIC);
    for (const day of dates) {
      const hour = randInt(9, 16);
      const minute = pick([0, 30]);
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0, 0);
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      const status = weightedStatus();
      await prisma.appointment.create({
        data: {
          clinicId: clinic.id,
          code: await nextAppointmentCode(start),
          patientId: pick(patients).id,
          doctorId: pick(doctors).id,
          startTime: start,
          endTime: end,
          status,
          notes: pick(APPOINTMENT_NOTES[status]),
          createdAt: start,
        },
      });
      grandTotal += 1;
    }

    console.log(`  ${clinic.name}: ${dates.length} appointments (${patients.length} patients)`);
  }

  console.log(`\nDone. ${grandTotal} appointments across ${clinics.length} clinics.`);
  console.log(`Window: ${windowStart.toDateString()} → ${endPrevMonth.toDateString()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
