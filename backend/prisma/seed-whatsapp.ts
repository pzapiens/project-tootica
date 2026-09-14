/**
 * WhatsApp-booking test seed — makes each clinic have EXACTLY `WHATSAPP_TARGET`
 * pending "WhatsApp" bookings, for exercising the accept / reject flow.
 *
 *   npm run db:seed:whatsapp
 *
 * A WhatsApp booking always arrives SCHEDULED (→ "Pending") with NO doctor and
 * NO time slot (the patient can't pick either over WhatsApp), so these surface
 * only in the appointments page's "WhatsApp Appointments" popup until staff
 * accept them (→ CONFIRMED, now in the main table) or reject them (deleted).
 *
 * This script FIRST clears the clinic's existing pending (SCHEDULED) bookings,
 * then inserts a fresh set of `WHATSAPP_TARGET` — so re-running always leaves a
 * clean, predictable set to test with. It only ever touches SCHEDULED rows;
 * confirmed / completed / cancelled history is left untouched. Refuses to run
 * when NODE_ENV=production.
 */
import { prisma } from '../src/common/db/prisma';

// How many pending WhatsApp bookings each clinic should end up with.
const WHATSAPP_TARGET = 5;

// Pools mirroring seed-appointments.ts so the rows show values the frontend
// dropdowns also offer.
const CONSULTATION_TYPES = [
  'GENERAL CONSULTATION / XRAY',
  'ROOT CANAL TREATMENT',
  'SCALING',
  'TEETH WHITENING',
  'ORTHODONTIC TREATMENT BRACES / ALIGNERS',
  'IMPLANTS',
  'GUM RELATED TREATMENTS',
];
const NOTES = [
  'New booking — awaiting confirmation',
  'Requested appointment',
  'Follow-up requested',
  'Consultation',
  'Toothache — needs a slot this week',
];

const pick = <T>(arr: T[], i: number): T => arr[i % arr.length];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed appointments with NODE_ENV=production');
  }

  const clinics = await prisma.clinic.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  });
  if (clinics.length === 0) {
    throw new Error('No clinics found — run `npm run db:provision` first.');
  }

  const today = new Date();
  let grandTotal = 0;

  for (const clinic of clinics) {
    const patients = await prisma.patient.findMany({
      where: { clinicId: clinic.id },
      select: { id: true },
    });
    if (patients.length === 0) {
      console.warn(`  ! ${clinic.name}: no patients — skipping.`);
      continue;
    }

    // Clear this clinic's existing pending bookings so we end up with exactly
    // WHATSAPP_TARGET (leaves all non-pending history untouched).
    const cleared = await prisma.appointment.deleteMany({
      where: { clinicId: clinic.id, status: 'SCHEDULED' },
    });

    for (let i = 0; i < WHATSAPP_TARGET; i += 1) {
      // Future-dated, no doctor, zero-duration (no time slot).
      const day = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + 1 + i * 2,
        0, 0, 0, 0,
      );
      await prisma.appointment.create({
        data: {
          clinicId: clinic.id,
          // No code yet — a pending WhatsApp booking claims its sequential code
          // only when staff accept it (matches the inbound-webhook behaviour).
          patientId: pick(patients, i).id,
          doctorId: null,
          startTime: day,
          endTime: day,
          status: 'SCHEDULED',
          bookingChannel: 'WHATSAPP',
          sourceOfEnquiry: 'WHATSAPP',
          consultationType: pick(CONSULTATION_TYPES, i),
          notes: pick(NOTES, i),
          createdAt: today,
        },
      });
      grandTotal += 1;
    }

    console.log(
      `  ${clinic.name}: cleared ${cleared.count} pending, added ${WHATSAPP_TARGET} fresh.`,
    );
  }

  console.log(`\nDone. ${grandTotal} pending WhatsApp bookings across ${clinics.length} clinics.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
