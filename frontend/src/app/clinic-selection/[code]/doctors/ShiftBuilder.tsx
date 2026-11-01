"use client";

import Image from "next/image";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { useExclusiveDropdown } from "@/lib/useExclusiveDropdown";
import { Tip } from "@/components/HoverTip";
import type { StoredShift } from "@/lib/shifts";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];
const RECURRENCES = [
  "Day",
  "Weekly",
  "Biweekly",
  "Monthly",
  "Yearly",
  "Every day",
];
const DAY_PRESETS = [
  { label: "Mon to Sat", days: [1, 2, 3, 4, 5, 6] },
  { label: "Sat to Sun", days: [6, 0] },
  { label: "Sun", days: [0] },
];
const TIME_PRESETS = [
  { label: "9AM to 6PM", start: "09", end: "06", period: "AM" as const },
  { label: "2PM to 6PM", start: "02", end: "06", period: "PM" as const },
  { label: "6PM to 10PM", start: "06", end: "10", period: "PM" as const },
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** How many years past the present the calendar's year picker offers. */
const YEAR_RANGE = 10;

const p2 = (n: number) => String(n).padStart(2, "0");

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The extra dates a recurrence implies within one visible month, given the
 * picked dates. Each pattern repeats FORWARD from its own picked date, so only
 * days on/after a pick are marked:
 *   - Day        → only the pick itself (no extra dates)
 *   - Weekly     → the same weekday every week
 *   - Biweekly   → the same weekday every second week
 *   - Monthly    → the same day-of-month every month
 *   - Yearly     → the same month + day every year
 *   - Every day  → every date from the pick onward
 */
function recurringKeysForMonth(
  selected: Set<string>,
  recurrence: string,
  year: number,
  month: number,
): Set<string> {
  const out = new Set<string>();
  if (selected.size === 0 || recurrence === "" || recurrence === "Day")
    return out;

  const picks = [...selected].map((k) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d);
  });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const cur = new Date(year, month, day);
    const matches = picks.some((pick) => {
      if (cur < pick) return false;
      switch (recurrence) {
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
          return (
            cur.getMonth() === pick.getMonth() &&
            cur.getDate() === pick.getDate()
          );
        default:
          return false;
      }
    });
    if (matches) out.add(`${year}-${p2(month + 1)}-${p2(day)}`);
  }
  return out;
}

/**
 * Dates already committed to the shifts table — each row's picked date plus the
 * occurrences its recurrence implies — for the given visible month.
 */
function shiftKeysForMonth(
  shifts: Shift[],
  year: number,
  month: number,
): Set<string> {
  const out = new Set<string>();
  for (const s of shifts) {
    const [d, m, y] = s.date.split("/");
    const key = `${y}-${m}-${d}`;
    if (Number(y) === year && Number(m) - 1 === month) out.add(key);
    recurringKeysForMonth(new Set([key]), s.frequency, year, month).forEach(
      (k) => out.add(k),
    );
  }
  return out;
}

type Shift = StoredShift;
type ShiftGroup = Shift & { members: Shift[]; dayDateLabel: string };

function shiftDate(shift: Shift): Date {
  const [day, month, year] = shift.date.split("/").map(Number);
  return new Date(year, month - 1, day);
}

/** Compress consecutive days while keeping gaps visible (Mon, Wed to Fri). */
function weekdayLabel(members: Shift[]): string {
  const days = [
    ...new Set(members.map((s) => (shiftDate(s).getDay() + 6) % 7)),
  ].sort((a, b) => a - b);
  const ranges: string[] = [];
  for (let i = 0; i < days.length; i++) {
    const start = days[i];
    while (i + 1 < days.length && days[i + 1] === days[i] + 1) i++;
    const end = days[i];
    ranges.push(
      start === end ? WEEKDAYS[start] : `${WEEKDAYS[start]} to ${WEEKDAYS[end]}`,
    );
  }
  return ranges.join(", ");
}

