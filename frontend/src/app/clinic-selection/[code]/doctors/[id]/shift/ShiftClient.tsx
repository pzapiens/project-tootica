"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { apiFetch, ApiError, type DoctorSummary } from "@/lib/api";
import { phoneDigits, phoneWithCc } from "@/lib/validation";
import { useExclusiveDropdown } from "@/lib/useExclusiveDropdown";
import { loadShifts, saveShifts } from "@/lib/shifts";

import { SPECIALIZATIONS } from "../../constants";

/**
 * Edit Doctor Shift (Figma "Doctors2 - Edit"): the per-doctor shift editor
 * reached from the Doctors table's edit action, for BOTH doctor kinds.
 *
 * The detail fields (name / consultation type / phone / email) are FROZEN for
 * employed doctors (role DOCTOR — their identity is managed via the account
 * flow) and EDITABLE + saveable for guest doctors (created here). Below the
 * details is an "Add Shifts" builder — pick one or more calendar dates, a
 * recurrence and a time range, then add them to the shifts table.
 *
 * Shifts are held in local state only (frontend-first): the doctor-shifts
 * backend endpoints aren't built yet, so nothing is persisted across reloads.
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];
const RECURRENCES = ["Day", "Weekly", "Biweekly", "Monthly", "Yearly", "Every day"];
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
  if (selected.size === 0 || recurrence === "" || recurrence === "Day") return out;

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
          return cur.getMonth() === pick.getMonth() && cur.getDate() === pick.getDate();
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
function shiftKeysForMonth(shifts: Shift[], year: number, month: number): Set<string> {
  const out = new Set<string>();
  for (const s of shifts) {
    const [d, m, y] = s.date.split("/");
    const key = `${y}-${m}-${d}`;
    if (Number(y) === year && Number(m) - 1 === month) out.add(key);
    recurringKeysForMonth(new Set([key]), s.frequency, year, month).forEach((k) => out.add(k));
  }
  return out;
}

interface Shift {
  id: string;
  /** Dates added together in one "Add Shift" share a groupId → one table row. */
  groupId?: string;
  frequency: string;
  /** dd/mm/yyyy */
  date: string;
  /** "09:00 AM - 06:00 PM" */
  timing: string;
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

/** "09:00 AM" → TimeParts (or null), for loading a shift back into the form. */
function parseTimeToParts(s: string): TimeParts | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  return { hh: m[1], mm: m[2], period: m[3].toUpperCase() as "AM" | "PM" };
}

