/** Additive, repeatable demo data. Existing records/passwords are never reset.
 * Run from backend/: npm run db:seed:demo (or db:seed:demo:check to inspect).
 * Stable IDs and create-only upserts preserve edits made during a demo.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../src/generated/prisma/client';
import type { AppointmentStatus, Role } from '../src/generated/prisma/enums';
import { hashPassword } from '../src/common/utils/password.util';
import * as storage from '../src/common/storage/fileStorage';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
type Tx = Prisma.TransactionClient;
const PASSWORD = 'Demo@12345';
const DAY = 86_400_000;
// Always anchor the calendar to Dubai's date, independent of the host timezone.
const today = new Date(
  `${new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())}T00:00:00.000Z`,
);
const date = (offset: number) => new Date(today.getTime() + offset * DAY);
const at = (offset: number, hour: number, minute = 0) =>
  new Date(date(offset).getTime() + ((hour - 4) * 60 + minute) * 60_000);

// UUID-shaped, namespace-specific deterministic IDs (not real patient identifiers).
function id(key: string): string {
  const h = createHash('sha256').update(`tootica-demo-v1:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function code(tx: Tx, clinicId: string, prefix: string, kind: string): Promise<string> {
  const letter = { branch: 'B', doctor: 'D', patient: 'P', appointment: 'A' }[kind];
  assert(letter);
  // Synchronize to existing display codes too, including manually imported rows.
  const rows =
    kind === 'branch'
      ? await tx.branch.findMany({ where: { clinicId }, select: { code: true } })
      : kind === 'doctor'
        ? await tx.doctor.findMany({ where: { clinicId }, select: { code: true } })
        : kind === 'patient'
          ? await tx.patient.findMany({ where: { clinicId }, select: { code: true } })
          : await tx.appointment.findMany({ where: { clinicId }, select: { code: true } });
  const start = `${prefix}-${letter}`;
  const max = rows.reduce((n, row) => {
    const suffix = row.code?.startsWith(start) ? row.code.slice(start.length) : '';
    return /^\d+$/.test(suffix) ? Math.max(n, Number(suffix)) : n;
  }, 0);
  const name = `${kind}:${clinicId}`;
  await tx.counter.upsert({ where: { name }, update: {}, create: { name, value: max } });
  await tx.counter.updateMany({ where: { name, value: { lt: max } }, data: { value: max } });
  const counter = await tx.counter.update({ where: { name }, data: { value: { increment: 1 } } });
  return `${start}${String(counter.value).padStart(kind === 'branch' || kind === 'doctor' ? 3 : 6, '0')}`;
}

const NAMES = [
  'Aarav Mehta',
  'Diya Kapoor',
  'Omar Hassan',
  'Nadia Ali',
  'Emma Wilson',
  'Lucas Brown',
  'Priya Nair',
  'Rohan Gupta',
  'Maya Patel',
  'Adam Khan',
  'Sara Thomas',
  'Noah Martin',
];
const TYPES = [
  'GENERAL CONSULTATION / XRAY',
  'ROOT CANAL TREATMENT',
  'RE ROOT CANAL TREATMENT',
  'CROWN / VENEER / FPD',
  'EXTRACTION / SURGICAL EXTRACTION',
  'SCALING',
  'RESTORATION',
  'TEETH WHITENING',
  'ORTHODONTIC TREATMENT BRACES / ALIGNERS',
  'PEDODONTIC TREATMENT',
  'RPD / CD',
  'IMPLANTS',
  'TMJ DISORDERS',
  'GUM RELATED TREATMENTS',
  'INTRAORAL SCANNING',
  'OTHER LASER TREATMENTS',
  'OTHERS',
];
const SOURCES = [
  'INSTAGRAM',
  'FACEBOOK',
  'WHATSAPP',
  'GOOGLE SEARCH',
  'WEBSITE',
  'BOARD / SIGNBOARD',
  'PATIENT REFERRAL',
  'DOCTOR REFERRAL',
  'CAMP / DENTAL CAMP',
  'ONLINE ADS',
  'OTHERS',
];

async function seedClinic(clinicId: string, passwordHash: string): Promise<void> {
  await db.$transaction(
    async (tx) => {
      const clinic = await tx.clinic.findUniqueOrThrow({ where: { id: clinicId } });
      if (!clinic.code) throw new Error(`${clinic.name}: assign a clinic code before seeding.`);
      const prefix = clinic.code;
      const mail = `${prefix.toLowerCase()}.${clinic.id.slice(0, 8)}.demo.tootica.test`;

      async function user(
        key: string,
        role: Role,
        firstName: string,
        branchId: string | null = null,
        extra: Partial<Prisma.UserUncheckedCreateInput> = {},
      ) {
        const userId = id(`${clinicId}:user:${key}`);
        return tx.user.upsert({
          where: { id: userId },
          update: {},
          create: {
            ...extra,
            id: userId,
            clinicId,
            branchId,
            email: `${key}@${mail}`,
            firstName,
            lastName: 'Demo',
            role,
            status: extra.status ?? 'ACTIVE',
            passwordHash: role === 'GUEST_DOCTOR' ? null : passwordHash,
            mustResetPassword: extra.mustResetPassword ?? false,
            termsAcceptedAt: extra.mustResetPassword ? null : date(-180),
            createdAt: date(-180),
          },
        });
      }
      const admin = await user('admin', 'CLIENT_ADMIN', 'Clinic Admin');
      // Fill out branch views while keeping every existing branch/PIC untouched.
      let branches = await tx.branch.findMany({ where: { clinicId }, orderBy: { code: 'asc' } });
      for (let b = branches.length; b < 2; b++) {
        await tx.branch.create({
          data: {
            id: id(`${clinicId}:branch:${b}`),
            clinicId,
            code: await code(tx, clinicId, prefix, 'branch'),
            name: `Demo ${b === 0 ? 'Central' : 'Riverside'}`,
          },
        });
      }
      branches = await tx.branch.findMany({ where: { clinicId }, orderBy: { code: 'asc' } });
      const doctors: Array<{ id: string; userId: string; name: string }> = [];
      for (const [b, branch] of branches.entries()) {
        const reception = await user(
          `reception-${b + 1}`,
          'RECEPTIONIST',
          `Reception ${b + 1}`,
          branch.id,
        );
        if (!branch.picUserId && branch.name.startsWith('Demo ')) {
          await tx.branch.update({ where: { id: branch.id }, data: { picUserId: reception.id } });
        }
        const doctorUser = await user(
          `doctor-${b + 1}`,
          'DOCTOR',
          b % 2 ? 'Sophia' : 'Olivia',
          branch.id,
        );
        const doctorId = id(`${clinicId}:doctor:${branch.id}`);
        const existing = await tx.doctor.findUnique({ where: { id: doctorId } });
        const doctor =
          existing ??
          (await tx.doctor.create({
            data: {
              id: doctorId,
              clinicId,
              userId: doctorUser.id,
              branchId: branch.id,
              code: await code(tx, clinicId, prefix, 'doctor'),
              specialization: b % 2 ? 'Orthodontics' : 'General Dentistry',
              licenseNumber: `DEMO-${prefix}-${b + 1}`,
              bio: 'Fictional clinician for feature demonstrations.',
            },
          }));
        doctors.push({
          id: doctor.id,
          userId: doctorUser.id,
          name: `${doctorUser.firstName} Demo`,
        });
        for (let d = 0; d < 7; d++) {
          const shiftId = id(`${doctorId}:shift:${d}`);
          await tx.doctorShift.upsert({
            where: { id: shiftId },
            update: {},
            create: {
              id: shiftId,
              clinicId,
              doctorId,
              groupId: id(`${doctorId}:weekly`),
              frequency: 'Weekly',
              date: date(-7 + d),
              startTime: '09:00',
              endTime: '18:00',
            },
          });
        }
        for (let d = 0; d < 3; d++) {
          const blockId = id(`${doctorId}:block:${d}`);
          await tx.doctorBlock.upsert({
            where: { id: blockId },
            update: {},
            create: {
              id: blockId,
              clinicId,
              doctorId,
              date: date(d),
              startTime: '13:00',
              endTime: '14:00',
            },
          });
        }
      }
      for (const [g, days] of [
        [0, 30],
        [1, -1],
      ]) {
        const guest = await user(
          `guest-${g + 1}`,
          'GUEST_DOCTOR',
          g ? 'Expired Guest' : 'Visiting Specialist',
          null,
          { accessStartDate: date(-30), accessEndDate: date(days) },
        );
        const guestId = id(`${clinicId}:guest:${g}`);
        if (!(await tx.doctor.findUnique({ where: { id: guestId } }))) {
          await tx.doctor.create({
            data: {
              id: guestId,
              clinicId,
              userId: guest.id,
              code: await code(tx, clinicId, prefix, 'doctor'),
              specialization: 'Oral Surgery',
              bio: 'Demo guest profile; no login credentials.',
            },
          });
        }
      }
      await user('suspended', 'RECEPTIONIST', 'Suspended Account', branches[0].id, {
        status: 'SUSPENDED',
      });
      await user('onboarding', 'RECEPTIONIST', 'First Login', branches[0].id, {
        mustResetPassword: true,
      });

      const patients: string[] = [];
      for (const [p, name] of NAMES.entries()) {
        const patientId = id(`${clinicId}:patient:${p}`);
        if (!(await tx.patient.findUnique({ where: { id: patientId } }))) {
          await tx.patient.create({
            data: {
              id: patientId,
              clinicId,
              code: await code(tx, clinicId, prefix, 'patient'),
              name: `${name} (Demo)`,
              email: `patient-${p + 1}@${mail}`,
              phone: `+1202555${String(100 + p).padStart(4, '0')}`,
              gender: p % 2 ? 'F' : 'M',
              dob: new Date(`${p === 9 ? 2017 : 1970 + p * 4}-05-12T00:00:00Z`),
              medicalNotes: [
                'Demo: no known allergies',
                'Demo: penicillin allergy',
                'Demo: controlled hypertension',
                'Demo: type 2 diabetes',
              ][p % 4],
              createdAt: date(-180 + p * 13),
            },
          });
        }
        patients.push(patientId);
      }

      async function appointment(
        key: string,
        offset: number,
        slot: number,
        status: AppointmentStatus,
        index: number,
        doctorIndex: number,
        whatsapp = false,
      ) {
        const appointmentId = id(`${clinicId}:appointment:${key}`);
        const existing = await tx.appointment.findUnique({ where: { id: appointmentId } });
        if (existing) return existing;
        const hour = [9, 10, 11, 12, 14, 15, 16, 17][slot % 8];
        return tx.appointment.create({
          data: {
            id: appointmentId,
            clinicId,
            code: await code(tx, clinicId, prefix, 'appointment'),
            patientId: patients[index % patients.length],
            doctorId: doctors[doctorIndex].id,
            startTime: at(offset, hour),
            endTime: at(offset, hour, 30),
            status,
            bookingChannel: whatsapp && status !== 'SCHEDULED' ? 'WHATSAPP' : 'WEB',
            consultationType: TYPES[index % TYPES.length],
            sourceOfEnquiry: SOURCES[index % SOURCES.length],
            notes: `Demo: ${status.toLowerCase().replaceAll('_', ' ')} visit.`,
            createdAt: at(Math.min(offset - 2, -1), 8),
          },
        });
      }

      async function charges(appointmentId: string, index: number, createdAt: Date) {
        for (let c = 0; c < 2; c++) {
          const chargeId = id(`${appointmentId}:payment:${c}`);
          await tx.payment.upsert({
            where: { id: chargeId },
            update: {},
            create: {
              id: chargeId,
              appointmentId,
              description: c ? 'Demo treatment' : 'Demo consultation / X-ray',
              amount: c ? 1000 + (index % 7) * 750 : 500,
              paid: index % 3 === 0 || (index % 3 === 1 && c === 0),
              createdAt,
            },
          });
        }
      }

      async function records(
        appointmentId: string,
        p: number,
        doctorIndex: number,
        createdAt: Date,
      ) {
        const patientId = patients[p % patients.length];
        const author = doctors[doctorIndex];
        const common = {
          clinicId,
          patientId,
          appointmentId,
          createdById: author.userId,
          createdByName: author.name,
          createdAt,
        };
        const toothId = id(`${appointmentId}:tooth`);
        const observationId = id(`${appointmentId}:observation`);
        const medicalId = id(`${appointmentId}:medical`);
        const observation =
          'Demo: mild gingival inflammation. Oral hygiene reviewed; follow-up planned.';
        await tx.toothRemark.upsert({
          where: { id: toothId },
          update: {},
          create: {
            ...common,
            id: toothId,
            toothNo: ['16', '26', '36', '46'][p % 4],
            remarks: 'Demo: restoration intact; review at next visit.',
          },
        });
        await tx.observationEntry.upsert({
          where: { id: observationId },
          update: {},
          create: {
            ...common,
            id: observationId,
            text: observation,
          },
        });
        await tx.medicalHistoryEntry.upsert({
          where: { id: medicalId },
          update: {},
          create: {
            ...common,
            id: medicalId,
            text:
              p % 2
                ? 'Demo: penicillin allergy reported and confirmed.'
                : 'Demo: no known allergies or regular medication.',
          },
        });
        const logData = [
          {
            table: 'observation',
            action: 'CREATE',
            entryId: observationId,
            previous: null,
            updated: 'Demo: mild gingival inflammation.',
          },
          {
            table: 'observation',
            action: 'UPDATE',
            entryId: observationId,
            previous: 'Demo: mild gingival inflammation.',
            updated: observation,
          },
          {
            table: 'tooth',
            action: 'CREATE',
            entryId: toothId,
            previous: null,
            updated: 'Demo: restoration intact; review at next visit.',
          },
          {
            table: 'medical-history',
            action: 'CREATE',
            entryId: medicalId,
            previous: null,
            updated: 'Demo medical history recorded.',
          },
          {
            table: 'observation',
            action: 'DELETE',
            entryId: id(`${appointmentId}:deleted-observation`),
            previous: 'Demo: duplicate observation removed.',
            updated: null,
          },
        ];
        for (const [l, data] of logData.entries()) {
          const logId = id(`${appointmentId}:audit:${l}`);
          await tx.recordAuditLog.upsert({
            where: { id: logId },
            update: {},
            create: {
              ...data,
              id: logId,
              clinicId,
              patientId,
              userId: author.userId,
              userName: author.name,
              createdAt: new Date(createdAt.getTime() + l * 60_000),
            },
          });
        }
        // Real downloadable bytes; the X-ray is an explicitly labelled schematic.
        for (const category of ['consent', 'xray', 'other']) {
          const documentId = id(`${appointmentId}:document:${category}`);
          if (await tx.patientDocument.findUnique({ where: { id: documentId } })) continue;
          const image = category === 'xray';
          const name = image
            ? 'Demo-dental-schematic.svg'
            : `Demo-${category === 'consent' ? 'consent' : 'treatment-plan'}.txt`;
          const content = image
            ? '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="360" viewBox="0 0 800 360"><rect width="800" height="360" fill="#16202b"/><text x="40" y="55" fill="white" font-size="24">DEMO DENTAL SCHEMATIC - NOT A CLINICAL X-RAY</text><g fill="#d3e3eb" stroke="#819eae" stroke-width="5"><path d="M240 110 Q210 80 190 120 L210 275 L240 220 L270 275 L290 120 Q270 80 240 110Z"/><path d="M450 110 Q420 80 400 120 L420 275 L450 220 L480 275 L500 120 Q480 80 450 110Z"/></g><text x="40" y="330" fill="white" font-size="18">Fictional sample for document preview and download.</text></svg>'
            : `TOOTICA DEMO - FICTIONAL SAMPLE\nPatient: ${NAMES[p % NAMES.length]} (Demo)\n${category === 'consent' ? 'Sample consent form for demonstrating upload, download and audit history. No actual consent is recorded.' : 'Sample plan: consultation, scaling, restoration review and a follow-up appointment.'}\n`;
          const bytes = Buffer.from(content);
          const storageKey = `${clinicId}/${documentId}${image ? '.svg' : '.txt'}`;
          const filePath = storage.resolvePath(storageKey);
          await mkdir(path.dirname(filePath), { recursive: true });
          await writeFile(filePath, bytes);
          await tx.patientDocument.create({
            data: {
              ...common,
              id: documentId,
              category,
              name,
              size: bytes.length,
              mimeType: image ? 'image/svg+xml' : 'text/plain',
              storageKey,
            },
          });
          for (const action of ['UPLOAD', 'DOWNLOAD']) {
            const logId = id(`${documentId}:audit:${action}`);
            await tx.recordAuditLog.upsert({
              where: { id: logId },
              update: {},
              create: {
                id: logId,
                clinicId,
                patientId,
                table: category,
                action,
                entryId: documentId,
                previous: null,
                updated: name,
                userId: author.userId,
                userName: author.name,
                createdAt: new Date(
                  createdAt.getTime() + (action === 'DOWNLOAD' ? 120_000 : 60_000),
                ),
              },
            });
          }
        }
      }

      // Every branch gets its own timeline, all statuses today, and upcoming slots.
      const todayStatuses: AppointmentStatus[] = [
        'COMPLETED',
        'ONGOING',
        'CONFIRMED',
        'SCHEDULED',
        'CANCELLED',
      ];
      let chatAppointmentId = '';
      for (let d = 0; d < doctors.length; d++) {
        for (let h = 0; h < 36; h++) {
          const offset = -180 + h * 5;
          const status: AppointmentStatus =
            h % 9 >= 7 ? 'CANCELLED' : 'COMPLETED';
          const appt = await appointment(
            `history:${d}:${h}`,
            offset,
            h % 8,
            status,
            h,
            d,
            h % 5 === 0,
          );
          if (status === 'COMPLETED') await charges(appt.id, h, appt.startTime);
          // A longitudinal record for all 12 demo patients in each branch.
          if (h < 12) await records(appt.id, h, d, appt.startTime);
        }
        for (const [s, status] of todayStatuses.entries()) {
          const appt = await appointment(`today:${d}:${s}`, 0, s, status, s, d);
          if (s < 3) await charges(appt.id, s, appt.startTime);
          if (s === 0 || s === 1) await records(appt.id, s, d, appt.startTime);
          if (d === 0 && s === 2) chatAppointmentId = appt.id;
        }
        for (let f = 0; f < 8; f++) {
          await appointment(
            `future:${d}:${f}`,
            1 + f * 3,
            f,
            f % 2 ? 'SCHEDULED' : 'CONFIRMED',
            f,
            d,
            f % 3 === 0,
          );
        }
      }
      for (let w = 0; w < 4; w++) {
        const appointmentId = id(`${clinicId}:whatsapp-lead:${w}`);
        await tx.appointment.upsert({
          where: { id: appointmentId },
          update: {},
          create: {
            id: appointmentId,
            clinicId,
            patientId: w < 2 ? patients[w] : null,
            doctorId: null,
            code: null,
            bookingChannel: 'WHATSAPP',
            status: 'SCHEDULED',
            contactName: w < 2 ? null : `Demo New Lead ${w - 1}`,
            contactPhone: w < 2 ? null : `+120255501${20 + w}`,
            contactEmail: w < 2 ? null : `lead-${w}@${mail}`,
            contactGender: w % 2 ? 'F' : 'M',
            contactDob: new Date('1994-05-12T00:00:00Z'),
            startTime: at(w + 1, 0),
            endTime: at(w + 1, 0),
            consultationType: TYPES[w],
            notes: 'Demo: pending WhatsApp request; accept or reject.',
          },
        });
      }

      // Never replace a provisioned connection or send any actual WhatsApp messages.
      let connection = await tx.whatsAppConnection.findUnique({ where: { clinicId } });
      if (!connection) {
        connection = await tx.whatsAppConnection.create({
          data: {
            id: id(`${clinicId}:connection`),
            clinicId,
            wabaId: `demo-${clinicId}`,
            phoneNumberId: `demo-${clinicId}`,
            displayNumber: '+1 202-555-0199 (Demo)',
            encryptedToken: 'demo-no-live-credentials',
            status: 'DISCONNECTED',
            templateName: 'demo_appointment_reminder',
            templateLanguage: 'en_US',
            templateBody: 'Hello {{1}}, your appointment at {{2}} is on {{3}}.',
            templateParameters: 3,
          },
        });
        await tx.clinic.update({ where: { id: clinicId }, data: { whatsAppEnabled: true } });
      }
      for (const [m, status] of ['SUBMITTED', 'FAILED', 'UNKNOWN', 'PENDING'].entries()) {
        const messageId = id(`${clinicId}:message:${m}`);
        const parameters = ['Omar Hassan (Demo)', clinic.name, today.toISOString().slice(0, 10)];
        const recipient = '+12025550102';
        const requestHash = createHash('sha256')
          .update(
            JSON.stringify({
              appointmentId: chatAppointmentId,
              recipient,
              connectionId: connection.id,
              templateName: connection.templateName,
              templateLanguage: connection.templateLanguage,
              parameters,
            }),
          )
          .digest('hex');
        await tx.whatsAppMessage.upsert({
          where: { id: messageId },
          update: {},
          create: {
            id: messageId,
            clinicId,
            appointmentId: chatAppointmentId,
            sentByUserId: admin.id,
            connectionId: connection.id,
            requestKey: id(`${messageId}:request`),
            requestHash,
            recipient,
            templateName: connection.templateName,
            templateLanguage: connection.templateLanguage,
            parameters,
            consentConfirmedAt: new Date(),
            status,
            metaMessageId: status === 'SUBMITTED' ? `demo.simulated.${messageId}` : null,
            errorCode:
              status === 'FAILED' ? 'DEMO_REJECTED' : status === 'UNKNOWN' ? 'DEMO_TIMEOUT' : null,
          },
        });
      }
      console.log(
        `${prefix}: ${branches.length} branches, ${patients.length} demo patients, ` +
          `${doctors.length * 50 + 4} demo appointments. Admin login: admin@${mail}`,
      );
    },
    { timeout: 120_000 },
  );
}

async function check(): Promise<void> {
  const counts = {
    clinics: await db.clinic.count(),
    branches: await db.branch.count(),
    users: await db.user.count(),
    doctors: await db.doctor.count(),
    doctor_shifts: await db.doctorShift.count(),
    doctor_blocks: await db.doctorBlock.count(),
    patients: await db.patient.count(),
    appointments: await db.appointment.count(),
    payments: await db.payment.count(),
    tooth_remarks: await db.toothRemark.count(),
    medical_history_entries: await db.medicalHistoryEntry.count(),
    observation_entries: await db.observationEntry.count(),
    patient_documents: await db.patientDocument.count(),
    record_audit_logs: await db.recordAuditLog.count(),
    counters: await db.counter.count(),
    whatsapp_connections: await db.whatsAppConnection.count(),
    whatsapp_messages: await db.whatsAppMessage.count(),
  };
  console.table(counts);
  for (const [table, count] of Object.entries(counts)) assert(count > 0, `${table} is empty`);
  // Validate only demo-owned artifacts; existing records need not follow demo conventions.
  const clinics = await db.clinic.findMany();
  for (const clinic of clinics) {
    const patients = await db.patient.findMany({ where: { clinicId: clinic.id } });
    for (let p = 0; p < NAMES.length; p++) {
      const patient = patients.find((row) => row.id === id(`${clinic.id}:patient:${p}`));
      assert(patient, `${clinic.code}: missing demo patient ${p}`);
      const docs = await db.patientDocument.findMany({ where: { patientId: patient.id } });
      for (const doc of docs) {
        const bytes = await readFile(storage.resolvePath(doc.storageKey));
        assert.equal(bytes.length, doc.size, `${doc.name}: file size mismatch`);
        assert(bytes.toString().includes('DEMO'), `${doc.name}: missing demo label`);
      }
      assert(
        new Set(docs.map((doc) => doc.category)).size === 3,
        `${patient.name}: missing document category`,
      );
      const visits = await db.appointment.findMany({
        where: { patientId: patient.id },
        include: {
          observationEntries: true,
          medicalHistoryEntries: true,
          toothRemarks: true,
        },
      });
      assert(
        visits.some(
          (v) =>
            v.observationEntries.length && v.medicalHistoryEntries.length && v.toothRemarks.length,
        ),
        `${patient.name}: missing linked clinical records`,
      );
      for (const visit of visits) {
        assert.equal(visit.clinicId, clinic.id, 'Cross-clinic appointment');
        for (const row of [
          ...visit.observationEntries,
          ...visit.medicalHistoryEntries,
          ...visit.toothRemarks,
        ]) {
          assert.equal(row.clinicId, clinic.id, 'Cross-clinic record');
          assert.equal(row.patientId, patient.id, 'Record linked to wrong patient');
        }
      }
    }
  }
  console.log(
    'Verified: all 17 application tables populated; demo relationships and document bytes are valid.',
  );
}

async function main(): Promise<void> {
  if (process.argv.includes('--check')) return check();
  if ((process.env.NODE_ENV ?? '').toLowerCase() === 'production') {
    throw new Error('Demo seed is disabled in production.');
  }
  const passwordHash = await hashPassword(PASSWORD);
  await db.$transaction(async (tx) => {
    // Also supports a migrated empty database, without calling any destructive seed.
    if (!(await tx.clinic.count())) {
      for (const [n, name] of [
        'Demo Bright Smile Dental',
        'Demo Gentle Care Dentistry',
      ].entries()) {
        await tx.clinic.create({
          data: {
            id: id(`clinic:${n}`),
            code: `DEMO00${n + 1}`,
            name,
            status: 'ACTIVE',
            plan: n ? 'BASIC' : 'PRO',
          },
        });
      }
    }
    if (!(await tx.user.count({ where: { role: 'SUPER_ADMIN' } }))) {
      await tx.user.create({
        data: {
          id: id('superadmin'),
          email: 'superadmin@demo.tootica.test',
          firstName: 'Super Admin',
          lastName: 'Demo',
          role: 'SUPER_ADMIN',
          passwordHash,
          mustResetPassword: false,
          termsAcceptedAt: new Date(),
        },
      });
    }
  });
  const clinics = await db.clinic.findMany({ orderBy: { code: 'asc' } });
  for (const clinic of clinics) await seedClinic(clinic.id, passwordHash);
  await check();
  console.log(`Demo accounts use ${PASSWORD}. Existing accounts and passwords are unchanged.`);
  console.log('WhatsApp history is simulated; sending requires a real provisioned connection.');
  console.log(
    'Re-runs preserve demo edits and dates. Use a fresh database for a newly dated demo.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
