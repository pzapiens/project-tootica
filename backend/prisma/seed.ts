/**
 * Dev seed — a realistic multi-tenant dataset for local development.
 *
 *   npm run db:seed
 *
 * Wipes existing rows and re-inserts, so it is repeatable. Refuses to run when
 * NODE_ENV=production.
 *
 * Creates:
 *   - 1 Super Admin (hardcoded initial password — CHANGE IT after first login)
 *   - 3 clinics, each with:
 *       1 Client Admin, 2 Doctors, 1 Guest Doctor (time-boxed access),
 *       1 Receptionist, Doctor profiles + weekly shifts,
 *       5 patients, 6 appointments (past + upcoming, mixed statuses)
 *
 * Known logins (dev only, password `Password123!` unless noted):
 *   super@tootica.local / SuperSecret123!   (SUPER_ADMIN)
 *   admin@tootica.local                     (CLIENT_ADMIN, Bright Smile Dental)
 *   admin@gentlecare.test, admin@sunrise.test
 *   plus every seeded doctor/guest/receptionist below
 */
import { hashPassword } from '../src/common/utils/password.util';
import { prisma } from '../src/common/db/prisma';
import type { AppointmentStatus, ClinicPlan } from '../src/generated/prisma/enums';

const SUPER_ADMIN_PASSWORD = 'SuperSecret123!';
const STAFF_PASSWORD = 'Password123!';

// --- small deterministic data pools -----------------------------------------
const DOCTOR_NAMES: Array<[string, string]> = [
  ['Olivia', 'Bennett'],
  ['Marcus', 'Reed'],
  ['Sophia', 'Nguyen'],
  ['Ethan', 'Okafor'],
  ['Ava', 'Rossi'],
  ['Liam', 'Patel'],
  ['Isabella', 'Cohen'],
  ['Noah', 'Ibrahim'],
  ['Mia', 'Alvarez'],
];
const SPECIALIZATIONS = [
  'General Dentistry',
  'Orthodontics',
  'Endodontics',
  'Periodontics',
  'Oral Surgery',
  'Pediatric Dentistry',
];
const PATIENT_NAMES: Array<[string, string]> = [
  ['James', 'Carter'],
  ['Emma', 'Thompson'],
  ['William', 'Garcia'],
  ['Charlotte', 'Kim'],
  ['Benjamin', 'Silva'],
  ['Amelia', 'Johnson'],
  ['Lucas', 'Brown'],
  ['Harper', 'Davis'],
  ['Henry', 'Martsinkevich'],
  ['Evelyn', 'Wilson'],
  ['Alexander', 'Moore'],
  ['Abigail', 'Taylor'],
  ['Daniel', 'Anderson'],
  ['Emily', 'Thomas'],
  ['Michael', 'Jackson'],
];
const MEDICAL_NOTES = [
  'No known allergies',
  'Penicillin allergy',
  'Hypertension — monitor before anaesthetic',
  'Type 2 diabetic',
  'Nut allergy',
  null,
];

interface ClinicDef {
  slug: string;
  name: string;
  plan: ClinicPlan;
  adminEmail: string;
  /** Client-admin account name (shown in the sidebar). */
  adminName: [string, string];
  /** Receptionist account name (shown in the sidebar). */
  receptionName: [string, string];
}

const CLINICS: ClinicDef[] = [
  { slug: 'brightsmile', name: 'Bright Smile Dental', plan: 'PRO', adminEmail: 'admin@tootica.local', adminName: ['Sanjay', 'Kapoor'], receptionName: ['Riya', 'Sharma'] },
  { slug: 'gentlecare', name: 'Gentle Care Dentistry', plan: 'BASIC', adminEmail: 'admin@gentlecare.test', adminName: ['Maya', 'Iyer'], receptionName: ['Neha', 'Verma'] },
  { slug: 'sunrise', name: 'Sunrise Family Dental', plan: 'FREE', adminEmail: 'admin@sunrise.test', adminName: ['Arjun', 'Rao'], receptionName: ['Pooja', 'Menon'] },
];

// --- helpers ----------------------------------------------------------------
let doctorCursor = 0;
let patientCursor = 0;
let licenseCursor = 1000;

