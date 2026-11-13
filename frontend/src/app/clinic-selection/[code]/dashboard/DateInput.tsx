"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import FloatingPanel from "@/components/FloatingPanel";

/**
 * Reusable date field used for every date selection in the app. It supports
 * BOTH input modes:
 *  - type directly into the field (auto-masked to dd/mm/yyyy), or
 *  - click the calendar icon to pick from the dropdown calendar
 *    (Figma "DOB Calendar": month + year selectors, prev/next, date grid).
 *
 * The calendar always opens on the present month unless a value is already set.
 * Value is a `dd/mm/yyyy` string ("" when empty).
 */
export function DateInput({
  value,
  onChange,
  placeholder = "dd/mm/yyyy",
  disablePast,
  disableFuture,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** When true, dates before today can't be selected (used by New Appointment). */
  disablePast?: boolean;
  disableFuture?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selected = parseDmy(value);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 border-b-[1.167px] border-black pb-2 pt-1 focus-within:border-[#0077c0]">
        <input
          value={value}
          onChange={(e) => onChange(maskDate(e.target.value))}
          onFocus={() => setOpen(false)}
          placeholder={placeholder}
          inputMode="numeric"
          className="min-w-0 flex-1 bg-transparent font-inter text-[14px] text-[#1e1e24] outline-none placeholder:text-field-placeholder"
        />
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Open calendar"
          aria-expanded={open}
          aria-haspopup="dialog"
          className="shrink-0"
        >
          <Image src="/dashboard/calendar_today.svg" alt="" width={20} height={20} className="size-5" />
        </button>
      </div>
      {open && (
          <FloatingPanel
            anchor={triggerRef}
            width={256}
            onClose={() => setOpen(false)}
            role="dialog"
            label="Choose date"
            datePopover
            className="app-date-popover"
          >
            <DateCalendar
              value={selected}
              disablePast={disablePast}
              disableFuture={disableFuture}
              onSelect={(d) => {
                onChange(formatDmy(d));
                setOpen(false);
              }}
            />
          </FloatingPanel>
        )}
    </div>
  );
}

const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

/** Calendar popover with month + year selectors; defaults to the present. */
export function DateCalendar({
  value,
  onSelect,
  disablePast,
  disableFuture,
}: {
  value: Date | null;
  onSelect: (d: Date) => void;
  disablePast?: boolean;
  disableFuture?: boolean;
}) {
  const base = value ?? new Date();
  const [view, setView] = useState({ year: base.getFullYear(), month: base.getMonth() });
  const [menu, setMenu] = useState<null | "month" | "year">(null);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  if (disablePast) {
    // New Appointment: current year and forward only.
    for (let y = thisYear; y <= thisYear + 10; y++) years.push(y);
  } else {
    for (let y = disableFuture ? thisYear : thisYear + 10; y >= 1920; y--) years.push(y);
  }

  const first = new Date(view.year, view.month, 1);
  const start = new Date(view.year, view.month, 1 - first.getDay());
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const total = Math.ceil((first.getDay() + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: total }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { date: d, inMonth: d.getMonth() === view.month };
  });

  function shift(delta: number) {
    const d = new Date(view.year, view.month + delta, 1);
    setView({ year: d.getFullYear(), month: d.getMonth() });
    setMenu(null);
  }

  return (
    <div className="flex w-full flex-col gap-[8px] rounded-[13px] border-[1.167px] border-black bg-white p-[14px] shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-[5px]">
          <PillSelect
            label={MONTHS_FULL[view.month]}
            open={menu === "month"}
            onToggle={() => setMenu((m) => (m === "month" ? null : "month"))}
          >
            {MONTHS_FULL.map((m, i) => (
              <MenuItem
                key={m}
                selected={i === view.month}
                onClick={() => {
                  setView((v) => ({ ...v, month: i }));
                  setMenu(null);
                }}
              >
                {m}
              </MenuItem>
            ))}
          </PillSelect>
          <PillSelect
            label={String(view.year)}
            matchTriggerWidth
            open={menu === "year"}
            onToggle={() => setMenu((m) => (m === "year" ? null : "year"))}
          >
            {years.map((y) => (
              <MenuItem
                key={y}
                selected={y === view.year}
                onClick={() => {
                  setView((v) => ({ ...v, year: y }));
                  setMenu(null);
                }}
              >
                {y}
              </MenuItem>
            ))}
          </PillSelect>
        </div>
        <div className="flex items-center">
          <button type="button" aria-label="Previous month" onClick={() => shift(-1)}>
            <Image src="/dashboard/chevron_dark.svg" alt="" width={24} height={24} className="size-5" />
          </button>
          <button type="button" aria-label="Next month" onClick={() => shift(1)}>
            <Image src="/dashboard/chevron_dark.svg" alt="" width={24} height={24} className="size-5 rotate-180" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-[4px] pt-[8px]">
        {WEEKDAY_LETTERS.map((d, i) => (
          <span key={i} className="text-center font-inter text-[10px] leading-[15px] text-[#727783]">
            {d}
          </span>
        ))}
        {cells.map((cell, i) => {
          if (!cell.inMonth) return <span key={i} />;
          const unavailable = Boolean((disablePast && cell.date < today) || (disableFuture && cell.date > today));
          const selected = value && sameDay(cell.date, value);
          return (
            <button
              key={i}
              type="button"
              disabled={unavailable}
              onClick={() => onSelect(cell.date)}
              className={`flex items-center justify-center rounded-[12px] py-[4px] text-center font-inter text-[12px] leading-[16px] ${
                unavailable
                  ? "cursor-not-allowed text-[#cbd5e1]"
                  : selected
                    ? "bg-[#0077c0] font-bold text-white"
                    : "text-[#1e1e24] app-option-hover"
              }`}
            >
              {cell.date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PillSelect({
  label,
  open,
  onToggle,
  matchTriggerWidth = false,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  matchTriggerWidth?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center rounded-[8px] border-[1.167px] border-black py-[6px] pl-[10px] pr-[5px] font-inter text-[11px] font-medium text-[#1e1e24]"
      >
        {label}
        <Image
          src="/dashboard/chevron_dark.svg"
          alt=""
          width={24}
          height={24}
          className={`size-5 transition-transform ${open ? "rotate-90" : "-rotate-90"}`}
        />
      </button>
      {open && (
        <ul className={`absolute left-0 top-[calc(100%+4px)] z-50 max-h-[180px] ${matchTriggerWidth ? "w-full" : "w-[90px]"} overflow-y-auto rounded-[10px] border-[1.167px] border-black bg-white py-1 shadow-lg`}>
          {children}
        </ul>
      )}
    </div>
  );
}

function MenuItem({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`w-full px-3 py-1.5 text-left font-inter text-[12px] app-option-hover ${
          selected ? "font-semibold text-[#0077c0]" : "text-[#1e1e24]"
        }`}
      >
        {children}
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ helpers */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Auto-format free typed digits into dd/mm/yyyy. */
export function maskDate(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  let out = d.slice(0, 2);
  if (d.length > 2) out += "/" + d.slice(2, 4);
  if (d.length > 4) out += "/" + d.slice(4, 8);
  return out;
}

export function formatDmy(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function parseDmy(s: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(year, month - 1, day);
  // Reject overflow like 32/13/2020.
  if (d.getDate() !== day || d.getMonth() !== month - 1 || d.getFullYear() !== year) return null;
  return d;
}

/** ISO `yyyy-mm-dd` from a Date. */
export function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
