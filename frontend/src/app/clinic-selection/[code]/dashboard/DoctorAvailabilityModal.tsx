"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { apiFetch, type AvailabilityResponse } from "@/lib/api";
import { useExclusiveDropdown } from "@/lib/useExclusiveDropdown";

import { parseDmy } from "./DateInput";

/**
 * Doctor Availability modal (Figma "DA" 493:71383). Opened from the Select-by-
 * Doctor flow's "View Availability" button once a doctor + date are chosen. It
 * shows the chosen doctor's day as a timeline (Available / Booked) with a date
 * navigator (prev/next day + Month/Year pickers) and a colour legend.
 *
 * The timeline is driven by the real backend: `GET /api/appointments/
 * availability?date=…&doctorId=…` returns the doctor's bookings for the day,
 * which are laid out over the clinic's business hours.
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
/** Date → "yyyy-mm-dd" (local). */
function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function DoctorAvailabilityModal({
  doctor,
  doctorId,
  date,
  onClose,
}: {
  doctor: string;
  doctorId: string;
  date: string;
  onClose: () => void;
}) {
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

  // Load the doctor's bookings for the viewed day (re-runs when the day changes).
  // The synchronous loading/error resets are the standard data-fetch pattern.
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
  /* eslint-enable react-hooks/set-state-in-effect */

  if (typeof document === "undefined") return null;

  const openMin = toMin(hours.open);
  const closeMin = toMin(hours.close);
  const span = Math.max(1, closeMin - openMin);
  const pct = (min: number) => ((min - openMin) / span) * 100;
  // 3-hourly ticks across business hours (plus the closing time).
  const ticks: number[] = [];
  for (let m = openMin; m < closeMin; m += 180) ticks.push(m);
  ticks.push(closeMin);

  function shiftDay(delta: number) {
    setView((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta));
  }
  function setMonth(m: number) {
    setView((d) => new Date(d.getFullYear(), m, d.getDate()));
  }
  function setYear(y: number) {
    setView((d) => new Date(y, d.getMonth(), d.getDate()));
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

          {/* Legend */}
          <div className="flex items-center justify-end gap-[15px]">
            <LegendItem color="#ba1a1a" text="#ba1a1a" label="Break" />
            <LegendItem color="#0077c0" text="#0077c0" label="Booked" />
            <LegendItem color="#16a34a" text="#16a34a" label="Available" />
          </div>

          {/* Timeline — green (available) across business hours, with the
              doctor's real bookings laid over it in blue. */}
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
                <div className="relative h-[64px] w-full rounded-[12px] bg-[#eff4ff] p-[8px] shadow-[inset_0px_2px_4px_0px_rgba(0,0,0,0.05)]">
                  <div className="relative h-[48px] w-full overflow-hidden rounded-[12px] bg-[#16a34a]">
                    {/* Breaks (e.g. lunch) — drawn first so bookings sit on top. */}
                    {breaks.map((br, i) => {
                      const s = toMin(br.start);
                      const e = toMin(br.end);
                      return (
                        <div
                          key={`break-${br.start}-${i}`}
                          className="absolute top-0 flex h-full items-center justify-center bg-[#ba1a1a]"
                          style={{ left: `${pct(s)}%`, width: `${pct(e) - pct(s)}%` }}
                          title={`${br.label}: ${fmtMin(s)}–${fmtMin(e)}`}
                        >
                          <span className="truncate px-1 font-mono text-[10px] font-medium uppercase tracking-[-0.3px] text-white">
                            {br.label}
                          </span>
                        </div>
                      );
                    })}
                    {bookings.map((b, i) => {
                      const s = toMin(b.start);
                      const e = toMin(b.end);
                      return (
                        <div
                          key={`${b.start}-${i}`}
                          className="absolute top-0 h-full bg-[#0077c0]"
                          style={{ left: `${pct(s)}%`, width: `${pct(e) - pct(s)}%` }}
                          title={`${fmtMin(s)}–${fmtMin(e)} · ${b.patientName}`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Hour labels across the business-hours range */}
                <div className="relative h-[18px] w-full">
                  {ticks.map((m, i) => (
                    <span
                      key={m}
                      className="absolute top-0 whitespace-nowrap font-inter text-[11px] font-medium uppercase leading-[16px] tracking-[0.3px] text-[#1e1e24]"
                      style={{
                        left: `${pct(m)}%`,
                        transform:
                          i === 0
                            ? "none"
                            : i === ticks.length - 1
                              ? "translateX(-100%)"
                              : "translateX(-50%)",
                      }}
                    >
                      {fmtMin(m)}
                    </span>
                  ))}
                </div>

                <p className="pt-[6px] font-inter text-[13px] text-[#1e1e24]/60">
                  {bookings.length === 0
                    ? "No bookings — free all day."
                    : `${bookings.length} booking${bookings.length === 1 ? "" : "s"} this day.`}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function LegendItem({ color, text, label }: { color: string; text: string; label: string }) {
  return (
    <div className="flex items-center gap-[4.474px]">
      <span className="size-[9px] rounded-full" style={{ backgroundColor: color }} />
      <span className="font-inter text-[15.658px] leading-[22.369px]" style={{ color: text }}>
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
        className="flex items-center gap-[8px] rounded-[8px] border border-[#1e1e24] py-[8px] pl-[10px] pr-[5px]"
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