/** A Date `dayOffset` days from today at the given local time. */
function at(dayOffset: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function dob(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

async function wipe(): Promise<void> {
  // FK-safe order.
  await prisma.appointment.deleteMany();
  await prisma.doctorShift.deleteMany();
  await prisma.doctor.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.user.deleteMany();
  await prisma.clinic.deleteMany();
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the seed with NODE_ENV=production');
  }

  await wipe();

  const staffHash = await hashPassword(STAFF_PASSWORD);
  const superHash = await hashPassword(SUPER_ADMIN_PASSWORD);

  await prisma.user.create({
    data: {
      email: 'super@tootica.local',
      passwordHash: superHash,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    },
  });

  for (const def of CLINICS) {
    const clinic = await prisma.clinic.create({
      data: { name: def.name, plan: def.plan, status: 'ACTIVE' },
    });

    // Client Admin
    await prisma.user.create({
      data: {
        email: def.adminEmail,
        passwordHash: staffHash,
        role: 'CLIENT_ADMIN',
        status: 'ACTIVE',
        clinicId: clinic.id,
        firstName: def.adminName[0],
        lastName: def.adminName[1],
      },
    });

    // Receptionist
    await prisma.user.create({
      data: {
        email: `reception@${def.slug}.test`,
        passwordHash: staffHash,
        role: 'RECEPTIONIST',
        status: 'ACTIVE',
        clinicId: clinic.id,
        firstName: def.receptionName[0],
        lastName: def.receptionName[1],
      },
    });

    // Doctors (2 regular + 1 guest), each with a profile + shifts.
    const doctorProfiles: Array<{ id: string }> = [];

    for (let i = 0; i < 3; i++) {
      const isGuest = i === 2;
      const [first, last] = DOCTOR_NAMES[doctorCursor % DOCTOR_NAMES.length];
      doctorCursor++;
      const specialization = SPECIALIZATIONS[(doctorCursor + i) % SPECIALIZATIONS.length];
      const role = isGuest ? 'GUEST_DOCTOR' : 'DOCTOR';
      const email = `${isGuest ? 'guest.' : ''}${first}.${last}@${def.slug}.test`.toLowerCase();

      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: staffHash,
          role,
          status: 'ACTIVE',
          clinicId: clinic.id,
          firstName: first,
          lastName: last,
          // Guest doctors get a time-boxed access window.
          accessStartDate: isGuest ? at(-7, 0) : null,
          accessEndDate: isGuest ? at(30, 0) : null,
        },
      });

      const doctor = await prisma.doctor.create({
        data: {
          userId: user.id,
          clinicId: clinic.id,
          specialization,
          licenseNumber: `LIC-${licenseCursor++}`,
          phone: `+1555${String(1000000 + doctorCursor).slice(-7)}`,
          bio: `Dr. ${first} ${last} — ${specialization}${isGuest ? ' (visiting)' : ''}.`,
        },
      });
      doctorProfiles.push(doctor);

      // Weekly shifts: regulars Mon/Wed/Fri, guest Tue/Thu.
      const days = isGuest ? [2, 4] : [1, 3, 5];
      await prisma.doctorShift.createMany({
        data: days.map((dayOfWeek) => ({
          doctorId: doctor.id,
          clinicId: clinic.id,
          dayOfWeek,
          startTime: '09:00',
          endTime: '17:00',
        })),
      });
    }

    // Patients (5)
    const patients: Array<{ id: string }> = [];
    for (let i = 0; i < 5; i++) {
      const [first, last] = PATIENT_NAMES[patientCursor % PATIENT_NAMES.length];
      patientCursor++;
      const patient = await prisma.patient.create({
        data: {
          clinicId: clinic.id,
          name: `${first} ${last}`,
          email: `${first}.${last}${patientCursor}@example.com`.toLowerCase(),
          phone: `+1555${String(2000000 + patientCursor).slice(-7)}`,
          dob: dob(1970 + ((patientCursor * 3) % 40), 1 + (patientCursor % 12), 1 + (patientCursor % 27)),
          medicalNotes: MEDICAL_NOTES[patientCursor % MEDICAL_NOTES.length],
        },
      });
      patients.push(patient);
    }

    // Appointments (6): a mix of past + upcoming, various statuses.
    const plan: Array<{ p: number; d: number; day: number; hour: number; status: AppointmentStatus }> = [
      { p: 0, d: 0, day: -14, hour: 9, status: 'COMPLETED' },
      { p: 1, d: 1, day: -7, hour: 10, status: 'COMPLETED' },
      { p: 2, d: 0, day: -3, hour: 11, status: 'NO_SHOW' },
      { p: 3, d: 2, day: -1, hour: 14, status: 'CANCELLED' },
      { p: 0, d: 1, day: 2, hour: 9, status: 'SCHEDULED' },
      { p: 4, d: 2, day: 5, hour: 15, status: 'CONFIRMED' },
    ];

    for (const a of plan) {
      const start = at(a.day, a.hour);
      await prisma.appointment.create({
        data: {
          clinicId: clinic.id,
          patientId: patients[a.p].id,
          doctorId: doctorProfiles[a.d].id,
          startTime: start,
          endTime: addMinutes(start, 30),
          status: a.status,
          notes: a.status === 'NO_SHOW' ? 'Patient did not attend' : 'Routine visit',
        },
      });
    }
  }

  // --- summary ---
  const [clinics, users, doctors, shifts, patients, appointments] = await Promise.all([
    prisma.clinic.count(),
    prisma.user.count(),
    prisma.doctor.count(),
    prisma.doctorShift.count(),
    prisma.patient.count(),
    prisma.appointment.count(),
  ]);

  console.log('\nSeed complete:');
  console.log(`  clinics:      ${clinics}`);
  console.log(`  users:        ${users}`);
  console.log(`  doctors:      ${doctors}`);
  console.log(`  doctorShifts: ${shifts}`);
  console.log(`  patients:     ${patients}`);
  console.log(`  appointments: ${appointments}`);
  console.log('\nLogins (dev only):');
  console.log(`  super@tootica.local / ${SUPER_ADMIN_PASSWORD}   (SUPER_ADMIN — change after first login)`);
  console.log(`  admin@tootica.local / ${STAFF_PASSWORD}      (CLIENT_ADMIN, Bright Smile Dental)`);
  console.log(`  admin@gentlecare.test, admin@sunrise.test / ${STAFF_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
