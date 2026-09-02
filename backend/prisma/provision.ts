/**
 * Fresh-environment provisioning — a minimal, deterministic dataset.
 *
 *   npm run db:provision
 *
 * Wipes ALL existing data and re-creates exactly:
 *   - 1 Super Admin
 *   - 2 Clinics, each with 1 Client Admin and 2 Branches (4 branches total)
 *   - Per branch: 1 Doctor (+ doctor profile) and 1 Receptionist
 *       → 4 doctors + 4 receptionists total
 *
 * Every account is created "already onboarded" (known password, no forced
 * first-login reset, Terms pre-accepted) so the documented credentials work
 * immediately. Run the exact same file on another machine to reproduce the
 * identical set of accounts — the credentials are also listed in
 * `docs/ACCOUNTS.md`.
 *
 * NOTE on the data model: users are scoped to a CLINIC, not a branch (there is
 * no branchId on User/Doctor). Each branch's doctor + receptionist therefore
 * belong to the clinic and are named per branch; the receptionist is set as the
 * branch's person-in-charge (picUserId) — the one real per-branch user link the
 * schema supports.
 *
 * Refuses to run when NODE_ENV=production.
 */
import {
  nextBranchCode,
  nextClinicCode,
  nextDoctorCode,
} from '../src/common/utils/codes';
import { hashPassword } from '../src/common/utils/password.util';
import { prisma } from '../src/common/db/prisma';
import type { ClinicPlan } from '../src/generated/prisma/enums';

// --- passwords (documented in docs/ACCOUNTS.md) -----------------------------
const SUPER_ADMIN_PASSWORD = 'SuperAdmin@123';
const STAFF_PASSWORD = 'Password@123';

// --- structure --------------------------------------------------------------
interface PersonDef {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** Doctor-only: shown on the profile. */
  specialization?: string;
}

interface BranchDef {
  /** Branch display name (the clinic-selection list shows these). */
  name: string;
  doctor: PersonDef;
  receptionist: PersonDef;
}

interface ClinicDef {
  name: string;
  plan: ClinicPlan;
  admin: PersonDef;
  branches: [BranchDef, BranchDef];
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
  // Reset the display-code counters so a fresh provision starts at CL-000001 etc.
  await prisma.counter.deleteMany();
}

// Every account is ready to log in immediately.
const onboarded = { mustResetPassword: false, termsAcceptedAt: new Date() } as const;

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run provisioning with NODE_ENV=production');
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

  for (const clinicDef of CLINICS) {
    const clinic = await prisma.clinic.create({
      data: { name: clinicDef.name, plan: clinicDef.plan, status: 'ACTIVE', code: await nextClinicCode() },
    });

    // Client Admin for the clinic.
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

    for (const branchDef of clinicDef.branches) {
      // 1. Create the branch first (its PIC is filled in once the receptionist
      //    exists). Staff are then pinned to this branch via branchId.
      const branch = await prisma.branch.create({
        data: { clinicId: clinic.id, code: await nextBranchCode(), name: branchDef.name },
      });

      // 2. Doctor assigned to this branch (auth user + doctor profile).
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
      await prisma.doctor.create({
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

      // 3. Receptionist assigned to this branch.
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

      // 4. Make the receptionist the branch's person-in-charge.
      await prisma.branch.update({
        where: { id: branch.id },
        data: { picUserId: receptionUser.id },
      });
    }
  }

  // --- summary ---
  const [clinics, branches, users, doctors, admins, receptionists, superAdmins] =
    await Promise.all([
      prisma.clinic.count(),
      prisma.branch.count(),
      prisma.user.count(),
      prisma.user.count({ where: { role: 'DOCTOR' } }),
      prisma.user.count({ where: { role: 'CLIENT_ADMIN' } }),
      prisma.user.count({ where: { role: 'RECEPTIONIST' } }),
      prisma.user.count({ where: { role: 'SUPER_ADMIN' } }),
    ]);

  console.log('\nProvisioning complete:');
  console.log(`  clinics:       ${clinics}`);
  console.log(`  branches:      ${branches}`);
  console.log(`  users:         ${users}`);
  console.log(`    super admin:   ${superAdmins}`);
  console.log(`    client admins: ${admins}`);
  console.log(`    doctors:       ${doctors}`);
  console.log(`    receptionists: ${receptionists}`);
  console.log('\nCredentials are documented in docs/ACCOUNTS.md');
  console.log(`  Super Admin: ${SUPER_ADMIN.email} / ${SUPER_ADMIN_PASSWORD}`);
  console.log(`  Everyone else password: ${STAFF_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