function dayDateLabel(members: Shift[]): string {
  if (["Weekly", "Biweekly"].includes(members[0].frequency)) {
    return weekdayLabel(members);
  }
  if (members[0].frequency === "Every day") return "Mon to Sun";
  const dates = [...new Map(members.map((s) => [s.date, s])).values()].sort(
    (a, b) => shiftDate(a).getTime() - shiftDate(b).getTime(),
  );
  const ranges: string[] = [];
  for (let i = 0; i < dates.length; i++) {
    const start = dates[i].date;
    while (i + 1 < dates.length) {
      const next = shiftDate(dates[i]);
      next.setDate(next.getDate() + 1);
      if (next.getTime() !== shiftDate(dates[i + 1]).getTime()) break;
      i++;
    }
    const end = dates[i].date;
    ranges.push(start === end ? start : `${start} to ${end}`);
  }
  return ranges.join(", ");
}

interface TimeParts {
  hh: string;
  mm: string;
  period: "AM" | "PM";
}

const emptyTime = (): TimeParts => ({ hh: "", mm: "", period: "AM" });

function fmtTime(t: TimeParts): string {
  return `${p2(Number(t.hh))}:${p2(Number(t.mm))} ${t.period}`;
}

function timeValid(t: TimeParts): boolean {
  const h = Number(t.hh);
  const m = Number(t.mm);
  return t.hh !== "" && t.mm !== "" && h >= 1 && h <= 12 && m >= 0 && m <= 59;
}

function timeMinutes(t: TimeParts): number {
  return (
    ((Number(t.hh) % 12) + (t.period === "PM" ? 12 : 0)) * 60 + Number(t.mm)
  );
}

/** "09:00 AM" → TimeParts (or null), for loading a shift back into the form. */
function parseTimeToParts(s: string): TimeParts | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  return { hh: m[1], mm: m[2], period: m[3].toUpperCase() as "AM" | "PM" };
}

