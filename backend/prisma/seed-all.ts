/**
 * Complete, one-command seed — the whole database from empty.
 *
 *   npm run db:seed:all
 *
 * Hand this to a teammate setting up a fresh machine: after `npm install` +
 * `npm run db:migrate:deploy`, this single script fills EVERY table with a
 * coherent, deterministic dataset:
 *
 *   - 1 Super Admin (no clinic)
 *   - 2 Clinics, each: 1 Client Admin + 2 Branches
 *       · per branch: 1 Doctor (+ doctor profile + weekly shifts) + 1 Receptionist
 *         (the receptionist is the branch's person-in-charge)
 *   - Patients per clinic
 *   - Appointments per clinic spread across the PAST 6 months, a handful for
 *     TODAY, and some UPCOMING — so the dashboard's "Today's Appointments", the
 *     stat cards, and the full calendar all have data on first login.
 *
 * Every account is created "already onboarded" (known password, no forced
 * first-login reset, Terms pre-accepted). The credentials match docs/ACCOUNTS.md.
 * Deterministic: a seeded RNG means re-runs (and runs on another machine)
 * produce the identical dataset. Wipes ALL existing data first. Refuses to run
 * when NODE_ENV=production.
 */
import {
  nextAppointmentCode,
  nextBranchCode,
  nextClinicCode,
  nextDoctorCode,
  nextPatientCode,
} from '../src/common/utils/codes';
import { hashPassword } from '../src/common/utils/password.util';
import { prisma } from '../src/common/db/prisma';
import type { AppointmentStatus, ClinicPlan } from '../src/generated/prisma/enums';

// --- credentials (documented in docs/ACCOUNTS.md) ---------------------------
const SUPER_ADMIN_PASSWORD = 'SuperAdmin@123';
const STAFF_PASSWORD = 'Password@123';

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
const rng = makeRng(20260903);
const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
const randInt = (min: number, max: number): number => min + Math.floor(rng() * (max - min + 1));

/** Pick `count` distinct entries from `arr` (Fisher–Yates on a copy). */
function sampleDistinct<T>(arr: T[], count: number): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(count, copy.length));
}

// ---------------------------------------------------------------------------
// Structure — clinics, branches and their staff
// ---------------------------------------------------------------------------
interface PersonDef {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  specialization?: string; // doctor-only
}
interface BranchDef {
  name: string;
  doctor: PersonDef;
  receptionist: PersonDef;
}
interface ClinicDef {
  name: string;
  plan: ClinicPlan;
  admin: PersonDef;
  branches: BranchDef[];
}

const SUPER_ADMIN = {
  firstName: 'System',
  lastName: 'Administrator',
  email: 'superadmin@tootica.com',
  phone: '+919000000001',
};

