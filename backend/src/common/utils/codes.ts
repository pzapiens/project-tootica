import { prisma } from '../db/prisma';

/**
 * Human-friendly display codes for the core entities. Every child code is
 * PREFIXED with its clinic's own code (assigned by the super admin, e.g.
 * "TDG001") and sequenced PER CLINIC via the `counters` table:
 *
 *   Branch       TDG001-B001      (per-clinic, 3-digit)
 *   Doctor       TDG001-D001      (per-clinic, 3-digit)
 *   Patient      TDG001-P000001   (per-clinic, 6-digit)
 *   Appointment  TDG001-A000001   (per-clinic, 6-digit)
 *
 * The counter upsert is a single atomic statement, so codes are unique even
 * under concurrency. A failed entity create may skip a number — gaps in display
 * codes are harmless. The clinic code itself is not sequenced here; it's entered
 * by the super admin on clinic creation.
 */
const pad = (n: number, width: number): string => String(n).padStart(width, '0');

/** Atomically bump a named counter and return the new value. */
async function bump(name: string): Promise<number> {
  const counter = await prisma.counter.upsert({
    where: { name },
    update: { value: { increment: 1 } },
    create: { name, value: 1 },
  });
  return counter.value;
}

/** The clinic's assigned code (e.g. "TDG001") that prefixes all child codes. */
async function clinicCodeFor(clinicId: string): Promise<string> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { code: true },
  });
  if (!clinic?.code) {
    throw new Error(`Clinic ${clinicId} has no code assigned`);
  }
  return clinic.code;
}

export const nextBranchCode = async (clinicId: string): Promise<string> =>
  nextBranchCodeFor(clinicId, await clinicCodeFor(clinicId));

/**
 * Branch code from an already-known clinic code — for creating a clinic and its
 * branches in one transaction, where the clinic row isn't committed yet so
 * `clinicCodeFor` (a separate read) wouldn't see it.
 */
export const nextBranchCodeFor = async (
  clinicId: string,
  clinicCode: string,
): Promise<string> => `${clinicCode}-B${pad(await bump(`branch:${clinicId}`), 3)}`;

export const nextDoctorCode = async (clinicId: string): Promise<string> =>
  `${await clinicCodeFor(clinicId)}-D${pad(await bump(`doctor:${clinicId}`), 3)}`;

export const nextPatientCode = async (clinicId: string): Promise<string> =>
  `${await clinicCodeFor(clinicId)}-P${pad(await bump(`patient:${clinicId}`), 6)}`;

export const nextAppointmentCode = async (clinicId: string): Promise<string> =>
  `${await clinicCodeFor(clinicId)}-A${pad(await bump(`appointment:${clinicId}`), 6)}`;
