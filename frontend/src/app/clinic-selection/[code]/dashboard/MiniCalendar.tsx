"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { type AppointmentListItem } from "@/lib/api";
import styles from "./dashboard.module.css";

/**
 * Mini month calendar (Figma "Mini Calendar"). Renders the real current month
 * with today highlighted and working previous/next navigation. Days that have
 * appointments show a dot (from the live backend list). Clicking any day opens
 * the full calendar on that day's month with its slide-over showing that day's
 * appointments. The full month/day view lives behind the "View Full Calendar"
 * button.
 */

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type Cell = { date: Date; inMonth: boolean };
type MonthView = { year: number; month: number };

/** Strip the time part so two dates compare by calendar day. */
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Build the visible grid (whole weeks) covering the given month. */
function buildCells(year: number, month: number): Cell[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay()); // back up to Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = first.getDay();
  const total = Math.ceil((leading + daysInMonth) / 7) * 7;

  return Array.from({ length: total }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { date, inMonth: date.getMonth() === month };
  });
}

/** Local `yyyy-mm-dd` key for grouping appointments by calendar day. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Zero-padded local `YYYY-MM-DD` for the calendar page's `?date=` param. */
function dateParam(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function MiniCalendar({
  appointments,
  initialMonth,
}: {
  appointments: AppointmentListItem[];
  initialMonth: MonthView;
}) {
  const router = useRouter();
  const params = useParams<{ code: string }>();

  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  const [view, setView] = useState<MonthView>(initialMonth);
  // Follow the computed initial month (from the latest appointment) until the
  // user navigates months themselves.
  const navigatedRef = useRef(false);
  useEffect(() => {
    if (!navigatedRef.current) setView(initialMonth);
  }, [initialMonth]);

  const cells = useMemo(() => buildCells(view.year, view.month), [view]);

  // Days (this month) that have at least one appointment → dot indicator.
  const apptDays = useMemo(() => {
    const set = new Set<string>();
    for (const a of appointments) {
      const d = new Date(a.startTime);
      if (d.getFullYear() === view.year && d.getMonth() === view.month) {
        set.add(dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate())));
      }
    }
    return set;
  }, [appointments, view]);

  function shiftMonth(delta: number) {
    navigatedRef.current = true;
    const d = new Date(view.year, view.month + delta, 1);
    setView({ year: d.getFullYear(), month: d.getMonth() });
  }

  return (
    <div className={`${styles.calendar} flex flex-col gap-[16px] rounded-[20px] border-[1.167px] border-black bg-white drop-shadow-[0px_1.167px_1.167px_rgba(0,0,0,0.05)]`}>
      <div className={`${styles.calendarMain} flex flex-col`}>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-inter text-[15px] sm:text-[16px] font-bold leading-[24px] text-[#1e1e24]">
            {MONTHS[view.month]} {view.year}
          </h3>
          <div className="flex items-center">
            <button type="button" className="flex size-8 items-center justify-center" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
              <Image src="/dashboard/chevron_dark.svg" alt="" width={24} height={24} className="size-5" />
            </button>
            <button type="button" className="flex size-8 items-center justify-center" aria-label="Next month" onClick={() => shiftMonth(1)}>
              <Image src="/dashboard/chevron_dark.svg" alt="" width={24} height={24} className="size-5 rotate-180" />
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className={`${styles.calendarGrid} grid grid-cols-7`}>
          {WEEKDAYS.map((d) => (
            <span
              key={d}
              className="text-center font-inter text-[12px] font-semibold leading-[18px] text-[#1e1e24]"
            >
              {d}
            </span>
          ))}
          {cells.map((cell, i) => {
            const isToday = sameDay(cell.date, today);
            const hasAppts = cell.inMonth && apptDays.has(dayKey(cell.date));

            // In-month days stay dark; only days spilling in from the adjacent
            // months are muted. Past days are NOT greyed — the data is
            // historical, so greying them made the whole grid look disabled.
            const textClass = cell.inMonth
              ? "text-[#1e1e24] font-normal"
              : "text-[#cbd5e1] font-normal";

            // Today is highlighted; otherwise the default/greyed style. Every
            // day is clickable and opens the full calendar on that date.
            const cellClass = isToday
              ? "flex h-[32px] w-full max-w-[32px] items-center justify-center rounded-full bg-[#0077c0] font-inter text-[13px] font-bold leading-[21px] text-white transition-colors group-hover:bg-[#0069a8]"
              : `flex h-[32px] w-full max-w-[32px] items-center justify-center rounded-full font-inter text-[13px] leading-[21px] transition-colors group-hover:bg-[var(--app-option-hover-fill)] ${textClass}`;

            return (
              <button
                key={i}
                type="button"
                aria-label={cell.date.toDateString()}
                aria-current={isToday ? "date" : undefined}
                onClick={() =>
                  router.push(
                    `/clinic-selection/${params.code}/calendar?date=${dateParam(cell.date)}`,
                  )
                }
                className="group flex min-w-0 cursor-pointer flex-col items-center justify-center gap-px"
              >
                <span className={cellClass}>{cell.date.getDate()}</span>
                {/* Appointment indicator: a dot under days that have
                    appointments — brand blue normally, black on today — with
                    a uniform four-pixel size. */}
                <span
                  aria-hidden
                  className={`size-[4px] shrink-0 rounded-full transition-colors ${
                    hasAppts ? (isToday ? "bg-[#1e1e24]" : "bg-[#0077c0]") : "bg-transparent"
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => router.push(`/clinic-selection/${params.code}/calendar`)}
        className="w-full rounded-[50px] bg-[#0077c0] py-[10px] text-center font-inter text-[12px] sm:text-[13px] font-semibold leading-[21px] text-white transition-colors hover:bg-[#0069a8]"
      >
        View Full Calendar
      </button>
    </div>
  );
}