const CLINICS: ClinicDef[] = [
  {
    name: 'Bright Smile Dental',
    plan: 'PRO',
    admin: {
      firstName: 'Sanjay',
      lastName: 'Kapoor',
      email: 'admin@brightsmile.com',
      phone: '+919000000010',
    },
    branches: [
      {
        name: 'Downtown',
        doctor: {
          firstName: 'Olivia',
          lastName: 'Bennett',
          email: 'olivia.bennett@brightsmile.com',
          phone: '+919000000011',
          specialization: 'General Dentistry',
        },
        receptionist: {
          firstName: 'Riya',
          lastName: 'Sharma',
          email: 'reception.downtown@brightsmile.com',
          phone: '+919000000012',
        },
      },
      {
        name: 'Uptown',
        doctor: {
          firstName: 'Marcus',
          lastName: 'Reed',
          email: 'marcus.reed@brightsmile.com',
          phone: '+919000000013',
          specialization: 'Orthodontics',
        },
        receptionist: {
          firstName: 'Neha',
          lastName: 'Verma',
          email: 'reception.uptown@brightsmile.com',
          phone: '+919000000014',
        },
      },
    ],
  },
  {
    name: 'Gentle Care Dentistry',
    plan: 'BASIC',
    admin: {
      firstName: 'Maya',
      lastName: 'Iyer',
      email: 'admin@gentlecare.com',
      phone: '+919000000020',
    },
    branches: [
      {
        name: 'Central',
        doctor: {
          firstName: 'Sophia',
          lastName: 'Nguyen',
          email: 'sophia.nguyen@gentlecare.com',
          phone: '+919000000021',
          specialization: 'Endodontics',
        },
        receptionist: {
          firstName: 'Pooja',
          lastName: 'Menon',
          email: 'reception.central@gentlecare.com',
          phone: '+919000000022',
        },
      },
      {
        name: 'Riverside',
        doctor: {
          firstName: 'Ethan',
          lastName: 'Okafor',
          email: 'ethan.okafor@gentlecare.com',
          phone: '+919000000023',
          specialization: 'Periodontics',
        },
        receptionist: {
          firstName: 'Arjun',
          lastName: 'Rao',
          email: 'reception.riverside@gentlecare.com',
          phone: '+919000000024',
        },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Data pools — patients + appointments
// ---------------------------------------------------------------------------
const PATIENT_NAMES: Array<[string, string]> = [
  ['James', 'Carter'], ['Emma', 'Thompson'], ['William', 'Garcia'], ['Charlotte', 'Kim'],
  ['Benjamin', 'Silva'], ['Amelia', 'Johnson'], ['Lucas', 'Brown'], ['Harper', 'Davis'],
  ['Henry', 'Walsh'], ['Evelyn', 'Wilson'], ['Alexander', 'Moore'], ['Abigail', 'Taylor'],
  ['Daniel', 'Anderson'], ['Emily', 'Thomas'], ['Michael', 'Reyes'], ['Grace', 'Patel'],
  ['Samuel', 'Nguyen'], ['Chloe', 'Martin'], ['David', 'Lopez'], ['Sofia', 'Rossi'],
  ['Abhishek', 'T K'], ['Priya', 'Nair'], ['Rohan', 'Gupta'], ['Ananya', 'Desai'],
];
const MEDICAL_NOTES = [
  'No known allergies', 'Penicillin allergy', 'Hypertension — monitor before anaesthetic',
  'Type 2 diabetic', 'Nut allergy', null,
];
const CONSULTATION_TYPES = [
  'Routine Check-up', 'Scaling & Polishing', 'Cavity Filling', 'Root Canal',
  'Teeth Whitening', 'Braces Consultation', 'Dental Implant', 'Extraction',
];
const SOURCES = ['Google Search', 'Referral', 'Walk-in', 'Instagram', 'Facebook'];

// Weighted status for PAST appointments (mostly done, some missed / cancelled).
const PAST_STATUS_WEIGHTS: Array<[AppointmentStatus, number]> = [
  ['COMPLETED', 68], ['NO_SHOW', 14], ['CANCELLED', 14], ['CONFIRMED', 4],
];
function weightedPastStatus(): AppointmentStatus {
  const total = PAST_STATUS_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng() * total;
  for (const [status, w] of PAST_STATUS_WEIGHTS) {
    roll -= w;
    if (roll <= 0) return status;
  }
  return 'COMPLETED';
}

// Bookable slots within business hours (9–18), avoiding the 12:00–14:00 lunch.
// [hour, minute, durationMinutes]
const SLOTS: Array<[number, number, number]> = [
  [9, 0, 30], [9, 30, 30], [10, 0, 60], [11, 0, 30], [11, 30, 30],
  [14, 0, 60], [15, 0, 30], [15, 30, 30], [16, 0, 60], [17, 0, 30],
];

const HISTORICAL_APPTS = 24; // distinct past days per clinic
const TODAY_APPTS = 4; // per clinic, distinct slots
const UPCOMING_APPTS = 8; // distinct future days per clinic
const PATIENTS_PER_CLINIC = 12;
const WINDOW_MONTHS = 6;

// Every account is ready to log in immediately.
const onboarded = { mustResetPassword: false, termsAcceptedAt: new Date() } as const;

// --- helpers ----------------------------------------------------------------

async function wipe(): Promise<void> {
  // FK-safe order. User.branchId → Branch and Branch.picUserId → User form a
  // cycle, so first null out every branch's PIC to break it, then delete users
  // (they reference branches) before the branches themselves.
  await prisma.appointment.deleteMany();
  await prisma.doctorShift.deleteMany();
  await prisma.doctor.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.branch.updateMany({ data: { picUserId: null } });
  await prisma.user.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.clinic.deleteMany();
  // Reset the display-code counters so a fresh seed starts at CL-000001 etc.
  await prisma.counter.deleteMany();
}

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

let patientCursor = 0;
async function createPatients(clinicId: string, count: number): Promise<Array<{ id: string }>> {
  const created: Array<{ id: string }> = [];
  for (let i = 0; i < count; i++) {
    const [first, last] = PATIENT_NAMES[patientCursor % PATIENT_NAMES.length];
    patientCursor++;
    const patient = await prisma.patient.create({
      data: {
        clinicId,
        code: await nextPatientCode(),
        name: `${first} ${last}`,
        email: `${first}.${last}${patientCursor}@example.com`.replace(/\s+/g, '').toLowerCase(),
        phone: `+9198${String(10000000 + patientCursor * 7).slice(-8)}`,
        gender: pick(['M', 'F']),
        dob: new Date(Date.UTC(1965 + ((patientCursor * 3) % 45), patientCursor % 12, 1 + (patientCursor % 27))),
        medicalNotes: MEDICAL_NOTES[patientCursor % MEDICAL_NOTES.length],
        createdAt: new Date(Date.UTC(2024, 0, 1)),
      },
    });
    created.push({ id: patient.id });
  }
  return created;
}

/** Weekly availability: Mon–Fri 09:00–18:00, Sat 09:00–13:00. */
async function createShifts(doctorId: string, clinicId: string): Promise<void> {
  const weekday = { startTime: '09:00', endTime: '18:00' };
  const saturday = { startTime: '09:00', endTime: '13:00' };
  const days = [
    { dayOfWeek: 1, ...weekday },
    { dayOfWeek: 2, ...weekday },
    { dayOfWeek: 3, ...weekday },
    { dayOfWeek: 4, ...weekday },
    { dayOfWeek: 5, ...weekday },
    { dayOfWeek: 6, ...saturday },
  ];
  await prisma.doctorShift.createMany({
    data: days.map((d) => ({ doctorId, clinicId, ...d })),
  });
}

interface CreatedAppt {
  date: Date;
  slot: [number, number, number];
  status: AppointmentStatus;
}
async function createAppointment(
  clinicId: string,
  doctorIds: string[],
  patientIds: string[],
  appt: CreatedAppt,
): Promise<void> {
  const [h, m, dur] = appt.slot;
  const start = new Date(appt.date.getFullYear(), appt.date.getMonth(), appt.date.getDate(), h, m, 0, 0);
  const end = new Date(start.getTime() + dur * 60 * 1000);
  await prisma.appointment.create({
    data: {
      clinicId,
      code: await nextAppointmentCode(start),
      patientId: pick(patientIds),
      doctorId: pick(doctorIds),
      startTime: start,
      endTime: end,
      status: appt.status,
      consultationType: pick(CONSULTATION_TYPES),
      sourceOfEnquiry: pick(SOURCES),
      createdAt: start,
    },
  });
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed with NODE_ENV=production');
  }

  await wipe();

  const staffHash = await hashPassword(STAFF_PASSWORD);
  const superHash = await hashPassword(SUPER_ADMIN_PASSWORD);

  // 1 Super Admin (no clinic).
  await prisma.user.create({
    data: {
      email: SUPER_ADMIN.email,
      passwordHash: superHash,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      firstName: SUPER_ADMIN.firstName,
      lastName: SUPER_ADMIN.lastName,
      phone: SUPER_ADMIN.phone,
      ...onboarded,
    },
  });

  // Date windows for appointments.
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endPrevMonth = new Date(firstOfThisMonth.getTime() - 24 * 60 * 60 * 1000);
  const windowStart = new Date(endPrevMonth.getFullYear(), endPrevMonth.getMonth() - WINDOW_MONTHS + 1, 1);
  const pastDays = daysBetween(windowStart, endPrevMonth);
  const futureDays = daysBetween(
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1),
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + 28),
  );

  let apptTotal = 0;
  for (const clinicDef of CLINICS) {
    const clinic = await prisma.clinic.create({
      data: { name: clinicDef.name, plan: clinicDef.plan, status: 'ACTIVE', code: await nextClinicCode() },
    });

    // Client Admin (clinic-wide).
    await prisma.user.create({
      data: {
        email: clinicDef.admin.email,
        passwordHash: staffHash,
        role: 'CLIENT_ADMIN',
        status: 'ACTIVE',
        clinicId: clinic.id,
        firstName: clinicDef.admin.firstName,
        lastName: clinicDef.admin.lastName,
        phone: clinicDef.admin.phone,
        ...onboarded,
      },
    });

    const doctorIds: string[] = [];
    for (const branchDef of clinicDef.branches) {
      const branch = await prisma.branch.create({
        data: { clinicId: clinic.id, code: await nextBranchCode(), name: branchDef.name },
      });

      // Doctor (auth user + profile + weekly shifts), pinned to the branch.
      const doctorUser = await prisma.user.create({
        data: {
          email: branchDef.doctor.email,
          passwordHash: staffHash,
          role: 'DOCTOR',
          status: 'ACTIVE',
          clinicId: clinic.id,
          branchId: branch.id,
          firstName: branchDef.doctor.firstName,
          lastName: branchDef.doctor.lastName,
          phone: branchDef.doctor.phone,
          ...onboarded,
        },
      });
      const doctor = await prisma.doctor.create({
        data: {
          userId: doctorUser.id,
          clinicId: clinic.id,
          branchId: branch.id,
          code: await nextDoctorCode(),
          specialization: branchDef.doctor.specialization ?? null,
          phone: branchDef.doctor.phone,
          bio: `Dr. ${branchDef.doctor.firstName} ${branchDef.doctor.lastName} — ${branchDef.name}.`,
        },
      });
      await createShifts(doctor.id, clinic.id);
      doctorIds.push(doctor.id);

      // Receptionist, pinned to the branch and set as its person-in-charge.
      const receptionUser = await prisma.user.create({
        data: {
          email: branchDef.receptionist.email,
          passwordHash: staffHash,
          role: 'RECEPTIONIST',
          status: 'ACTIVE',
          clinicId: clinic.id,
          branchId: branch.id,
          firstName: branchDef.receptionist.firstName,
          lastName: branchDef.receptionist.lastName,
          phone: branchDef.receptionist.phone,
          ...onboarded,
        },
      });
      await prisma.branch.update({
        where: { id: branch.id },
        data: { picUserId: receptionUser.id },
      });
    }

    // Patients for this clinic.
    const patients = await createPatients(clinic.id, PATIENTS_PER_CLINIC);
    const patientIds = patients.map((p) => p.id);

    // Past appointments — one per distinct past day, weighted "done".
    for (const day of sampleDistinct(pastDays, HISTORICAL_APPTS)) {
      await createAppointment(clinic.id, doctorIds, patientIds, {
        date: day,
        slot: [randInt(9, 16), pick([0, 30]), 30],
        status: weightedPastStatus(),
      });
      apptTotal++;
    }

    // Today's appointments — distinct slots so nothing overlaps; a mix of
    // completed (earlier in the day) and still-scheduled/confirmed.
    const todaySlots = sampleDistinct(SLOTS, TODAY_APPTS).sort(
      (a, b) => a[0] * 60 + a[1] - (b[0] * 60 + b[1]),
    );
    for (let i = 0; i < todaySlots.length; i++) {
      const status: AppointmentStatus =
        i === 0 ? 'COMPLETED' : i === 1 ? 'CONFIRMED' : 'SCHEDULED';
      await createAppointment(clinic.id, doctorIds, patientIds, {
        date: today,
        slot: todaySlots[i],
        status,
      });
      apptTotal++;
    }

    // Upcoming appointments — one per distinct future day, scheduled/confirmed.
    for (const day of sampleDistinct(futureDays, UPCOMING_APPTS)) {
      await createAppointment(clinic.id, doctorIds, patientIds, {
        date: day,
        slot: pick(SLOTS),
        status: pick<AppointmentStatus>(['SCHEDULED', 'CONFIRMED']),
      });
      apptTotal++;
    }
  }

  // --- summary ---
  const [clinics, branches, users, doctors, admins, receptionists, superAdmins, shifts, patients, appts] =
    await Promise.all([
      prisma.clinic.count(),
      prisma.branch.count(),
      prisma.user.count(),
      prisma.user.count({ where: { role: 'DOCTOR' } }),
      prisma.user.count({ where: { role: 'CLIENT_ADMIN' } }),
      prisma.user.count({ where: { role: 'RECEPTIONIST' } }),
      prisma.user.count({ where: { role: 'SUPER_ADMIN' } }),
      prisma.doctorShift.count(),
      prisma.patient.count(),
      prisma.appointment.count(),
    ]);

  console.log('\nSeed complete:');
  console.log(`  clinics:        ${clinics}`);
  console.log(`  branches:       ${branches}`);
  console.log(`  users:          ${users}`);
  console.log(`    super admin:    ${superAdmins}`);
  console.log(`    client admins:  ${admins}`);
  console.log(`    doctors:        ${doctors}`);
  console.log(`    receptionists:  ${receptionists}`);
  console.log(`  doctor shifts:  ${shifts}`);
  console.log(`  patients:       ${patients}`);
  console.log(`  appointments:   ${appts} (incl. ${TODAY_APPTS} today per clinic)`);
  console.log('\nLogins (all documented in docs/ACCOUNTS.md):');
  console.log(`  Super Admin:  ${SUPER_ADMIN.email} / ${SUPER_ADMIN_PASSWORD}`);
  console.log(`  Bright Smile: admin@brightsmile.com / ${STAFF_PASSWORD}`);
  console.log(`  Gentle Care:  admin@gentlecare.com / ${STAFF_PASSWORD}`);
  console.log(`  All other staff use: ${STAFF_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
