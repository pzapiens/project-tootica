"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useExclusiveDropdown } from "@/lib/useExclusiveDropdown";

import { parseDmy } from "./DateInput";

/**
 * Doctor Availability modal (Figma "DA" 493:71383). Opened from the Select-by-
 * Doctor flow's "View Availability" button once a doctor + date are chosen. It
 * shows the chosen doctor's day as a timeline (Available / Booked / Break) with
 * a date navigator (prev/next day + Month/Year pickers) and a colour legend.
 *
 * The timeline itself is sample/dummy data (there's no availability API yet) and
 * is reproduced pixel-for-pixel from the design.
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

export default function DoctorAvailabilityModal({
  doctor,
  date,
  onClose,
}: {
  doctor: string;
  date: string;
  onClose: () => void;
}) {
  const seed = parseDmy(date) ?? new Date();
  const [view, setView] = useState<Date>(seed);

  if (typeof document === "undefined") return null;

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
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Doctor Availability"
        onMouseDown={(e) => e.stopPropagation()}
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
            <LegendItem color="#1e1e24" text="#1e1e24" label="Not Available" />
            <LegendItem color="red" text="red" label="Blocked" />
            <LegendItem color="#0077c0" text="#0077c0" label="Booked" />
            <LegendItem color="#16a34a" text="#16a34a" label="Available" />
          </div>

          {/* Timeline (sample day) */}
          <div className="flex flex-col gap-[24px]">
            <div className="relative flex h-[64px] w-full items-center rounded-[12px] bg-[#eff4ff] p-[8px] shadow-[inset_0px_2px_4px_0px_rgba(0,0,0,0.05)]">
              <div className="flex h-[48px] w-[213px] shrink-0 rounded-[12px] bg-[#16a34a]" />
              <div className="relative flex h-[48px] w-[32px] shrink-0 items-center justify-center">
                <span className="rotate-90 font-mono text-[11px] font-medium uppercase leading-[16.5px] tracking-[-0.55px] text-[#ba1a1a]">
                  Break
                </span>
              </div>
              <div className="h-[48px] w-[33px] shrink-0 rounded-[12px] bg-[#0077c0]" />
              <div className="ml-[1px] h-[48px] w-[313px] shrink-0 rounded-[12px] bg-[#16a34a]" />
            </div>

            {/* Vertical time-boundary labels */}
            <div className="relative h-[54px] w-full">
              {[
                { x: 8, label: "09:00 AM" },
                { x: 221, label: "12:00 PM" },
                { x: 253, label: "01:00 PM" },
                { x: 286, label: "02:00 PM" },
                { x: 599, label: "06:00 PM" },
              ].map((t) => (
                <div
                  key={t.label}
                  className="absolute top-0 flex h-[54px] w-[16px] items-center justify-center"
                  style={{ left: t.x - 8 }}
                >
                  <span className="-rotate-90 whitespace-nowrap font-inter text-[11px] font-medium uppercase leading-[16.5px] tracking-[-0.55px] text-[#1e1e24]">
                    {t.label}
                  </span>
                </div>
              ))}
            </div>
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
