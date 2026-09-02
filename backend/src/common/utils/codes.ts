import { prisma } from '../db/prisma';

/**
 * Human-friendly display codes for the core entities, backed by the `counters`
 * table. Each call atomically increments the relevant counter and formats the
 * value:
 *
 *   Clinic       CL-000123
 *   Branch       BR-0001
 *   Patient      PAT-000001
 *   Doctor       DOC-000001
 *   Appointment  APT-20260830-0001   (date of the appointment + daily sequence)
 *
 * The counter upsert is a single atomic statement, so codes are unique even
 * under concurrency. A failed entity create may skip a number — gaps in display
 * codes are harmless.
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

export const nextClinicCode = async (): Promise<string> => `CL-${pad(await bump('clinic'), 6)}`;

export const nextBranchCode = async (): Promise<string> => `BR-${pad(await bump('branch'), 4)}`;

export const nextPatientCode = async (): Promise<string> => `PAT-${pad(await bump('patient'), 6)}`;

export const nextDoctorCode = async (): Promise<string> => `DOC-${pad(await bump('doctor'), 6)}`;

/** `APT-<yyyymmdd>-<nnnn>`, where the sequence resets per calendar day. */
export const nextAppointmentCode = async (date: Date): Promise<string> => {
  const ymd = `${date.getFullYear()}${pad(date.getMonth() + 1, 2)}${pad(date.getDate(), 2)}`;
  return `APT-${ymd}-${pad(await bump(`appointment:${ymd}`), 4)}`;
};
