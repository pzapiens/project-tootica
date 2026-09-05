"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { apiFetch, type AvailabilityResponse } from "@/lib/api";
import { useExclusiveDropdown } from "@/lib/useExclusiveDropdown";
import {
  shiftWindowsForDate,
  loadBlocks,
  saveBlocks,
  dmy,
  type BlockedSlot,
} from "@/lib/shifts";

import { parseDmy } from "./DateInput";

/**
 * Doctor Availability modal (Figma "Doctor Availability" 501:51877). Opened from
 * the Select-by-Doctor flow and the Doctors table. It shows the doctor's day as
 * a timeline over the clinic's business hours:
 *   - Not Available (dark) base — no marked shift covers the time
 *   - Available (green) — the doctor's marked shift windows
 *   - Booked (blue) — real bookings from the backend
 *   - Blocked (red) — time the user blocks here, via the "Block Time Slot" form
 *   - a BREAK divider for the clinic lunch break
 *
 * Bookings/hours/breaks come from `GET /api/appointments/availability`; shift
 * windows and blocked slots come from the frontend store (`@/lib/shifts`).
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

type Booking = { start: string; end: string; patientName: string };
type Break = { start: string; end: string; label: string };
type TimeParts = { hh: string; mm: string; period: "AM" | "PM" };
type Range = { startMin: number; endMin: number };

const emptyParts = (): TimeParts => ({ hh: "", mm: "", period: "AM" });

/**
 * Windows with the given ranges cut out — used to split the doctor's available
 * (green) windows around breaks, blocks and bookings so each remaining green
 * piece is its own rounded segment.
 */
function subtractRanges(windows: Range[], cuts: Range[]): Range[] {
  const out: Range[] = [];
  for (const w of windows) {
    const overlaps = cuts
      .filter((c) => c.endMin > w.startMin && c.startMin < w.endMin)
      .map((c) => ({ startMin: Math.max(c.startMin, w.startMin), endMin: Math.min(c.endMin, w.endMin) }))
      .sort((a, b) => a.startMin - b.startMin);
    let cursor = w.startMin;
    for (const c of overlaps) {
      if (c.startMin > cursor) out.push({ startMin: cursor, endMin: c.startMin });
      cursor = Math.max(cursor, c.endMin);
    }
    if (cursor < w.endMin) out.push({ startMin: cursor, endMin: w.endMin });
  }
  return out;
}

/** "HH:mm" → minutes since midnight. */
function toMin(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}
/** minutes since midnight → "hh:mm AM". */
function fmtMin(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 || 12;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
}
/** Date → "yyyy-mm-dd" (local) for the availability query. */
function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
/** 12-hour parts → minutes since midnight. */
function partsToMin(t: TimeParts): number {
  const h12 = Number(t.hh) % 12;
  const h = t.period === "PM" ? h12 + 12 : h12;
  return h * 60 + Number(t.mm);
}
/** minutes since midnight → 12-hour parts, for loading a block into the form. */
function minToParts(min: number): TimeParts {
  const h24 = Math.floor(min / 60);
  const mm = min % 60;
  const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 || 12;
  return { hh: String(h).padStart(2, "0"), mm: String(mm).padStart(2, "0"), period };
}
function partsValid(t: TimeParts): boolean {
  const h = Number(t.hh);
  const m = Number(t.mm);
  return t.hh !== "" && t.mm !== "" && h >= 1 && h <= 12 && m >= 0 && m <= 59;
}