export default function ShiftClient() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const doctorId = params.id;

  const [doctor, setDoctor] = useState<DoctorSummary | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [spec, setSpec] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [detailsSaved, setDetailsSaved] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch<DoctorSummary[]>("/doctors")
      .then((list) => {
        if (!active) return;
        const found = list.find((d) => d.id === doctorId) ?? null;
        setDoctor(found);
        if (found) {
          setName(found.name ? `Dr. ${found.name}` : "");
          setEmail(found.email ?? "");
          setPhone(phoneDigits(found.phone ?? ""));
          setSpec(found.specialization ?? "");
        }
      })
      .catch(() => {
        if (active) setDoctor(null);
      });
    return () => {
      active = false;
    };
  }, [doctorId]);

  // Calendar view + multi-selected dates (yyyy-mm-dd keys).
  const [view, setView] = useState(() => new Date());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [recurrence, setRecurrence] = useState("");
  const [from, setFrom] = useState<TimeParts>(emptyTime);
  const [to, setTo] = useState<TimeParts>(emptyTime);

  const [shifts, setShifts] = useState<Shift[]>([]);
  // The shift row awaiting delete confirmation (null = no dialog open).
  const [pendingDelete, setPendingDelete] = useState<Shift | null>(null);
  // The shift row being edited — its values are loaded into the Add Shifts
  // builder and "Add Shift" becomes "Update Shift" (null = adding a new shift).
  const [editingId, setEditingId] = useState<string | null>(null);
  // Monotonic counter for group ids (avoids impure Date.now() in render).
  const shiftSeq = useRef(0);
  // Shifts are persisted per doctor in localStorage (frontend-first), so they
  // survive leaving and re-opening the editor. Load after mount to avoid a
  // hydration mismatch, and gate saving until that load has happened so the
  // initial empty state never overwrites what's stored.
  const [shiftsLoaded, setShiftsLoaded] = useState(false);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setShifts(loadShifts(doctorId));
    setShiftsLoaded(true);
  }, [doctorId]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (shiftsLoaded) saveShifts(doctorId, shifts);
  }, [shiftsLoaded, doctorId, shifts]);

  // Only guest doctors can have their details edited here; employed doctors
  // (role DOCTOR) are frozen — their identity is managed via the account flow.
  const isGuest = doctor?.role === "GUEST_DOCTOR";

  async function saveDetails() {
    if (!isGuest || savingDetails) return;
    setSavingDetails(true);
    setDetailsError("");
    try {
      await apiFetch(`/doctors/${doctorId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone ? phoneWithCc(phone) : undefined,
          specialization: spec || undefined,
        }),
      });
      setDoctor((d) =>
        d ? { ...d, name: name.trim().replace(/^dr\.?\s+/i, ""), email, specialization: spec } : d,
      );
      setDetailsSaved(true);
      setTimeout(() => setDetailsSaved(false), 1600);
    } catch (err) {
      setDetailsError(
        err instanceof ApiError ? err.message : "Couldn't save the details. Please try again.",
      );
    } finally {
      setSavingDetails(false);
    }
  }

  // Selecting a calendar date auto-picks "Day" recurrence when the user hasn't
  // chosen one yet, so a single-date shift is ready to add without a manual step.
  // Removing dates never changes recurrence, and an existing choice is kept.
  function toggleDate(key: string) {
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
    selected.size > 0 && recurrence !== "" && timeValid(from) && timeValid(to);

  function addShift() {
    if (!canAdd) return;
    const timing = `${fmtTime(from)} - ${fmtTime(to)}`;
    // All dates picked in this one add share a groupId → a single table row.
    const groupId = `grp-${shiftSeq.current++}`;
    const rows: Shift[] = [...selected]
      .sort()
      .map((key, i) => {
        const [y, m, d] = key.split("-");
        return {
          id: `${key}-${groupId}-${i}`,
          groupId,
          frequency: recurrence,
          date: `${d}/${m}/${y}`,
          timing,
        };
      });
    // Editing replaces the original row with the re-picked shift(s); adding just
    // appends. Either way the working selection and edit state reset afterwards.
    setShifts((prev) => {
      const base = editingId ? prev.filter((x) => x.id !== editingId) : prev;
      return [...base, ...rows];
    });
    setSelected(new Set());
    setEditingId(null);
  }

  /** Load a shift row back into the Add Shifts builder to edit it. */
  function editShift(s: Shift) {
    const [d, m, y] = s.date.split("/");
    setView(new Date(Number(y), Number(m) - 1, 1));
    setSelected(new Set([`${y}-${m}-${d}`]));
    setRecurrence(s.frequency);
    const [a, b] = s.timing.split(" - ");
    const fa = a ? parseTimeToParts(a) : null;
    const fb = b ? parseTimeToParts(b) : null;
    if (fa) setFrom(fa);
    if (fb) setTo(fb);
    setEditingId(s.id);
  }

  /** Abandon an in-progress edit, restoring the builder to a fresh state. */
  function cancelEdit() {
    setEditingId(null);
    setSelected(new Set());
    setRecurrence("");
    setFrom(emptyTime());
    setTo(emptyTime());
  }

  // The table lists shifts in date order (then by start time), regardless of the
  // order they were added or edited. Stored order itself is left untouched.
  const sortedShifts = useMemo(() => {
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
    return [...shifts].sort(
      (a, b) => dateKey(a.date) - dateKey(b.date) || startKey(a.timing) - startKey(b.timing),
    );
  }, [shifts]);

  return (
    <div className="flex flex-col gap-[32px] pb-[24px]">
      {/* Header */}
      <div className="flex items-center gap-[16px]">
        <button
          type="button"
          aria-label="Back to doctors"
          onClick={() => router.back()}
          className="flex size-[40px] items-center justify-center"
        >
          <Image src="/dashboard/chevron_dark.svg" alt="" width={28} height={28} className="size-7" />
        </button>
        <h1 className="font-manrope text-[35px] font-bold leading-[44px] tracking-[-0.7px] text-[#1e1e24]">
          Edit Doctor Shift
        </h1>
      </div>

      {/* Doctor details — frozen for employed doctors, editable for guests. */}
      <div className="grid grid-cols-2 gap-x-[64px] gap-y-[28px]">
        <TextField label="Doctor Name" value={name} onChange={setName} disabled={!isGuest} required />
        {isGuest ? (
          <Field label="Consultation Type" required>
            <Dropdown
              value={spec}
              onChange={setSpec}
              options={SPECIALIZATIONS as readonly string[]}
              placeholder="Select"
            />
          </Field>
        ) : (
          <LockedField label="Consultation Type" value={doctor?.specialization ?? "—"} />
        )}
        <PhoneField value={phone} onChange={setPhone} disabled={!isGuest} />
        <TextField label="Email" value={email} onChange={setEmail} disabled={!isGuest} />
      </div>

      {isGuest && (
        <div className="flex items-center gap-[16px]">
          <button
            type="button"
            onClick={saveDetails}
            disabled={savingDetails || name.trim() === ""}
            className="rounded-full bg-[#0077c0] px-[24px] py-[11px] font-inter text-[13px] font-semibold uppercase tracking-[0.6px] text-white transition-colors hover:bg-[#0069a8] disabled:opacity-50"
          >
            {savingDetails ? "Saving…" : "Update Details"}
          </button>
          {detailsSaved && (
            <span className="font-inter text-[13px] font-medium text-[#16a34a]">Saved</span>
          )}
          {detailsError && (
            <span role="alert" className="font-inter text-[13px] text-[#ba1a1a]">
              {detailsError}
            </span>
          )}
        </div>
      )}

      {/* Add Shifts */}
      <div className="flex flex-col gap-[24px] rounded-[28px] border-[1.2px] border-[#c2c6d4] p-[28px]">
        <div className="flex items-center gap-[10px]">
          <Image src="/dashboard/calendar_today.svg" alt="" width={24} height={24} className="size-6" />
          <h2 className="font-manrope text-[22px] font-bold tracking-[-0.4px] text-[#1e1e24]">
            Add Shifts
          </h2>
        </div>

        <div className="grid grid-cols-[minmax(0,460px)_1fr] gap-[40px]">
          {/* Calendar */}
          <MonthCalendar
            view={view}
            onView={setView}
            selected={selected}
            recurrence={recurrence}
            shifts={shifts}
            onToggle={toggleDate}
          />

          {/* Recurrence + time range */}
          <div className="flex flex-col gap-[28px]">
            <Field label="Shift Recurrence" required>
              <Dropdown
                value={recurrence}
                onChange={setRecurrence}
                options={RECURRENCES}
                placeholder="Select"
                disabled={selected.size === 0}
              />
            </Field>

            <div className="flex flex-col gap-[12px]">
              <span className="font-inter text-[11px] font-normal uppercase tracking-[0.5px] text-[#1e1e24]">
                Time Range <span className="text-red-500">*</span>
              </span>
              <div className="flex flex-wrap items-end gap-[24px]">
                <TimeField label="From" value={from} onChange={setFrom} />
                <TimeField label="To" value={to} onChange={setTo} />
              </div>
            </div>

            <div className="flex items-center gap-[16px]">
              <button
                type="button"
                onClick={addShift}
                disabled={!canAdd}
                className={`h-[54px] flex-1 rounded-[12px] font-inter text-[16px] font-semibold text-white transition-colors ${
                  canAdd ? "bg-[#0077c0] hover:bg-[#0069a8]" : "cursor-not-allowed bg-[#7fb9dd]"
                }`}
              >
                {editingId ? "Update Shift" : "Add Shift"}
              </button>
              {editingId && (
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
      <div className="overflow-hidden rounded-[16px] border-[1.2px] border-[#c2c6d4]">
        <div className="grid grid-cols-[1fr_1fr_1.4fr_120px] border-b-[1.2px] border-[rgba(194,198,212,0.5)] bg-[#f8fafc]">
          {["Frequency", "Day/Date", "Shift Timing", "Action"].map((h) => (
            <span
              key={h}
              className="px-[24px] py-[18px] text-left font-inter text-[13px] font-semibold uppercase leading-[18px] tracking-[0.6px] text-[#727783]"
            >
              {h}
            </span>
          ))}
        </div>
        {shifts.length === 0 ? (
          <p className="px-[24px] py-8 font-inter text-[15px] text-[#94a3b8]">
            No shifts added yet. Pick dates, a recurrence and a time range above.
          </p>
        ) : (
          sortedShifts.map((s) => (
            <div
              key={s.id}
              className="grid grid-cols-[1fr_1fr_1.4fr_120px] items-center border-b-[1.2px] border-[rgba(194,198,212,0.5)] last:border-b-0"
            >
              <span className="px-[24px] py-[18px] font-inter text-[15px] text-[#1e1e24]">{s.frequency}</span>
              <span className="px-[24px] py-[18px] font-inter text-[15px] text-[#1e1e24]">{s.date}</span>
              <span className="px-[24px] py-[18px] font-inter text-[15px] text-[#1e1e24]">{s.timing}</span>
              <div className="flex items-center gap-[8px] px-[24px] py-[18px]">
                <button
                  type="button"
                  aria-label={`Edit shift on ${s.date}`}
                  onClick={() => editShift(s)}
                  className="flex size-[32px] items-center justify-center"
                >
                  <Image src="/dashboard/edit_square.svg" alt="" width={22} height={22} className="size-[22px]" />
                </button>
                <button
                  type="button"
                  aria-label={`Remove shift on ${s.date}`}
                  onClick={() => setPendingDelete(s)}
                  className="flex size-[32px] items-center justify-center"
                >
                  <Image src="/dashboard/delete.svg" alt="" width={22} height={22} className="size-[22px]" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {pendingDelete && (
        <DeleteShiftDialog
          shift={pendingDelete}
          onClose={() => setPendingDelete(null)}
          onConfirm={() => {
            setShifts((prev) => prev.filter((x) => x.id !== pendingDelete.id));
            setPendingDelete(null);
          }}
        />
      )}
    </div>
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
  shift: Shift;
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
          <h2 id="delete-shift-title" className="font-manrope text-[22px] font-bold tracking-[-0.4px] text-[#1e1e24]">
            Delete Shift?
          </h2>
        </div>
        <p className="font-inter text-[15px] leading-[23px] text-[#1e1e24]">
          Are you sure you want to delete the{" "}
          <span className="font-semibold text-[#0077c0]">{shift.frequency}</span> shift on{" "}
          <span className="font-semibold text-[#0077c0]">{shift.date}</span> ({shift.timing})?
          This action cannot be undone.
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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
    </svg>
  );
}

/* ------------------------------------------------------------------ fields */

function Field({
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

function TextField({
  label,
  value,
  onChange,
  disabled = false,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <Field label={label} required={required}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`w-full border-b border-[#c2c6d4] bg-transparent pb-2 pt-1 font-inter text-[15px] outline-none focus:border-[#0077c0] ${
          disabled ? "cursor-not-allowed text-[#1e1e24]/50" : "text-[#1e1e24]"
        }`}
      />
    </Field>
  );
}

function PhoneField({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field label="Phone" required>
      <div className="flex items-center gap-2 border-b border-[#c2c6d4] pb-2 pt-1 focus-within:border-[#0077c0]">
        <span className={`shrink-0 font-inter text-[15px] ${disabled ? "text-[#1e1e24]/50" : "text-[#1e1e24]"}`}>
          +91
        </span>
        <input
          value={value}
          onChange={(e) => onChange(phoneDigits(e.target.value))}
          inputMode="numeric"
          disabled={disabled}
          className={`min-w-0 flex-1 bg-transparent font-inter text-[15px] outline-none ${
            disabled ? "cursor-not-allowed text-[#1e1e24]/50" : "text-[#1e1e24]"
          }`}
        />
      </div>
    </Field>
  );
}

/** A locked/read-only field (shows a no-edit glyph) for employed doctors. */
function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <Field label={label}>
      <div className="flex items-center justify-between border-b border-[#c2c6d4] pb-2 pt-1">
        <span className="font-inter text-[15px] text-[#1e1e24]/50">{value}</span>
        <NoEditIcon className="size-5 text-[#94a3b8]" />
      </div>
    </Field>
  );
}

/* --------------------------------------------------------------- calendar */

function MonthCalendar({
  view,
  onView,
  selected,
  recurrence,
  shifts,
  onToggle,
}: {
  view: Date;
  onView: (d: Date) => void;
  selected: Set<string>;
  recurrence: string;
  shifts: Shift[];
  onToggle: (key: string) => void;
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
    const out: Array<{ day: number; key: string; outside: boolean } | null> = [];
    // Leading cells show the tail of the previous month — faded, but still
    // selectable — so a day landing in this month's first week is reachable here.
    const prevDays = new Date(year, month, 0).getDate();
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    for (let i = 0; i < startPad; i++) {
      const d = prevDays - startPad + 1 + i;
      out.push({ day: d, key: `${prevYear}-${p2(prevMonth + 1)}-${p2(d)}`, outside: true });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      out.push({ day: d, key: `${year}-${p2(month + 1)}-${p2(d)}`, outside: false });
    }
    // Trailing cells show the head of the next month — faded, but still
    // selectable — so a day landing in this month's last week is reachable here.
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    let nextDay = 1;
    while (out.length % 7 !== 0) {
      out.push({ day: nextDay, key: `${nextYear}-${p2(nextMonth + 1)}-${p2(nextDay)}`, outside: true });
      nextDay++;
    }
    return out;
  }, [year, month]);

  const todayKey = `${new Date().getFullYear()}-${p2(new Date().getMonth() + 1)}-${p2(new Date().getDate())}`;

  // Year picker: present year and up (keep the viewed year if navigated earlier).
  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = Math.min(thisYear, year); y <= thisYear + YEAR_RANGE; y++) years.push(y);

  return (
    <div className="rounded-[20px] border border-[#c2c6d4] p-[20px]">
      <div className="mb-[16px] flex items-center justify-between">
        <div className="flex items-center gap-[6px]">
          <CalendarSelect
            ariaLabel="Month"
            value={month}
            options={MONTHS.map((m, i) => ({ label: m, value: i }))}
            onChange={(m) => onView(new Date(year, m, 1))}
          />
          <CalendarSelect
            ariaLabel="Year"
            value={year}
            options={years.map((y) => ({ label: String(y), value: y }))}
            onChange={(y) => onView(new Date(y, month, 1))}
          />
        </div>
        <div className="flex items-center gap-[8px]">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => onView(new Date(year, month - 1, 1))}
            className="flex size-[32px] items-center justify-center rounded-[8px] hover:bg-[#f1f5f9]"
          >
            <Image src="/dashboard/chevron_dark.svg" alt="" width={18} height={18} className="size-[18px]" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => onView(new Date(year, month + 1, 1))}
            className="flex size-[32px] items-center justify-center rounded-[8px] hover:bg-[#f1f5f9]"
          >
            <Image src="/dashboard/chevron_dark.svg" alt="" width={18} height={18} className="size-[18px] rotate-180" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-[6px]">
        {WEEKDAY_INITIALS.map((w, i) => (
          <span key={i} className="py-[6px] text-center font-inter text-[13px] font-medium text-[#94a3b8]">
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
              aria-pressed={selected.has(c.key)}
              className={`mx-auto flex size-[36px] items-center justify-center rounded-full font-inter text-[14px] transition-colors ${c.outside ? "opacity-40 " : ""}${
                selected.has(c.key) || derived.has(c.key)
                  ? `bg-[#0077c0] font-semibold text-white${
                      c.key === todayKey ? " ring-2 ring-inset ring-white" : ""
                    }`
                  : committed.has(c.key)
                    ? `bg-[#16a34a] font-semibold text-white${
                        c.key === todayKey ? " ring-2 ring-inset ring-white" : ""
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
          <span className="font-inter text-[12px] text-[#727783]">Selected</span>
        </span>
        <span className="flex items-center gap-[7px]">
          <span className="size-[12px] rounded-full bg-[#16a34a]" />
          <span className="font-inter text-[12px] text-[#727783]">Added shift</span>
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
}: {
  ariaLabel: string;
  value: T;
  options: { label: string; value: T }[];
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useExclusiveDropdown();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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
        <span className="font-manrope text-[18px] font-semibold text-[#1e1e24]">
          {current?.label ?? value}
        </span>
        <Image
          src="/dashboard/chevron_dark.svg"
          alt=""
          width={16}
          height={16}
          className={`size-4 transition-transform ${open ? "rotate-90" : "-rotate-90"}`}
        />
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
              <span className="font-inter text-[14px] text-[#1e1e24]">{opt.label}</span>
              <span className="flex size-3 items-center justify-center rounded-full border border-[#1e1e24]">
                {opt.value === value && <span className="size-1.5 rounded-full bg-[#1e1e24]" />}
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
}: {
  label: string;
  value: TimeParts;
  onChange: (v: TimeParts) => void;
}) {
  const box =
    "w-[46px] rounded-[8px] border border-[#c2c6d4] py-[8px] text-center font-inter text-[15px] text-[#1e1e24] outline-none focus:border-[#0077c0]";
  return (
    <div className="flex flex-col gap-[6px]">
      <span className="font-inter text-[11px] uppercase tracking-[0.5px] text-[#94a3b8]">{label}</span>
      <div className="flex items-center gap-[6px]">
        <input
          aria-label={`${label} hour`}
          value={value.hh}
          onChange={(e) => onChange({ ...value, hh: e.target.value.replace(/\D/g, "").slice(0, 2) })}
          placeholder="HH"
          inputMode="numeric"
          className={box}
        />
        <span className="font-inter text-[15px] text-[#1e1e24]">:</span>
        <input
          aria-label={`${label} minute`}
          value={value.mm}
          onChange={(e) => onChange({ ...value, mm: e.target.value.replace(/\D/g, "").slice(0, 2) })}
          placeholder="MM"
          inputMode="numeric"
          className={box}
        />
        <button
          type="button"
          aria-label={`${label} meridiem, currently ${value.period} — click to toggle`}
          onClick={() => onChange({ ...value, period: value.period === "AM" ? "PM" : "AM" })}
          className="rounded-[8px] border border-[#c2c6d4] bg-[#c2c6d4] px-[12px] py-[8px] font-inter text-[13px] font-semibold text-[#1e1e24] transition-colors"
        >
          {value.period}
        </button>
      </div>
    </div>
  );
}

/** Underline select (Shift Recurrence). */
function Dropdown({
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
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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
        className="flex w-full items-center justify-between border-b border-[#c2c6d4] pb-2 pt-1 text-left focus:border-[#0077c0] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={`font-inter text-[15px] ${value ? "text-[#1e1e24]" : "text-[#1e1e24]/70"}`}>
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
              <span className="font-inter text-[14px] text-[#1e1e24]">{opt}</span>
              <span className="flex size-3 items-center justify-center rounded-full border border-[#1e1e24]">
                {value === opt && <span className="size-1.5 rounded-full bg-[#1e1e24]" />}
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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M6 6l12 12" strokeLinecap="round" />
    </svg>
  );
}
