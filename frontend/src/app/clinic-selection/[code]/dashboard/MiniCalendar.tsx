"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

/**
 * Functional mini month calendar (Figma "Mini Calendar"). Renders the real
 * current month with today highlighted, working previous/next navigation and
 * click-to-select. Appointment data is still mock, but the dates are live.
 */

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type Cell = { date: Date; inMonth: boolean };

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

export default function MiniCalendar() {
  const router = useRouter();
  const params = useParams<{ code: string }>();

  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState<Date>(today);

  const cells = useMemo(() => buildCells(view.year, view.month), [view]);

  function shiftMonth(delta: number) {
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
            const isSelected = sameDay(cell.date, selected);
            const isPast = cell.date < today;

            let textClass = "text-[#1e1e24] font-normal";
            if (!cell.inMonth) textClass = "text-[#cbd5e1] font-normal";
            else if (isSelected && !isToday) textClass = "text-[#0077c0] font-bold";
            else if (isPast) textClass = "text-[#c2c6d4] font-normal";

            return (
              <div key={i} className="flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setSelected(cell.date);
                    if (!cell.inMonth) {
                      setView({ year: cell.date.getFullYear(), month: cell.date.getMonth() });
                    }
                  }}
                  aria-label={cell.date.toDateString()}
                  aria-current={isToday ? "date" : undefined}
                  className={
                    isToday
                      ? "flex size-[37.333px] items-center justify-center rounded-full bg-[#f1f5f9] font-inter text-[16.333px] font-bold leading-[23.333px] text-[#1e1e24]"
                      : `flex size-[37.333px] items-center justify-center rounded-full font-inter text-[16.333px] leading-[23.333px] hover:bg-[#f1f5f9] ${textClass}`
                  }
                >
                  {cell.date.getDate()}
                </button>
              </div>
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
