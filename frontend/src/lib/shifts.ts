/**
 * Doctor shifts + availability blocks, persisted on the backend
 * (`/api/doctors/:id/shifts` and `/api/doctors/:id/blocks`, replace-all PUTs).
 *
 * The backend stores canonical forms — date "YYYY-MM-DD", time "HH:mm" 24h —
 * which these helpers map to/from the shapes the UI works in: a shift's date is
 * "dd/mm/yyyy" and its window is a "09:00 AM - 06:00 PM" timing string; a block
 * is a minutes-since-midnight range.
 *
 * A shift is one picked date + a recurrence describing how it repeats, plus a
 * time window. The pure helpers below expand shifts into per-date availability
 * windows, which drive the Doctor Availability popup (green) and the New
 * Appointment availability checks (a doctor is only available inside a shift
 * window). All pure helpers operate on arrays the caller has already fetched.
 */

import { apiFetch } from "./api";

export interface StoredShift {
  id: string;
  /** Dates picked together in one "Add Shift" share a groupId, so the editor
   *  table can show them as a single row with a date range. */
  groupId?: string;
  /** Day | Weekly | Biweekly | Monthly | Yearly | Every day */
  frequency: string;
  /** dd/mm/yyyy — the picked date the recurrence starts from. */
  date: string;
  /** "09:00 AM - 06:00 PM" */
  timing: string;
}