export default function DoctorAvailabilityModal({
  doctor,
  doctorId,
  date,
  onClose,
  viewOnly = false,
}: {
  doctor: string;
  doctorId: string;
  date: string;
  onClose: () => void;
  /** New-appointment flow only shows availability — hides the Block Time Slot
   *  form and the blocked-slots grid, leaving just the timeline to view. */
  viewOnly?: boolean;
}) {
  // Always open on the given day (the present day for the Doctors table / the
  // chosen date for the New Appointment flow); navigate from there as needed.
  const seed = parseDmy(date) ?? new Date();
  const [view, setView] = useState<Date>(seed);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [breaks, setBreaks] = useState<Break[]>([]);
  const [hours, setHours] = useState<{ open: string; close: string }>({
    open: "09:00",
    close: "18:00",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Blocked slots (Block Time Slot form) — persisted per doctor in localStorage.
  const [blocks, setBlocks] = useState<BlockedSlot[]>([]);
  const [from, setFrom] = useState<TimeParts>(emptyParts);
  const [to, setTo] = useState<TimeParts>(emptyParts);
  const [blockError, setBlockError] = useState("");
  // The blocked slot being edited — its times are loaded into the form and
  // "Block Slot" becomes "Update Slot" (null = adding a new block).
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  // Monotonic counter for unique block ids (avoids impure Date.now() in render).
  const blockSeq = useRef(0);

  // Load the doctor's bookings for the viewed day (re-runs when the day changes).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!doctorId) {
      setLoading(false);
      setError("Select a doctor to view availability.");
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    apiFetch<AvailabilityResponse>(
      `/appointments/availability?date=${ymd(view)}&doctorId=${doctorId}`,
    )
      .then((res) => {
        if (!active) return;
        setHours(res.businessHours);
        setBreaks(res.breaks ?? []);
        setBookings(res.doctors[0]?.bookings ?? []);
      })
      .catch(() => {
        if (active) setError("Couldn't load availability. Please try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [view, doctorId]);
  useEffect(() => {
    setBlocks(loadBlocks(doctorId));
  }, [doctorId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // The doctor's marked availability (green) windows for the viewed day, from
  // their saved shifts. No shift covering this date ⇒ the day is Not Available.
  // (Kept above the early return so hooks always run in the same order.)
  const availability = useMemo(
    () => (doctorId ? shiftWindowsForDate(doctorId, view) : []),
    [doctorId, view],
  );

  if (typeof document === "undefined") return null;

  const bizOpen = toMin(hours.open);
  const bizClose = toMin(hours.close);

  const dayKey = dmy(view);
  const dayBlocks = blocks.filter((b) => b.date === dayKey);

  // Break drawn at its real span, so green ends exactly at its start and resumes
  // at its end — both marked with the real times.
  const breakBands = breaks.map((br) => {
    const s = toMin(br.start);
    const e = toMin(br.end);
    return { startMin: s, endMin: e, realStart: s, realEnd: e };
  });

  // The timeline domain is the union of business hours and everything drawn on
  // it — so a shift (or booking/block) that starts before opening or runs past
  // closing (e.g. 09:00 AM–09:00 PM against an 18:00 close) stretches the bar to
  // fit rather than overflowing outside it. Positions/labels scale to this domain.
  const bookingMins = bookings.map((bk) => ({ startMin: toMin(bk.start), endMin: toMin(bk.end) }));
  const spans = [
    { startMin: bizOpen, endMin: bizClose },
    ...availability,
    ...dayBlocks.map((b) => ({ startMin: b.startMin, endMin: b.endMin })),
    ...bookingMins,
    ...breakBands.map((b) => ({ startMin: b.startMin, endMin: b.endMin })),
  ];
  const domainStart = Math.min(...spans.map((s) => s.startMin));
  const domainEnd = Math.max(...spans.map((s) => s.endMin));
  const span = Math.max(1, domainEnd - domainStart);
  const pct = (min: number) => ((min - domainStart) / span) * 100;

  // Green splits around every break divider, block and booking so each visible
  // green piece is its own rounded segment.
  const cuts: Range[] = [
    ...dayBlocks.map((b) => ({ startMin: b.startMin, endMin: b.endMin })),
    ...bookingMins,
    ...breakBands.map((b) => ({ startMin: b.startMin, endMin: b.endMin })),
  ];
  const greenSegs = subtractRanges(availability, cuts);
  // Not Available (dark) — business hours the doctor has no shift for. The lunch
  // break is carved out here too, so it reads as an unfilled divider "out of the
  // box" exactly like it does inside the available (green) stretch.
  const notAvailableSegs = subtractRanges(
    [{ startMin: bizOpen, endMin: bizClose }],
    [...availability, ...breakBands.map((b) => ({ startMin: b.startMin, endMin: b.endMin }))],
  );

  // Segments sit flush (no gap) — the only visible space is the lunch-break
  // divider, which is a carved (unfilled) region cut out of the bar.
  const segStyle = (startMin: number, endMin: number) => ({
    left: `${pct(startMin)}%`,
    width: `max(4px, ${pct(endMin) - pct(startMin)}%)`,
  });

  // Labels sit at every real segment boundary — business hours, each shift
  // (availability) window edge, the break start and end, and each block/booking
  // edge — so each is marked with its true time.
  // Ticks sit at the edges of the segments actually drawn on the bar — the
  // available (green) pieces, the Not Available (dark) stretches, blocks,
  // bookings and breaks — plus the domain ends. Business hours are NOT ticked on
  // their own, so a shift running past closing (e.g. to 09:00 PM) marks its real
  // end time and the 06:00 PM close isn't shown mid-green; the close only appears
  // when it's a genuine edge (where the dark Not-Available region begins).
  const boundary = new Set<number>([domainStart, domainEnd]);
  [
    ...greenSegs,
    ...notAvailableSegs,
    ...dayBlocks,
    ...bookingMins,
    ...breakBands,
  ].forEach((sgmt) => {
    boundary.add(sgmt.startMin);
    boundary.add(sgmt.endMin);
  });
  const ticks = [...boundary].filter((m) => m >= domainStart && m <= domainEnd).sort((a, b) => a - b);

  function shiftDay(delta: number) {
    setView((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta));
  }
  function setMonth(m: number) {
    setView((d) => new Date(d.getFullYear(), m, d.getDate()));
  }
  function setYear(y: number) {
    setView((d) => new Date(y, d.getMonth(), d.getDate()));
  }

  const canBlock = partsValid(from) && partsValid(to);

  function addBlock() {
    if (!canBlock) return;
    const s = partsToMin(from);
    const e = partsToMin(to);
    if (s >= e) {
      setBlockError("The 'To' time must be after the 'From' time.");
      return;
    }
    // A block only makes sense inside the doctor's available (green) hours.
    const withinAvailable = availability.some((w) => s >= w.startMin && e <= w.endMin);
    if (!withinAvailable) {
      setBlockError(
        availability.length === 0
          ? "The doctor has no available hours to block on this day."
          : "The blocked slot must fall within the doctor's available hours.",
      );
      return;
    }
    // A new block can't overlap one that's already blocked for this day (the
    // block being edited is excluded so it can be resized onto itself).
    const clash = dayBlocks.find(
      (b) => b.id !== editingBlockId && s < b.endMin && e > b.startMin,
    );
    if (clash) {
      setBlockError(
        `This range overlaps a slot already blocked (${fmtMin(clash.startMin)} – ${fmtMin(clash.endMin)}). Choose times that don't include an existing block.`,
      );
      return;
    }
    // Editing updates the existing block's times in place; adding appends a new
    // one. Either way the form and edit state reset afterwards.
    const next = editingBlockId
      ? blocks.map((b) => (b.id === editingBlockId ? { ...b, startMin: s, endMin: e } : b))
      : [...blocks, { id: `${dayKey}-${s}-${e}-${blockSeq.current++}`, date: dayKey, startMin: s, endMin: e }];
    setBlocks(next);
    saveBlocks(doctorId, next);
    setFrom(emptyParts());
    setTo(emptyParts());
    setBlockError("");
    setEditingBlockId(null);
  }

  /** Load a blocked slot back into the Block Time Slot form to edit it. */
  function editBlock(b: BlockedSlot) {
    setFrom(minToParts(b.startMin));
    setTo(minToParts(b.endMin));
    setEditingBlockId(b.id);
    setBlockError("");
  }

  /** Abandon an in-progress block edit, clearing the form. */
  function cancelBlockEdit() {
    setEditingBlockId(null);
    setFrom(emptyParts());
    setTo(emptyParts());
    setBlockError("");
  }

  function removeBlock(id: string) {
    const next = blocks.filter((b) => b.id !== id);
    setBlocks(next);
    saveBlocks(doctorId, next);
    // Deleting the row being edited abandons that edit.
    if (id === editingBlockId) cancelBlockEdit();
  }

  // Year picker: present year and forward only.
  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = thisYear; y <= thisYear + 10; y++) years.push(y);

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Doctor Availability"
        className="my-auto flex max-h-[90dvh] w-full max-w-[672px] flex-col overflow-hidden rounded-[32px] border-2 border-[#c2c6d4] bg-white shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)] [zoom:0.9]"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#c2c6d4]/50 px-[32px] pb-[16px] pt-[32px]">
          <div className="flex flex-col text-[#1e1e24]">
            <p className="font-manrope text-[30px] font-bold leading-[38px] tracking-[-0.75px]">
              Doctor Availability
            </p>
            <p className="font-manrope text-[15px] font-normal leading-[24px] tracking-[0.25px]">
              {doctor || "—"}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0">
            <CloseIcon className="size-6 text-[#1e1e24]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col gap-[20px] overflow-y-auto p-[32px]">
          {/* Date navigator */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-[24px]">
              <button
                type="button"
                aria-label="Previous day"
                onClick={() => shiftDay(-1)}
                className="flex size-[40px] items-center justify-center rounded-[12px] border border-[#1e1e24]"
              >
                <Image src="/dashboard/chevron_dark.svg" alt="" width={24} height={24} className="size-6" />
              </button>
              <div className="flex flex-col items-center">
                <span className="font-inter text-[12px] font-semibold uppercase leading-[16px] tracking-[1.2px] text-[#1e1e24]">
                  {MONTHS[view.getMonth()]} {view.getFullYear()}
                </span>
                <span className="font-manrope text-[24px] font-semibold leading-[32px] text-[#1e1e24]">
                  {WEEKDAYS[view.getDay()]}, {view.getDate()}
                </span>
              </div>
              <button
                type="button"
                aria-label="Next day"
                onClick={() => shiftDay(1)}
                className="flex size-[40px] items-center justify-center rounded-[12px] border border-[#1e1e24]"
              >
                <Image src="/dashboard/chevron_dark.svg" alt="" width={24} height={24} className="size-6 rotate-180" />
              </button>
            </div>

            <div className="flex items-start gap-[8px]">
              <PickerButton
                label={MONTHS[view.getMonth()]}
                options={MONTHS.map((m, i) => ({ label: m, value: i }))}
                selected={view.getMonth()}
                onSelect={setMonth}
              />
              <PickerButton
                label={String(view.getFullYear())}
                options={years.map((y) => ({ label: String(y), value: y }))}
                selected={view.getFullYear()}
                onSelect={setYear}
              />
            </div>
          </div>

          {/* Block Time Slot — hidden in the view-only (new-appointment) flow. */}
          {!viewOnly && (
          <div className="flex flex-col gap-[8px]">
            <span className="font-inter text-[11px] font-normal uppercase tracking-[0.5px] text-[#1e1e24]">
              Block Time Slot <span className="text-[#ba1a1a]">*</span>
            </span>
            <div className="flex flex-wrap items-end gap-[16px]">
              <TimeInput label="From" value={from} onChange={setFrom} />
              <TimeInput label="To" value={to} onChange={setTo} />
              <button
                type="button"
                onClick={addBlock}
                disabled={!canBlock}
                className={`rounded-[10px] px-[20px] py-[11px] font-inter text-[12px] font-semibold uppercase tracking-[0.5px] text-white transition-colors ${
                  canBlock ? "bg-[#0077c0] hover:bg-[#0069a8]" : "cursor-not-allowed bg-[#0077c0] opacity-50"
                }`}
              >
                {editingBlockId ? "Update Slot" : "Block Slot"}
              </button>
              {editingBlockId && (
                <button
                  type="button"
                  onClick={cancelBlockEdit}
                  className="rounded-[10px] border border-[#c2c6d4] px-[20px] py-[11px] font-inter text-[12px] font-semibold uppercase tracking-[0.5px] text-[#1e1e24] transition-colors hover:border-[#0077c0]"
                >
                  Cancel
                </button>
              )}
            </div>
            {blockError && (
              <span role="alert" className="font-inter text-[12px] text-[#ba1a1a]">
                {blockError}
              </span>
            )}
          </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap items-center justify-end gap-[28px]">
            <LegendItem color="#1e1e24" label="Not Available" />
            <LegendItem color="#ef4444" label="Blocked" />
            <LegendItem color="#0077c0" label="Booked" />
            <LegendItem color="#16a34a" label="Available" />
          </div>

          {/* Timeline */}
          <div className="flex flex-col gap-[10px]">
            {loading ? (
              <p className="py-6 text-center font-inter text-[14px] text-[#1e1e24]/60">
                Loading availability…
              </p>
            ) : error ? (
              <p role="alert" className="py-6 text-center font-inter text-[14px] text-[#ba1a1a]">
                {error}
              </p>
            ) : (
              <>
                <div className="relative w-full rounded-[24px] bg-[#eff4ff] p-[12px] shadow-[inset_0px_2px_4px_0px_rgba(0,0,0,0.05)]">
                  <div className="relative h-[56px] w-full">
                    {/* Not Available (dark) — business hours with no shift window. */}
                    {notAvailableSegs.map((n, i) => (
                      <div
                        key={`na-${n.startMin}-${i}`}
                        className="absolute top-0 h-full rounded-[14px] bg-[#1e1e24]"
                        style={segStyle(n.startMin, n.endMin)}
                      />
                    ))}
                    {/* Available (green) — split into rounded segments around every
                        break divider, block and booking (each a rounded pill). */}
                    {greenSegs.map((g, i) => (
                      <div
                        key={`green-${g.startMin}-${i}`}
                        className="absolute top-0 h-full rounded-[14px] bg-[#16a34a]"
                        style={segStyle(g.startMin, g.endMin)}
                      />
                    ))}
                    {/* Blocked (red) — user-blocked slots for this date. */}
                    {dayBlocks.map((b) => (
                      <div
                        key={b.id}
                        className="absolute top-0 h-full rounded-[14px] bg-[#ef4444]"
                        style={segStyle(b.startMin, b.endMin)}
                        title={`Blocked: ${fmtMin(b.startMin)}–${fmtMin(b.endMin)}`}
                      />
                    ))}
                    {/* Booked (blue) — real bookings. */}
                    {bookings.map((bk, i) => {
                      const s = toMin(bk.start);
                      const e = toMin(bk.end);
                      return (
                        <div
                          key={`${bk.start}-${i}`}
                          className="absolute top-0 h-full rounded-[14px] bg-[#0077c0]"
                          style={segStyle(s, e)}
                          title={`${fmtMin(s)}–${fmtMin(e)} · ${bk.patientName}`}
                        />
                      );
                    })}
                    {/* Break divider (e.g. lunch) — a slim unfilled gap with a
                        vertical BREAK label, so it reads as a divider. */}
                    {breakBands.map((b, i) => (
                      <div
                        key={`break-${b.realStart}-${i}`}
                        className="absolute top-0 flex h-full items-center justify-center"
                        style={segStyle(b.startMin, b.endMin)}
                        title={`Lunch Break: ${fmtMin(b.realStart)}–${fmtMin(b.realEnd)}`}
                      >
                        <div className="-rotate-90 text-center font-mono text-[11px] font-medium uppercase leading-[13px] tracking-[-0.55px] text-[#ef4444]">
                          <span className="block">Lunch</span>
                          <span className="block">Break</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Vertical hour labels at segment boundaries. The px-[12px]
                    inset matches the bar box's padding so each label lines up
                    under its segment edge — the domain-end label stays under the
                    bar rather than drifting out to the outer box edge. */}
                <div className="px-[12px]">
                  <div className="relative h-[54px] w-full">
                    {ticks.map((m) => (
                      <div
                        key={m}
                        className="absolute top-0 flex h-[54px] items-center justify-center"
                        style={{ left: `${pct(m)}%`, transform: "translateX(-50%)" }}
                      >
                        <span className="-rotate-90 whitespace-nowrap font-inter text-[11px] font-medium uppercase tracking-[-0.55px] text-[#1e1e24]">
                          {fmtMin(m)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Blocked slots — each a fixed-height bordered card in a 2-column
              grid with equal row/column gaps. Up to 4 (two rows) show at once;
              a 5th makes the group scroll. */}
          {!viewOnly && dayBlocks.length > 0 && (
            <div className="grid max-h-[180px] grid-cols-2 content-start gap-[24px] overflow-y-auto pr-[4px]">
              {dayBlocks.map((b) => (
                <div
                  key={b.id}
                  className="flex h-[76px] flex-col overflow-hidden rounded-[12px] border border-[#c2c6d4]"
                >
                  <div className="flex items-center border-b border-[#c2c6d4] py-[9px]">
                    <span className="flex-1 pl-[20px] font-inter text-[11px] font-semibold uppercase tracking-[0.4px] text-[#1e1e24]">
                      Blocked Time Slot
                    </span>
                    <span className="w-[92px] text-center font-inter text-[11px] font-semibold uppercase tracking-[0.4px] text-[#1e1e24]">
                      Action
                    </span>
                  </div>
                  <div className="flex flex-1 items-center">
                    <span className="flex-1 pl-[20px] font-inter text-[13px] text-[#1e1e24]">
                      {fmtMin(b.startMin)} - {fmtMin(b.endMin)}
                    </span>
                    <div className="flex w-[92px] items-center justify-center gap-[6px]">
                      <button
                        type="button"
                        aria-label={`Edit block ${fmtMin(b.startMin)} to ${fmtMin(b.endMin)}`}
                        onClick={() => editBlock(b)}
                        className="flex size-[28px] items-center justify-center"
                      >
                        <Image src="/dashboard/edit_square.svg" alt="" width={18} height={18} className="size-[18px]" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove block ${fmtMin(b.startMin)} to ${fmtMin(b.endMin)}`}
                        onClick={() => removeBlock(b.id)}
                        className="flex size-[28px] items-center justify-center"
                      >
                        <Image src="/dashboard/delete.svg" alt="" width={18} height={18} className="size-[18px]" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Compact HH:MM + AM/PM input used by the Block Time Slot form. */
function TimeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TimeParts;
  onChange: (v: TimeParts) => void;
}) {
  const box =
    "w-[46px] rounded-[8px] border border-[#c2c6d4] py-[8px] text-center font-inter text-[14px] text-[#1e1e24] outline-none focus:border-[#0077c0]";
  return (
    <div className="flex flex-col gap-[6px]">
      <span className="font-inter text-[10px] uppercase tracking-[0.5px] text-[#1e1e24]">{label}</span>
      <div className="flex items-center gap-[6px]">
        <input
          aria-label={`${label} hour`}
          value={value.hh}
          onChange={(e) => onChange({ ...value, hh: e.target.value.replace(/\D/g, "").slice(0, 2) })}
          placeholder="HH"
          inputMode="numeric"
          className={box}
        />
        <span className="font-inter text-[15px] text-[#424752]">:</span>
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
          className="rounded-[8px] border border-[#c2c6d4] bg-[#c2c6d4] px-[12px] py-[8px] font-inter text-[12px] font-semibold text-[#1e1e24] transition-colors"
        >
          {value.period}
        </button>
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-[4.474px]">
      <span className="size-[9px] rounded-full" style={{ backgroundColor: color }} />
      <span className="font-inter text-[15.658px] leading-[22.369px]" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

function PickerButton<T extends number>({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: { label: string; value: T }[];
  selected: T;
  onSelect: (v: T) => void;
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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-[8px] rounded-[8px] border border-[#1e1e24] py-[8px] pl-[16px] pr-[10px]"
      >
        <span className="font-inter text-[14px] font-medium leading-[20px] text-[#1e1e24]">{label}</span>
        <Image
          src="/dashboard/chevron_dark.svg"
          alt=""
          width={24}
          height={24}
          className={`size-6 transition-transform ${open ? "rotate-90" : "-rotate-90"}`}
        />
      </button>
      {open && (
        <ul className="absolute right-0 top-[calc(100%+6px)] z-10 max-h-[220px] w-[110px] overflow-y-auto rounded-[10px] border border-[#c2c6d4] bg-white py-1 shadow-lg">
          {options.map((opt) => (
            <li key={opt.label}>
              <button
                type="button"
                onClick={() => {
                  onSelect(opt.value);
                  setOpen(false);
                }}
                className={`w-full px-3 py-1.5 text-left font-inter text-[13px] hover:bg-[#f1f5f9] ${
                  opt.value === selected ? "font-semibold text-[#0077c0]" : "text-[#1e1e24]"
                }`}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}