export default function ShiftBuilder({
  shifts,
  onChange: setShifts,
  compact = false,
  disabled = false,
}: {
  shifts: StoredShift[];
  onChange: Dispatch<SetStateAction<StoredShift[]>>;
  compact?: boolean;
  disabled?: boolean;
}) {
  // Calendar view + multi-selected dates (yyyy-mm-dd keys).
  const [view, setView] = useState(() => new Date());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [recurrence, setRecurrence] = useState("");
  const [from, setFrom] = useState<TimeParts>(emptyTime);
  const [to, setTo] = useState<TimeParts>(emptyTime);
  const [dayPreset, setDayPreset] = useState<string | null>(null);
  const [timePreset, setTimePreset] = useState<string | null>(null);

  // The shift group awaiting delete confirmation (null = no dialog open).
  const [pendingDelete, setPendingDelete] = useState<ShiftGroup | null>(null);
  // The shift group being edited — its values are loaded into the Add Shifts
  // builder and "Add Shift" becomes "Update Shift" (null = adding a new shift).
  const [editingGroup, setEditingGroup] = useState<ShiftGroup | null>(null);
  // Monotonic counter for group ids (avoids impure Date.now() in render).
  const shiftSeq = useRef(0);
  // Selecting a calendar date auto-picks "Day" recurrence when the user hasn't
  // chosen one yet, so a single-date shift is ready to add without a manual step.
  // Removing dates never changes recurrence, and an existing choice is kept.
  function toggleDate(key: string) {
    setDayPreset(null);
    const isAdding = !selected.has(key);
    // Removing the last remaining date empties the selection.
    const willBeEmpty = !isAdding && selected.size === 1 && selected.has(key);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    // Recurrence is gated on having a date: default it to "Day" on the first
    // pick, and clear it again once every date is deselected.
    if (isAdding && recurrence === "") setRecurrence("Day");
    else if (willBeEmpty) setRecurrence("");
  }

  const canAdd =
    !disabled &&
    selected.size > 0 &&
    recurrence !== "" &&
    timeValid(from) &&
    timeValid(to) &&
    timeMinutes(from) < timeMinutes(to);

  function addShift() {
    if (!canAdd) return;
    const timing = `${fmtTime(from)} - ${fmtTime(to)}`;
    // All dates picked in this one add share a groupId → a single table row.
    const groupId = `grp-${crypto.randomUUID()}-${shiftSeq.current++}`;
    const rows: Shift[] = [...selected].sort().map((key, i) => {
      const [y, m, d] = key.split("-");
      return {
        id: `${key}-${groupId}-${i}`,
        groupId,
        frequency: recurrence,
        date: `${d}/${m}/${y}`,
        timing,
      };
    });
    // Editing replaces the entire group; adding appends. Both reset the builder.
    setShifts((prev) => {
      const editingIds = new Set(editingGroup?.members.map((s) => s.id));
      const base = prev.filter((x) => !editingIds.has(x.id));
      return [...base, ...rows];
    });
    setSelected(new Set());
    setEditingGroup(null);
    setDayPreset(null);
    setTimePreset(null);
  }

  /** Load every date in a shift group back into the builder to edit together. */
  function editShift(s: ShiftGroup) {
    const weekdays = new Set(s.members.map((member) => shiftDate(member).getDay()));
    setDayPreset(
      s.frequency === "Weekly"
        ? DAY_PRESETS.find(
            (preset) =>
              preset.days.length === weekdays.size &&
              preset.days.every((day) => weekdays.has(day)),
          )?.label ?? null
        : null,
    );
    setTimePreset(
      TIME_PRESETS.find(
        (preset) =>
          s.timing === `${preset.start}:00 ${preset.period} - ${preset.end}:00 PM`,
      )?.label ?? null,
    );
    const [, m, y] = s.date.split("/");
    setView(new Date(Number(y), Number(m) - 1, 1));
    setSelected(
      new Set(
        s.members.map((member) => {
          const [day, month, year] = member.date.split("/");
          return `${year}-${month}-${day}`;
        }),
      ),
    );
    setRecurrence(s.frequency);
    const [a, b] = s.timing.split(" - ");
    const fa = a ? parseTimeToParts(a) : null;
    const fb = b ? parseTimeToParts(b) : null;
    if (fa) setFrom(fa);
    if (fb) setTo(fb);
    setEditingGroup(s);
  }

  /** Abandon an in-progress edit, restoring the builder to a fresh state. */
  function cancelEdit() {
    setDayPreset(null);
    setTimePreset(null);
    setEditingGroup(null);
    setSelected(new Set());
    setRecurrence("");
    setFrom(emptyTime());
    setTo(emptyTime());
  }

  function removeShift(group: ShiftGroup) {
    if (disabled) return;
    const ids = new Set(group.members.map((s) => s.id));
    setShifts((prev) => prev.filter((s) => !ids.has(s.id)));
    if (editingGroup?.members.some((s) => ids.has(s.id))) cancelEdit();
  }

  function selectDays(label: string, days: number[]) {
    if (dayPreset === label) {
      setSelected(new Set());
      setRecurrence("");
      setDayPreset(null);
      return;
    }

    const year = view.getFullYear();
    const month = view.getMonth();
    const picks = new Set<string>();
    // Anchor at the month's first occurrence of each weekday so the whole
    // visible month is marked, with one recurring shift per weekday when added.
    for (let offset = 0; offset < 7; offset++) {
      const date = new Date(year, month, 1 + offset);
      if (days.includes(date.getDay())) {
        picks.add(
          `${date.getFullYear()}-${p2(date.getMonth() + 1)}-${p2(date.getDate())}`,
        );
      }
    }
    setSelected(picks);
    setRecurrence("Weekly");
    setDayPreset(label);
  }

  // The table lists shifts in date order (then by start time), regardless of the
  // order they were added or edited. Stored order itself is left untouched.
  const shiftGroups = useMemo(() => {
    const dateKey = (dmy: string) => {
      const [d, m, y] = dmy.split("/").map(Number);
      return y * 10000 + m * 100 + d;
    };
    const startKey = (timing: string) => {
      const parts = parseTimeToParts(timing.split(" - ")[0] ?? "");
      if (!parts) return 0;
      const h = (Number(parts.hh) % 12) + (parts.period === "PM" ? 12 : 0);
      return h * 60 + Number(parts.mm);
    };
    const sorted = [...shifts].sort(
      (a, b) =>
        dateKey(a.date) - dateKey(b.date) ||
        startKey(a.timing) - startKey(b.timing),
    );
    const groups = new Map<string, Shift[]>();
    for (const shift of sorted) {
      const key = JSON.stringify([
        shift.groupId ? ["group", shift.groupId] : ["shift", shift.id],
        shift.frequency,
        shift.timing,
      ]);
      const members = groups.get(key) ?? [];
      members.push(shift);
      groups.set(key, members);
    }
    return [...groups.values()].map((members): ShiftGroup => ({
      ...members[0],
      members,
      dayDateLabel: dayDateLabel(members),
    }));
  }, [shifts]);

  const tableGrid = compact
    ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_100px]"
    : "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_120px]";

  return (
    <fieldset
      disabled={disabled}
      className={`min-w-0 border-0 p-0 flex flex-col ${compact ? "gap-4" : "gap-8"}`}
    >
      {/* Add Shifts */}
      <div
        className={
          compact
            ? "flex flex-col gap-5"
            : "flex flex-col gap-[24px] rounded-[28px] border-[1.2px] border-[#c2c6d4] p-[28px]"
        }
      >
        <div className="flex items-center gap-[10px]">
          <Image
            src="/dashboard/calendar_today.svg"
            alt=""
            width={24}
            height={24}
            className="size-6"
          />
          <h2
            className={`font-manrope font-semibold tracking-[-0.4px] text-[#1e1e24] ${compact ? "text-[18px]" : "text-[22px]"}`}
          >
            Add Shifts
          </h2>
        </div>

        <div
          className={
            compact
              ? "grid gap-6 md:grid-cols-2"
              : "grid grid-cols-[minmax(0,460px)_1fr] gap-[40px]"
          }
        >
          {/* Calendar */}
          <div className="flex min-w-0 flex-col gap-3">
            <MonthCalendar
              view={view}
              onView={setView}
              selected={selected}
              recurrence={recurrence}
              shifts={shifts}
              onToggle={toggleDate}
              compact={compact}
            />
            <div className="flex flex-wrap gap-2.5">
              {DAY_PRESETS.map(({ label, days }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => selectDays(label, days)}
                  aria-pressed={dayPreset === label}
                  className={`rounded-full border px-3 py-1 font-inter text-[13px] leading-[18px] ${dayPreset === label ? "border-brand bg-brand text-white" : "border-field-border text-[#1e1e24] hover:border-brand"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Recurrence + time range */}
          <div
            className={
              compact
                ? "flex min-w-0 flex-col gap-6 md:pt-6"
                : "flex flex-col gap-[28px]"
            }
          >
            <Field label="Shift Recurrence" required>
              <Dropdown
                value={recurrence}
                onChange={(value) => {
                  setRecurrence(value);
                  if (value !== "Weekly") setDayPreset(null);
                }}
                options={RECURRENCES}
                placeholder="Select"
                disabled={selected.size === 0}
              />
            </Field>

            <div className="flex flex-col gap-[12px]">
              <span className="font-inter text-[11px] font-normal uppercase tracking-[0.5px] text-[#1e1e24]">
                Time Range <span className="text-red-500">*</span>
              </span>
              <div
                className={`flex flex-wrap items-end ${compact ? "gap-2" : "gap-[24px]"}`}
              >
                <TimeField
                  label="From"
                  value={from}
                  onChange={(value) => {
                    setFrom(value);
                    setTimePreset(null);
                  }}
                  compact={compact}
                />
                <TimeField
                  label="To"
                  value={to}
                  onChange={(value) => {
                    setTo(value);
                    setTimePreset(null);
                  }}
                  compact={compact}
                />
              </div>
              {timeValid(from) &&
                timeValid(to) &&
                timeMinutes(from) >= timeMinutes(to) && (
                  <p
                    role="alert"
                    className="font-inter text-[12px] text-red-500"
                  >
                    End time must be after start time.
                  </p>
                )}
              <div className="flex flex-wrap gap-2.5 pt-1.5">
                {TIME_PRESETS.map(({ label, start, end, period }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      if (timePreset === label) {
                        setFrom(emptyTime());
                        setTo(emptyTime());
                        setTimePreset(null);
                        return;
                      }
                      setFrom({ hh: start, mm: "00", period });
                      setTo({ hh: end, mm: "00", period: "PM" });
                      setTimePreset(label);
                    }}
                    aria-pressed={timePreset === label}
                    className={`rounded-full border px-3 py-1 font-inter text-[13px] leading-[18px] ${timePreset === label ? "border-brand bg-brand text-white" : "border-field-border text-[#1e1e24] hover:border-brand"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-[16px]">
              <button
                type="button"
                onClick={addShift}
                disabled={!canAdd}
                className={`${compact ? "h-12 rounded-lg text-[14px]" : "h-[54px] rounded-[12px] text-[16px]"} flex-1 font-inter font-semibold text-white transition-colors ${
                  canAdd
                    ? "bg-[#0077c0] hover:bg-[#0069a8]"
                    : "cursor-not-allowed bg-[#7fb9dd]"
                }`}
              >
                {editingGroup ? "Update Shift" : "Add Shift"}
              </button>
              {editingGroup && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="h-[54px] rounded-[12px] border-[1.2px] border-[#c2c6d4] px-[24px] font-inter text-[16px] font-semibold text-[#1e1e24] transition-colors hover:border-[#0077c0]"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Shifts table */}
      {(!compact || shifts.length > 0) && (
        <div
          role="region"
          aria-label="Doctor shifts"
          className="overflow-x-auto rounded-[18px] border border-field-border"
        >
          <div
            className={`grid min-w-[560px] ${tableGrid} border-b border-field-border/50 ${compact ? "bg-white" : "bg-[#f8fafc]"}`}
          >
            {["Frequency", "Day/Date", "Shift Timing", "Action"].map((h) => (
              <span
                key={h}
                className={`text-left font-inter font-semibold uppercase leading-[18px] tracking-[0.6px] ${compact ? "px-5 py-2.5 text-[10px] text-[#1e1e24] last:text-right" : "px-6 py-[18px] text-[13px] text-[#727783]"}`}
              >
                {h}
              </span>
            ))}
          </div>
          {shifts.length === 0 ? (
            <p
              className={
                compact
                  ? "h-14"
                  : "px-[24px] py-8 font-inter text-[15px] text-[#94a3b8]"
              }
            >
              <span className={compact ? "sr-only" : undefined}>
                No shifts added yet. Pick dates, a recurrence and a time range
                above.
              </span>
            </p>
          ) : (
            // The popup shows two 56px rows; additional shifts scroll below the header.
            <div
              className={
                compact
                  ? "max-h-28 min-w-[560px] overflow-y-auto overscroll-contain"
                  : "max-h-[346px] overflow-y-auto"
              }
              tabIndex={shiftGroups.length > (compact ? 2 : 5) ? 0 : undefined}
              role="region"
              aria-label="Added shifts"
            >
              {shiftGroups.map((s) => (
                <div
                  key={s.id}
                  className={`grid ${tableGrid} items-center border-b border-field-border/50 last:border-b-0 ${compact ? "min-h-14 [&>span]:px-5 [&>span]:py-3 [&>span]:text-[13px]" : ""}`}
                >
                  <span className="px-[24px] py-[18px] font-inter text-[15px] text-[#1e1e24]">
                    {s.frequency}
                  </span>
                  <span className="px-[24px] py-[18px] font-inter text-[15px] text-[#1e1e24]">
                    {s.dayDateLabel}
                  </span>
                  <span className="px-[24px] py-[18px] font-inter text-[15px] text-[#1e1e24]">
                    {s.timing}
                  </span>
                  <div
                    className={`flex items-center ${compact ? "gap-1 px-3" : "gap-2 px-6 py-[18px]"}`}
                  >
                    <button
                      type="button"
                      aria-label={`Edit shift on ${s.dayDateLabel}`}
                      onClick={() => editShift(s)}
                      className="group relative flex size-[32px] items-center justify-center"
                    >
                      <Image
                        src="/dashboard/edit_square.svg"
                        alt=""
                        width={22}
                        height={22}
                        className="size-[22px]"
                      />
                      <Tip label="Edit" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove shift on ${s.dayDateLabel}`}
                      onClick={() =>
                        compact
                          ? removeShift(s)
                          : setPendingDelete(s)
                      }
                      className="group relative flex size-[32px] items-center justify-center"
                    >
                      <Image
                        src="/dashboard/delete.svg"
                        alt=""
                        width={22}
                        height={22}
                        className="size-[22px]"
                      />
                      <Tip label="Delete" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {pendingDelete && (
        <DeleteShiftDialog
          shift={pendingDelete}
          onClose={() => setPendingDelete(null)}
          onConfirm={() => {
            removeShift(pendingDelete);
            setPendingDelete(null);
          }}
        />
      )}
    </fieldset>
  );
}

/* ---------------------------------------------------------------- dialogs */

/**
 * Delete Shift confirm dialog — mirrors the app's other delete prompts
 * (e.g. DeleteDoctorDialog). Shifts live in local state, so it just confirms
 * before removing the row; no API call.
 */
function DeleteShiftDialog({
  shift,
  onClose,
  onConfirm,
}: {
  shift: ShiftGroup;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-shift-title"
        className="my-auto flex w-full max-w-[460px] flex-col gap-[20px] rounded-[20px] bg-white p-[28px] shadow-[0_10px_40px_rgba(0,0,0,0.15)]"
      >
        <div className="flex items-center gap-[10px]">
          <TrashIcon className="size-6 text-[#ba1a1a]" />
          <h2
            id="delete-shift-title"
            className="font-manrope text-[22px] font-bold tracking-[-0.4px] text-[#1e1e24]"
          >
            Delete Shift?
          </h2>
        </div>
        <p className="font-inter text-[15px] leading-[23px] text-[#1e1e24]">
          Are you sure you want to delete the{" "}
          <span className="font-semibold text-[#0077c0]">
            {shift.frequency}
          </span>{" "}
          shift on{" "}
          <span className="font-semibold text-[#0077c0]">{shift.dayDateLabel}</span> (
          {shift.timing})? This action cannot be undone.
        </p>

        <div className="flex items-center justify-end gap-[16px]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border-[1.2px] border-[#c2c6d4] px-[24px] py-[11px] font-inter text-[13px] font-semibold uppercase tracking-[0.6px] text-[#1e1e24] transition-colors hover:border-[#0077c0]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full bg-[#ba1a1a] px-[24px] py-[11px] font-inter text-[13px] font-semibold uppercase tracking-[0.6px] text-white transition-opacity hover:opacity-90"
          >
            Delete Shift
          </button>
        </div>
      </div>
    </div>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
    </svg>
  );
}

export function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[10px]">
      <span className="font-inter text-[11px] font-normal uppercase tracking-[0.5px] text-[#1e1e24]">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </div>
  );
}

function MonthCalendar({
  view,
  onView,
  selected,
  recurrence,
  shifts,
  onToggle,
  compact = false,
}: {
  view: Date;
  onView: (d: Date) => void;
  selected: Set<string>;
  recurrence: string;
  shifts: Shift[];
  onToggle: (key: string) => void;
  compact?: boolean;
}) {
  const year = view.getFullYear();
  const month = view.getMonth();

  // Dates implied by the chosen recurrence — rendered filled alongside the
  // explicit picks so the user can preview the pattern before adding shifts.
  const derived = useMemo(
    () => recurringKeysForMonth(selected, recurrence, year, month),
    [selected, recurrence, year, month],
  );

  // Dates already added to the shifts table, so committed shifts stay visible
  // on the calendar (green) after the working selection is cleared.
  const committed = useMemo(
    () => shiftKeysForMonth(shifts, year, month),
    [shifts, year, month],
  );

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const startPad = first.getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: Array<{ day: number; key: string; outside: boolean } | null> =
      [];
    // Leading cells show the tail of the previous month — faded, but still
    // selectable — so a day landing in this month's first week is reachable here.
    const prevDays = new Date(year, month, 0).getDate();
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    for (let i = 0; i < startPad; i++) {
      const d = prevDays - startPad + 1 + i;
      out.push({
        day: d,
        key: `${prevYear}-${p2(prevMonth + 1)}-${p2(d)}`,
        outside: true,
      });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      out.push({
        day: d,
        key: `${year}-${p2(month + 1)}-${p2(d)}`,
        outside: false,
      });
    }
    // Trailing cells show the head of the next month — faded, but still
    // selectable — so a day landing in this month's last week is reachable here.
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    let nextDay = 1;
    while (out.length % 7 !== 0) {
      out.push({
        day: nextDay,
        key: `${nextYear}-${p2(nextMonth + 1)}-${p2(nextDay)}`,
        outside: true,
      });
      nextDay++;
    }
    return out;
  }, [year, month]);

  const todayKey = `${new Date().getFullYear()}-${p2(new Date().getMonth() + 1)}-${p2(new Date().getDate())}`;

  // Year picker: present year and up (keep the viewed year if navigated earlier).
  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = Math.min(thisYear, year); y <= thisYear + YEAR_RANGE; y++)
    years.push(y);

  return (
    <div
      className={
        compact
          ? "rounded-[18px] border border-field-border p-[18px]"
          : "rounded-[20px] border border-[#c2c6d4] p-[20px]"
      }
    >
      <div className="mb-[16px] flex items-center justify-between">
        <div className="flex items-center gap-[6px]">
          <CalendarSelect
            ariaLabel="Month"
            value={month}
            options={MONTHS.map((m, i) => ({ label: m, value: i }))}
            onChange={(m) => onView(new Date(year, m, 1))}
            compact={compact}
          />
          <CalendarSelect
            ariaLabel="Year"
            value={year}
            options={years.map((y) => ({ label: String(y), value: y }))}
            onChange={(y) => onView(new Date(y, month, 1))}
            compact={compact}
          />
        </div>
        <div className="flex items-center gap-[8px]">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => onView(new Date(year, month - 1, 1))}
            className="flex size-[32px] items-center justify-center rounded-[8px] hover:bg-[#f1f5f9]"
          >
            <Image
              src="/dashboard/chevron_dark.svg"
              alt=""
              width={18}
              height={18}
              className="size-[18px]"
            />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => onView(new Date(year, month + 1, 1))}
            className="flex size-[32px] items-center justify-center rounded-[8px] hover:bg-[#f1f5f9]"
          >
            <Image
              src="/dashboard/chevron_dark.svg"
              alt=""
              width={18}
              height={18}
              className="size-[18px] rotate-180"
            />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-[6px]">
        {WEEKDAY_INITIALS.map((w, i) => (
          <span
            key={i}
            className={`py-[6px] text-center font-inter font-medium text-[#94a3b8] ${compact ? "text-[9px]" : "text-[13px]"}`}
          >
            {w}
          </span>
        ))}
        {cells.map((c, i) =>
          c === null ? (
            <span key={`e${i}`} />
          ) : (
            <button
              key={c.key}
              type="button"
              onClick={() => onToggle(c.key)}
              aria-pressed={selected.has(c.key) || derived.has(c.key)}
              aria-label={`${MONTHS[Number(c.key.slice(5, 7)) - 1]} ${c.day}, ${c.key.slice(0, 4)}`}
              className={`mx-auto flex ${compact ? "size-7 text-[12px]" : "size-[36px] text-[14px]"} items-center justify-center rounded-full font-inter transition-colors ${c.outside ? "opacity-40 " : ""}${
                selected.has(c.key) || derived.has(c.key)
                  ? `bg-[#0077c0] font-semibold text-white${
                      c.key === todayKey ? " ring-2 ring-inset ring-white" : ""
                    }`
                  : committed.has(c.key)
                    ? `bg-[#16a34a] font-semibold text-white${
                        c.key === todayKey
                          ? " ring-2 ring-inset ring-white"
                          : ""
                      }`
                    : c.key === todayKey
                      ? "border border-[#0077c0] font-semibold text-[#0077c0]"
                      : "text-[#1e1e24] hover:bg-[#f1f5f9]"
              }`}
            >
              {c.day}
            </button>
          ),
        )}
      </div>

      {/* Legend — distinguishes the working selection from committed shifts. */}
      <div className="mt-[16px] flex items-center gap-[18px]">
        <span className="flex items-center gap-[7px]">
          <span className="size-[12px] rounded-full bg-[#0077c0]" />
          <span className="font-inter text-[12px] text-[#727783]">
            Selected
          </span>
        </span>
        <span className="flex items-center gap-[7px]">
          <span className="size-[12px] rounded-full bg-[#16a34a]" />
          <span className="font-inter text-[12px] text-[#727783]">
            Added shift
          </span>
        </span>
      </div>
    </div>
  );
}

/**
 * Compact month/year picker for the shift calendar header. Keeps the app's
 * dropdown design — a white rounded panel of light rows with a radio marker on
 * the selected option (same as the Shift Recurrence / Specialization selects).
 */
function CalendarSelect<T extends number>({
  ariaLabel,
  value,
  options,
  onChange,
  compact = false,
}: {
  ariaLabel: string;
  value: T;
  options: { label: string; value: T }[];
  onChange: (v: T) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useExclusiveDropdown();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [setOpen]);

  const current = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-[6px] rounded-[8px] px-[8px] py-[4px] transition-colors hover:bg-[#f1f5f9]"
      >
        <span
          className={`font-manrope font-semibold text-[#1e1e24] ${compact ? "text-[14px]" : "text-[18px]"}`}
        >
          {current?.label ?? value}
        </span>
        {!compact && (
          <Image
            src="/dashboard/chevron_dark.svg"
            alt=""
            width={16}
            height={16}
            className={`size-4 transition-transform ${open ? "rotate-90" : "-rotate-90"}`}
          />
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 flex max-h-[240px] w-[150px] flex-col gap-[5px] overflow-y-auto rounded-[15px] border border-[#c2c6d4] bg-white p-[12px] drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-[8px] bg-[#f1f5f9] px-[14px] py-[8px] transition-colors hover:bg-[#e9eef4]"
            >
              <span className="font-inter text-[14px] text-[#1e1e24]">
                {opt.label}
              </span>
              <span className="flex size-3 items-center justify-center rounded-full border border-[#1e1e24]">
                {opt.value === value && (
                  <span className="size-1.5 rounded-full bg-[#1e1e24]" />
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- inputs */

function TimeField({
  label,
  value,
  onChange,
  compact = false,
}: {
  label: string;
  value: TimeParts;
  onChange: (v: TimeParts) => void;
  compact?: boolean;
}) {
  const box = `${compact ? "w-10 rounded-[4px] py-[7px] text-[12px]" : "w-[46px] rounded-[8px] py-[8px] text-[15px]"} border border-field-border text-center font-inter text-[#1e1e24] outline-none placeholder:text-field-border focus:border-brand`;
  return (
    <div className="flex flex-col gap-[6px]">
      <span className="font-inter text-[11px] uppercase tracking-[0.5px] text-[#94a3b8]">
        {label}
      </span>
      <div className="flex items-center gap-[6px]">
        <input
          aria-label={`${label} hour`}
          value={value.hh}
          onChange={(e) =>
            onChange({
              ...value,
              hh: e.target.value.replace(/\D/g, "").slice(0, 2),
            })
          }
          placeholder="HH"
          inputMode="numeric"
          className={box}
        />
        <span className="font-inter text-[15px] text-[#1e1e24]">:</span>
        <input
          aria-label={`${label} minute`}
          value={value.mm}
          onChange={(e) =>
            onChange({
              ...value,
              mm: e.target.value.replace(/\D/g, "").slice(0, 2),
            })
          }
          placeholder="MM"
          inputMode="numeric"
          className={box}
        />
        <button
          type="button"
          aria-label={`${label} meridiem, currently ${value.period} — click to toggle`}
          onClick={() =>
            onChange({ ...value, period: value.period === "AM" ? "PM" : "AM" })
          }
          className={`border border-field-border bg-field-border font-inter font-medium text-[#1e1e24] ${compact ? "rounded-[4px] px-[10px] py-[7px] text-[12px]" : "rounded-[8px] px-3 py-2 text-[13px]"}`}
        >
          {value.period}
        </button>
      </div>
    </div>
  );
}

/** Underline select (Shift Recurrence). */
export function Dropdown({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useExclusiveDropdown();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [setOpen]);

  // A disabled select can't be open — collapse it if it becomes gated.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled, setOpen]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="flex w-full items-center justify-between border-b border-[#c2c6d4] pb-2 pt-1 text-left focus:border-[#0077c0] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="font-inter text-[15px] text-[#1e1e24]">
          {value || placeholder}
        </span>
        {disabled ? (
          <NoEditIcon className="size-5 text-[#94a3b8]" />
        ) : (
          <Image
            src="/dashboard/chevron_dark.svg"
            alt=""
            width={20}
            height={20}
            className={`size-5 transition-transform ${open ? "rotate-90" : "-rotate-90"}`}
          />
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 flex w-full flex-col gap-[5px] rounded-[15px] border border-[#c2c6d4] bg-white p-[17px] drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-[8px] bg-[#f1f5f9] px-[16px] py-[10px] transition-colors hover:bg-[#e9eef4]"
            >
              <span className="font-inter text-[14px] text-[#1e1e24]">
                {opt}
              </span>
              <span className="flex size-3 items-center justify-center rounded-full border border-[#1e1e24]">
                {value === opt && (
                  <span className="size-1.5 rounded-full bg-[#1e1e24]" />
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NoEditIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M6 6l12 12" strokeLinecap="round" />
    </svg>
  );
}
