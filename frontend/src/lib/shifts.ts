/**
 * Frontend-only store for doctor shifts (the Edit Doctor Shift page). The
 * backend doctor-shifts endpoints aren't built yet, so shifts are persisted in
 * `localStorage` per doctor — enough to survive navigation/reload. Swap these
 * helpers for a real API once it exists; callers only depend on the functions.
 *
 * A shift is one picked date + a recurrence describing how it repeats, plus a
 * time window. These helpers expand shifts into per-date availability windows,
 * which drive the Doctor Availability popup (green) and the New Appointment
 * availability checks (a doctor is only available inside a shift window).
 */

export interface StoredShift {
  id: string;
  /** Dates picked together in one "Add Shift" share a groupId, so the editor
   *  table can show them as a single row with a date range. Optional for shifts
   *  saved before grouping existed. */
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
const storageKey = (doctorId: string) => `tootica.shifts.${doctorId}`;

export function loadShifts(doctorId: string): StoredShift[] {
  if (typeof window === "undefined" || !doctorId) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(doctorId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as StoredShift[]) : [];
  } catch {
    return [];
  }
}

export function saveShifts(doctorId: string, shifts: StoredShift[]): void {
  if (typeof window === "undefined" || !doctorId) return;
  try {
    window.localStorage.setItem(storageKey(doctorId), JSON.stringify(shifts));
  } catch {
    // Best-effort persistence — ignore quota/serialization failures.
  }
}

/** dd/mm/yyyy → Date at local midnight (or null when unparseable). */
function parseDate(dmy: string): Date | null {
  const [d, m, y] = dmy.split("/").map(Number);
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
  const h = Number(m[1]) % 12 + (m[3].toUpperCase() === "PM" ? 12 : 0);
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

/** The doctor's availability windows for a date, from their stored shifts. */
export function shiftWindowsForDate(doctorId: string, date: Date): ShiftWindow[] {
  return loadShifts(doctorId)
    .filter((s) => shiftAppliesOn(s, date))
    .map((s) => parseTiming(s.timing))
    .filter((w): w is ShiftWindow => w !== null);
}

/** Is the [fromMin, toMin] slot fully inside a shift window on the date? */
export function isSlotOnShift(
  doctorId: string,
  date: Date,
  fromMin: number,
  toMin: number,
): boolean {
  return shiftWindowsForDate(doctorId, date).some(
    (w) => fromMin >= w.startMin && toMin <= w.endMin,
  );
}

/* ------------------------------------------------------------- blocked slots */

/**
 * A time range on a specific date the doctor has marked as Blocked (unavailable
 * for booking) from the Doctor Availability popup — e.g. a personal block within
 * an otherwise-available shift. Persisted per doctor alongside shifts.
 */
export interface BlockedSlot {
  id: string;
  /** dd/mm/yyyy */
  date: string;
  /** minutes since midnight */
  startMin: number;
  endMin: number;
}

const blocksKey = (doctorId: string) => `tootica.blocks.${doctorId}`;

/** Date → dd/mm/yyyy (local), the key blocked slots are stored/matched against. */
export function dmy(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(date.getDate())}/${p(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function loadBlocks(doctorId: string): BlockedSlot[] {
  if (typeof window === "undefined" || !doctorId) return [];
  try {
    const raw = window.localStorage.getItem(blocksKey(doctorId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as BlockedSlot[]) : [];
  } catch {
    return [];
  }
}

export function saveBlocks(doctorId: string, blocks: BlockedSlot[]): void {
  if (typeof window === "undefined" || !doctorId) return;
  try {
    window.localStorage.setItem(blocksKey(doctorId), JSON.stringify(blocks));
  } catch {
    // Best-effort persistence.
  }
}

/** Does the [fromMin, toMin] slot overlap any blocked slot on the date? */
export function isSlotBlocked(
  doctorId: string,
  date: Date,
  fromMin: number,
  toMin: number,
): boolean {
  const key = dmy(date);
  return loadBlocks(doctorId).some(
    (b) => b.date === key && fromMin < b.endMin && toMin > b.startMin,
  );
}
