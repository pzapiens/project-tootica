/**
 * Minimal seed — the SAME structure as `seed-all.ts` (super admin + 2 clinics,
 * each with 2 branches, doctors, receptionists and weekly shifts), but a tiny
 * dataset: EXACTLY 5 patients and 10 appointments TOTAL, spread across all
 * clinics. Handy for a clean, easy-to-eyeball state.
 *
 *   npm run db:seed:minimal
 *
 * Wipes ALL existing data first. Refuses to run when NODE_ENV=production.
 * Credentials match seed-all.ts / docs/ACCOUNTS.md.
 */
import {
  nextAppointmentCode,
  nextBranchCode,
  nextDoctorCode,
  nextPatientCode,
} from '../src/common/utils/codes';
import { hashPassword } from '../src/common/utils/password.util';
import { prisma } from '../src/common/db/prisma';
import type { AppointmentStatus, ClinicPlan } from '../src/generated/prisma/enums';

// --- credentials (documented in docs/ACCOUNTS.md) ---------------------------
const SUPER_ADMIN_PASSWORD = 'SuperAdmin@123';
const STAFF_PASSWORD = 'Password@123';

// --- structure: clinics, branches and their staff (mirrors seed-all.ts) -----
interface PersonDef {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  title?: string; // Mr/Mrs/Ms for admins & receptionists; doctors derive "Dr".
  specialization?: string; // doctor-only
}
interface BranchDef {
  name: string;
  doctor: PersonDef;
  receptionist: PersonDef;
}
interface ClinicDef {
  name: string;
  code: string;
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
    code: 'BSD001',
    plan: 'PRO',
    admin: { firstName: 'Sanjay', lastName: 'Kapoor', email: 'admin@brightsmile.com', phone: '+919000000010', title: 'Mr' },
    branches: [
      {
        name: 'Downtown',
        doctor: { firstName: 'Olivia', lastName: 'Bennett', email: 'olivia.bennett@brightsmile.com', phone: '+919000000011', specialization: 'General Dentistry' },
        receptionist: { firstName: 'Riya', lastName: 'Sharma', email: 'reception.downtown@brightsmile.com', phone: '+919000000012', title: 'Ms' },
      },
      {
        name: 'Uptown',
        doctor: { firstName: 'Marcus', lastName: 'Reed', email: 'marcus.reed@brightsmile.com', phone: '+919000000013', specialization: 'Orthodontics' },
        receptionist: { firstName: 'Neha', lastName: 'Verma', email: 'reception.uptown@brightsmile.com', phone: '+919000000014', title: 'Ms' },
      },
    ],
  },
  {
    name: 'Gentle Care Dentistry',
    code: 'GCD001',
    plan: 'BASIC',
    admin: { firstName: 'Maya', lastName: 'Iyer', email: 'admin@gentlecare.com', phone: '+919000000020', title: 'Ms' },
    branches: [
      {
        name: 'Central',
        doctor: { firstName: 'Sophia', lastName: 'Nguyen', email: 'sophia.nguyen@gentlecare.com', phone: '+919000000021', specialization: 'Endodontics' },
        receptionist: { firstName: 'Pooja', lastName: 'Menon', email: 'reception.central@gentlecare.com', phone: '+919000000022', title: 'Ms' },
      },
      {
        name: 'Riverside',
        doctor: { firstName: 'Ethan', lastName: 'Okafor', email: 'ethan.okafor@gentlecare.com', phone: '+919000000023', specialization: 'Periodontics' },
        receptionist: { firstName: 'Arjun', lastName: 'Rao', email: 'reception.riverside@gentlecare.com', phone: '+919000000024', title: 'Mr' },
      },
    ],
  },
];

// --- minimal dataset: 5 patients + 10 appointments --------------------------
const PATIENT_NAMES: Array<[string, string]> = [
  ['James', 'Carter'],
  ['Emma', 'Thompson'],
  ['William', 'Garcia'],
  ['Charlotte', 'Kim'],
  ['Benjamin', 'Silva'],
];
const CONSULTATION_TYPES = [
  'GENERAL CONSULTATION / XRAY',
  'ROOT CANAL TREATMENT',
  'SCALING',
  'TEETH WHITENING',
  'RESTORATION',
];
const LEAD_SOURCES = ['INSTAGRAM', 'GOOGLE SEARCH', 'WEBSITE', 'PATIENT REFERRAL', 'WALK IN'];
// [dayOffset, hour, durationMin, status] per appointment — a mix of past
// (done/missed/cancelled), today, and upcoming so the dashboard has variety.
// NB: SCHEDULED is reserved for pending WhatsApp bookings (excluded from the
// main list), so real bookings use CONFIRMED for "Upcoming" — never SCHEDULED.
const APPT_PLAN: Array<[number, number, number, AppointmentStatus]> = [
  [0, 9, 30, 'COMPLETED'],
  [0, 11, 60, 'ONGOING'],
  [0, 15, 30, 'CONFIRMED'],
  [-3, 10, 30, 'COMPLETED'],
  [-10, 14, 60, 'NO_SHOW'],
  [-20, 9, 30, 'CANCELLED'],
  [2, 10, 60, 'CONFIRMED'],
  [5, 16, 30, 'CONFIRMED'],
  [9, 11, 30, 'CONFIRMED'],
  [14, 15, 60, 'CONFIRMED'],
];
const TOTAL_PATIENTS = 5;
const TOTAL_APPTS = 10;

