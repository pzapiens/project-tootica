"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { type AppointmentListItem } from "@/lib/api";

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
    <div className="flex w-[373px] shrink-0 flex-col gap-[24px] rounded-[28px] border-[1.167px] border-[#c2c6d4] bg-white p-[29.167px] drop-shadow-[0px_1.167px_1.167px_rgba(0,0,0,0.05)]">
      <div className="flex flex-col gap-[24px]">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-inter text-[21px] font-bold leading-[32.667px] text-[#1e1e24]">
            {MONTHS[view.month]} {view.year}
          </h3>
          <div className="flex items-center">
            <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
              <Image src="/dashboard/chevron_dark.svg" alt="" width={24} height={24} className="size-6" />
            </button>
            <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)}>
              <Image src="/dashboard/chevron_dark.svg" alt="" width={24} height={24} className="size-6 rotate-180" />
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 gap-y-[14px]">
          {WEEKDAYS.map((d) => (
            <span
              key={d}
              className="text-center font-inter text-[14px] font-semibold leading-[18.667px] text-[#1e1e24]"
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
              ? "flex size-[37.333px] items-center justify-center rounded-full bg-[#f1f5f9] font-inter text-[16.333px] font-bold leading-[23.333px] text-[#1e1e24] transition-colors group-hover:bg-[#e2e8f0]"
              : `flex size-[37.333px] items-center justify-center rounded-full font-inter text-[16.333px] leading-[23.333px] transition-colors group-hover:bg-[#f1f5f9] ${textClass}`;

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
                className="group flex flex-col items-center justify-center gap-[3px]"
              >
                <span className={cellClass}>{cell.date.getDate()}</span>
                {/* Appointment indicator (dot under days that have appointments) */}
                <span
                  aria-hidden
                  className={`size-[5px] rounded-full ${hasAppts ? "bg-[#0077c0]" : "bg-transparent"}`}
                />
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => router.push(`/clinic-selection/${params.code}/calendar`)}
        className="w-full rounded-[50px] bg-[#0077c0] py-[14px] text-center font-inter text-[16.333px] font-semibold leading-[23.333px] text-white transition-colors hover:bg-[#0069a8]"
      >
        View Full Calendar
      </button>
    </div>
  );
}