/** An availability window in minutes since midnight. */
export interface ShiftWindow {
  startMin: number;
  endMin: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/* ----------------------------------------------------------- canonical <-> UI */

/** "YYYY-MM-DD" → "dd/mm/yyyy". */
function isoToDmy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
/** "dd/mm/yyyy" → "YYYY-MM-DD" (or null when unparseable). */
function dmyToIso(dmyStr: string): string | null {
  const [d, m, y] = dmyStr.split("/");
  if (!d || !m || !y) return null;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}
/** "HH:mm" (24h) → minutes since midnight. */
function hhmmToMin(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}
/** minutes since midnight → "HH:mm" (24h). */
function minToHhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
/** "HH:mm" (24h) → "hh:mm AM". */
function hhmmTo12h(hm: string): string {
  return minTo12h(hhmmToMin(hm));
}
/** minutes since midnight → "hh:mm AM". */
function minTo12h(min: number): string {
  const h24 = Math.floor(min / 60);
  const period = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 || 12;
  return `${String(h).padStart(2, "0")}:${String(min % 60).padStart(2, "0")} ${period}`;
}

/** Backend shift row (canonical). */
interface ShiftDto {
  id: string;
  groupId: string | null;
  frequency: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}
/** Backend block row (canonical). */
interface BlockDto {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

function dtoToShift(d: ShiftDto): StoredShift {
  return {
    id: d.id,
    groupId: d.groupId ?? undefined,
    frequency: d.frequency,
    date: isoToDmy(d.date),
    timing: `${hhmmTo12h(d.startTime)} - ${hhmmTo12h(d.endTime)}`,
  };
}

/** StoredShift → canonical DTO for saving (id omitted — the DB assigns it). */
function shiftToDto(s: StoredShift): Omit<ShiftDto, "id"> | null {
  const iso = dmyToIso(s.date);
  const win = parseTiming(s.timing);
  if (!iso || !win) return null;
  return {
    groupId: s.groupId ?? null,
    frequency: s.frequency,
    date: iso,
    startTime: minToHhmm(win.startMin),
    endTime: minToHhmm(win.endMin),
  };
}

function dtoToBlock(d: BlockDto): BlockedSlot {
  return {
    id: d.id,
    date: isoToDmy(d.date),
    startMin: hhmmToMin(d.startTime),
    endMin: hhmmToMin(d.endTime),
  };
}

function blockToDto(b: BlockedSlot): Omit<BlockDto, "id"> | null {
  const iso = dmyToIso(b.date);
  if (!iso) return null;
  return { date: iso, startTime: minToHhmm(b.startMin), endTime: minToHhmm(b.endMin) };
}

/* --------------------------------------------------------------- shifts: I/O */

export async function fetchShifts(doctorId: string): Promise<StoredShift[]> {
  if (!doctorId) return [];
  const rows = await apiFetch<ShiftDto[]>(`/doctors/${doctorId}/shifts`);
  return rows.map(dtoToShift);
}

/** Replace the doctor's whole shift set (the editor saves all at once). */
export async function saveShifts(doctorId: string, shifts: StoredShift[]): Promise<void> {
  if (!doctorId) return;
  const payload = shifts
    .map(shiftToDto)
    .filter((s): s is Omit<ShiftDto, "id"> => s !== null);
  await apiFetch(`/doctors/${doctorId}/shifts`, {
    method: "PUT",
    body: JSON.stringify({ shifts: payload }),
  });
}

/** dd/mm/yyyy → Date at local midnight (or null when unparseable). */
function parseDate(dmyStr: string): Date | null {
  const [d, m, y] = dmyStr.split("/").map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
}

/** Does a shift's recurrence include the given date? Mirrors the shift
 *  calendar's marking — each pattern repeats forward from the picked date. */
export function shiftAppliesOn(shift: StoredShift, date: Date): boolean {
  const pick = parseDate(shift.date);
  if (!pick) return false;
  const cur = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (cur < pick) return false;
  switch (shift.frequency) {
    case "Day":
      return cur.getTime() === pick.getTime();
    case "Every day":
      return true;
    case "Weekly":
      return cur.getDay() === pick.getDay();
    case "Biweekly":
      return (
        cur.getDay() === pick.getDay() &&
        Math.round((cur.getTime() - pick.getTime()) / DAY_MS / 7) % 2 === 0
      );
    case "Monthly":
      return cur.getDate() === pick.getDate();
    case "Yearly":
      return cur.getMonth() === pick.getMonth() && cur.getDate() === pick.getDate();
    default:
      return false;
  }
}

/** "hh:mm AM/PM" → minutes since midnight (or null). */
function timeToMin(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  const h = (Number(m[1]) % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0);
  return h * 60 + Number(m[2]);
}

/** "09:00 AM - 06:00 PM" → a window (or null when unparseable/empty). */
function parseTiming(timing: string): ShiftWindow | null {
  const [a, b] = timing.split("-");
  if (!a || !b) return null;
  const startMin = timeToMin(a);
  const endMin = timeToMin(b);
  if (startMin === null || endMin === null || startMin >= endMin) return null;
  return { startMin, endMin };
}

/** The doctor's availability windows for a date, from the given shifts. */
export function shiftWindowsForDate(shifts: StoredShift[], date: Date): ShiftWindow[] {
  return shifts
    .filter((s) => shiftAppliesOn(s, date))
    .map((s) => parseTiming(s.timing))
    .filter((w): w is ShiftWindow => w !== null);
}

/** Is the [fromMin, toMin] slot fully inside a shift window on the date? */
export function isSlotOnShift(
  shifts: StoredShift[],
  date: Date,
  fromMin: number,
  toMin: number,
): boolean {
  return shiftWindowsForDate(shifts, date).some(
    (w) => fromMin >= w.startMin && toMin <= w.endMin,
  );
}

/* ------------------------------------------------------------- blocked slots */

/**
 * A time range on a specific date the doctor has marked as Blocked (unavailable
 * for booking) from the Doctor Availability popup — e.g. a personal block within
 * an otherwise-available shift.
 */
export interface BlockedSlot {
  id: string;
  /** dd/mm/yyyy */
  date: string;
  /** minutes since midnight */
  startMin: number;
  endMin: number;
}

/** Date → dd/mm/yyyy (local), the key blocked slots are stored/matched against. */
export function dmy(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(date.getDate())}/${p(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export async function fetchBlocks(doctorId: string): Promise<BlockedSlot[]> {
  if (!doctorId) return [];
  const rows = await apiFetch<BlockDto[]>(`/doctors/${doctorId}/blocks`);
  return rows.map(dtoToBlock);
}

/** Replace the doctor's whole set of blocked slots. */
export async function saveBlocks(doctorId: string, blocks: BlockedSlot[]): Promise<void> {
  if (!doctorId) return;
  const payload = blocks
    .map(blockToDto)
    .filter((b): b is Omit<BlockDto, "id"> => b !== null);
  await apiFetch(`/doctors/${doctorId}/blocks`, {
    method: "PUT",
    body: JSON.stringify({ blocks: payload }),
  });
}

/** Does the [fromMin, toMin] slot overlap any blocked slot on the date? */
export function isSlotBlocked(
  blocks: BlockedSlot[],
  date: Date,
  fromMin: number,
  toMin: number,
): boolean {
  const key = dmy(date);
  return blocks.some((b) => b.date === key && fromMin < b.endMin && toMin > b.startMin);
}