// Every account is ready to log in immediately.
const onboarded = { mustResetPassword: false, termsAcceptedAt: new Date() } as const;

// --- helpers ----------------------------------------------------------------
/** A Date `dayOffset` days from today at the given local time. */
function at(dayOffset: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Next date (today or later) on the given weekday (0=Sun..6=Sat), at midnight. */
function nextWeekday(dow: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7));
  return d;
}

/** Weekly availability: Mon–Fri 09:00–18:00, Sat 09:00–13:00. */
async function createShifts(doctorId: string, clinicId: string): Promise<void> {
  const weekday = { startTime: '09:00', endTime: '18:00' };
  const saturday = { startTime: '09:00', endTime: '13:00' };
  const days = [
    { dow: 1, ...weekday },
    { dow: 2, ...weekday },
    { dow: 3, ...weekday },
    { dow: 4, ...weekday },
    { dow: 5, ...weekday },
    { dow: 6, ...saturday },
  ];
  await prisma.doctorShift.createMany({
    data: days.map(({ dow, ...times }) => ({
      doctorId,
      clinicId,
      frequency: 'Weekly',
      date: nextWeekday(dow),
      ...times,
    })),
  });
}

async function wipe(): Promise<void> {
  // FK-safe order (same as seed-all): break the Branch.picUserId ↔ User.branchId
  // cycle before deleting users/branches; reset display-code counters last.
  await prisma.appointment.deleteMany();
  await prisma.doctorShift.deleteMany();
  await prisma.doctor.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.branch.updateMany({ data: { picUserId: null } });
  await prisma.user.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.clinic.deleteMany();
  await prisma.counter.deleteMany();
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

  // Clinics + branches + staff. Track each clinic's id and its doctor ids so the
  // 10 appointments can be assigned to a doctor in the patient's clinic.
  const clinicRecords: Array<{ id: string; doctorIds: string[] }> = [];
  for (const clinicDef of CLINICS) {
    const clinic = await prisma.clinic.create({
      data: { name: clinicDef.name, code: clinicDef.code, plan: clinicDef.plan, status: 'ACTIVE' },
    });

    await prisma.user.create({
      data: {
        email: clinicDef.admin.email,
        passwordHash: staffHash,
        role: 'CLIENT_ADMIN',
        status: 'ACTIVE',
        clinicId: clinic.id,
        title: clinicDef.admin.title ?? null,
        firstName: clinicDef.admin.firstName,
        lastName: clinicDef.admin.lastName,
        phone: clinicDef.admin.phone,
        ...onboarded,
      },
    });

    const doctorIds: string[] = [];
    for (const branchDef of clinicDef.branches) {
      const branch = await prisma.branch.create({
        data: { clinicId: clinic.id, code: await nextBranchCode(clinic.id), name: branchDef.name },
      });

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
          code: await nextDoctorCode(clinic.id),
          specialization: branchDef.doctor.specialization ?? null,
          phone: branchDef.doctor.phone,
          bio: `Dr. ${branchDef.doctor.firstName} ${branchDef.doctor.lastName} — ${branchDef.name}.`,
        },
      });
      await createShifts(doctor.id, clinic.id);
      doctorIds.push(doctor.id);

      const receptionUser = await prisma.user.create({
        data: {
          email: branchDef.receptionist.email,
          passwordHash: staffHash,
          role: 'RECEPTIONIST',
          status: 'ACTIVE',
          clinicId: clinic.id,
          branchId: branch.id,
          title: branchDef.receptionist.title ?? null,
          firstName: branchDef.receptionist.firstName,
          lastName: branchDef.receptionist.lastName,
          phone: branchDef.receptionist.phone,
          ...onboarded,
        },
      });
      await prisma.branch.update({ where: { id: branch.id }, data: { picUserId: receptionUser.id } });
    }

    clinicRecords.push({ id: clinic.id, doctorIds });
  }

  // 5 patients, round-robin across clinics.
  const patients: Array<{ id: string; clinicId: string }> = [];
  for (let i = 0; i < TOTAL_PATIENTS; i++) {
    const clinic = clinicRecords[i % clinicRecords.length];
    const [first, last] = PATIENT_NAMES[i];
    const p = await prisma.patient.create({
      data: {
        clinicId: clinic.id,
        code: await nextPatientCode(clinic.id),
        name: `${first} ${last}`,
        email: `${first}.${last}${i + 1}@example.com`.toLowerCase(),
        phone: `+9198${String(20000000 + i * 137).slice(-8)}`,
        gender: i % 2 === 0 ? 'M' : 'F',
        dob: new Date(Date.UTC(1980 + i * 3, (i * 2) % 12, 1 + i)),
        medicalNotes: i === 0 ? 'Penicillin allergy' : 'No known allergies',
        createdAt: at(-30, 9),
      },
    });
    patients.push({ id: p.id, clinicId: clinic.id });
  }

  // 10 appointments, round-robin over the patients (so they spread across
  // clinics too). Each uses a doctor from the patient's clinic.
  for (let j = 0; j < TOTAL_APPTS; j++) {
    const patient = patients[j % patients.length];
    const clinic = clinicRecords.find((c) => c.id === patient.clinicId)!;
    const [dayOffset, hour, dur, status] = APPT_PLAN[j];
    const start = at(dayOffset, hour);
    const end = new Date(start.getTime() + dur * 60 * 1000);
    await prisma.appointment.create({
      data: {
        clinicId: patient.clinicId,
        code: await nextAppointmentCode(patient.clinicId),
        patientId: patient.id,
        doctorId: clinic.doctorIds.length ? clinic.doctorIds[j % clinic.doctorIds.length] : null,
        startTime: start,
        endTime: end,
        status,
        bookingChannel: 'WEB',
        consultationType: CONSULTATION_TYPES[j % CONSULTATION_TYPES.length],
        sourceOfEnquiry: LEAD_SOURCES[j % LEAD_SOURCES.length],
        createdAt: start,
      },
    });
  }

  // A few PENDING WhatsApp booking requests to exercise the accept flow. These
  // are SCHEDULED, doctor-less, time-less (start == end) and have NO code yet —
  // the code is claimed on accept (a rejected request never burns a number).
  // They live ONLY in the "WhatsApp Appointments" popup (excluded from the main
  // appointments list), so the 10 appointments above are unchanged. One is from
  // an EXISTING patient; the rest are NEW leads with no patient row — accepting
  // one creates the patient record AND finalises the appointment.
  const now = at(0, 9);
  // Existing-patient WhatsApp request (patient booked over WhatsApp).
  await prisma.appointment.create({
    data: {
      clinicId: patients[0].clinicId,
      patientId: patients[0].id,
      doctorId: null,
      startTime: at(3, 0),
      endTime: at(3, 0),
      status: 'SCHEDULED',
      bookingChannel: 'WHATSAPP',
      // Source of enquiry left unset (default) — only the booking channel marks
      // that it came via WhatsApp.
      consultationType: 'GENERAL CONSULTATION / XRAY',
      createdAt: now,
    },
  });
  // New-lead WhatsApp requests (no patient row yet — contact details only, plus
  // the age/gender the lead shared; no doctor is ever assigned over WhatsApp).
  const WHATSAPP_LEADS = [
    { name: 'Nadia Newlead', phone: '+919788100001', email: 'nadia.newlead@example.com', gender: 'F', dob: new Date(Date.UTC(1997, 3, 12)) },
    { name: 'Omar Prospect', phone: '+919788100002', email: null as string | null, gender: 'M', dob: new Date(Date.UTC(1985, 8, 3)) },
  ];
  for (let k = 0; k < WHATSAPP_LEADS.length; k++) {
    const clinic = clinicRecords[k % clinicRecords.length];
    const lead = WHATSAPP_LEADS[k];
    const day = at(4 + k, 0);
    await prisma.appointment.create({
      data: {
        clinicId: clinic.id,
        patientId: null,
        contactName: lead.name,
        contactPhone: lead.phone,
        contactEmail: lead.email,
        contactGender: lead.gender,
        contactDob: lead.dob,
        doctorId: null,
        startTime: day,
        endTime: day,
        status: 'SCHEDULED',
        bookingChannel: 'WHATSAPP',
        // Source of enquiry left unset (default).
        consultationType: 'SCALING',
        createdAt: now,
      },
    });
  }

  // --- summary ---
  const [clinics, branches, users, patientCount, apptCount] = await Promise.all([
    prisma.clinic.count(),
    prisma.branch.count(),
    prisma.user.count(),
    prisma.patient.count(),
    prisma.appointment.count({ where: { status: { not: 'SCHEDULED' } } }),
  ]);
  const whatsappPending = await prisma.appointment.count({ where: { status: 'SCHEDULED' } });
  console.log('\nMinimal seed complete:');
  console.log(`  clinics:            ${clinics}`);
  console.log(`  branches:           ${branches}`);
  console.log(`  users:              ${users}`);
  console.log(`  patients:           ${patientCount}`);
  console.log(`  appointments:       ${apptCount} (listed)`);
  console.log(`  WhatsApp pending:   ${whatsappPending} (in the WhatsApp popup — 1 existing patient + 2 new leads)`);
  console.log('\nLogins (see docs/ACCOUNTS.md):');
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
