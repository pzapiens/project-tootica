"use client";

import Image from "next/image";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { apiFetch, type AppointmentListItem } from "@/lib/api";
import { statusColor } from "@/lib/statusColors";
import { useExclusiveDropdown } from "@/lib/useExclusiveDropdown";

import { chipTime, groupByDay, type CalAppointment, type CalStatus } from "./calendar-mock";

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type Cell = { date: Date; inMonth: boolean };

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildCells(year: number, month: number): Cell[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const total = Math.ceil((first.getDay() + daysInMonth) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { date, inMonth: date.getMonth() === month };
  });
}

export default function FullCalendarView() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = params.code;

  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  // Deep-link support: the mini calendar links here as `?date=YYYY-MM-DD`. When
  // present, the calendar opens on that month with that day's slide-over shown
  // in the right panel; otherwise it opens on the current month.
  const searchParams = useSearchParams();
  const linkedDay = useMemo(() => {
    const raw = searchParams.get("date");
    if (!raw) return null;
    const [y, m, d] = raw.split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }, [searchParams]);

  const [view, setView] = useState(() =>
    linkedDay
      ? { year: linkedDay.getFullYear(), month: linkedDay.getMonth() }
      : { year: today.getFullYear(), month: today.getMonth() },
  );
  const [selectedDay, setSelectedDay] = useState<Date | null>(linkedDay);
  const [selectedAppt, setSelectedAppt] = useState<CalAppointment | null>(null);
  const [monthAppts, setMonthAppts] = useState<Record<number, CalAppointment[]>>({});

  const cells = useMemo(() => buildCells(view.year, view.month), [view]);

  // Load the clinic's appointments for the viewed month and group them by day.
  useEffect(() => {
    let active = true;
    const from = new Date(view.year, view.month, 1);
    const to = new Date(view.year, view.month + 1, 0, 23, 59, 59, 999);
    const params = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
      limit: "500",
    });
    apiFetch<AppointmentListItem[]>(`/appointments?${params.toString()}`)
      .then((list) => {
        // Exclude pending (SCHEDULED) bookings — same rule as the appointments
        // table: a WhatsApp booking lives only in the "WhatsApp Appointments"
        // popup until it's accepted. It also has no code yet, so it couldn't be
        // opened via "View Appointment" (which filters the list by that ID).
        if (active) setMonthAppts(groupByDay(list.filter((a) => a.status !== "SCHEDULED")));
      })
      .catch(() => {
        if (active) setMonthAppts({});
      });
    return () => {
      active = false;
    };
  }, [view]);

  const monthCount = Object.values(monthAppts).reduce((n, list) => n + list.length, 0);

  function shiftMonth(delta: number) {
    const d = new Date(view.year, view.month + delta, 1);
    setView({ year: d.getFullYear(), month: d.getMonth() });
    setSelectedDay(null);
    setSelectedAppt(null);
  }

  function openDay(date: Date) {
    setSelectedDay(date);
    setSelectedAppt(null);
  }

  const dayAppts = selectedDay ? monthAppts[selectedDay.getDate()] ?? [] : [];

  return (
    <div className="relative flex min-h-[720px] flex-col gap-[19px]">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-[19px]">
          <div className="flex items-center gap-[15px]">
            <button
              type="button"
              aria-label="Back to dashboard"
              onClick={() => router.push(`/clinic-selection/${code}/dashboard`)}
              className="flex size-[38px] items-center justify-center"
            >
              <Image src="/dashboard/chevron_dark.svg" alt="" width={30} height={30} className="size-[30px]" />
            </button>
            <h1 className="font-manrope text-[28px] font-bold leading-[31px] text-[#1e1e24]">Calendar</h1>
          </div>
          <div className="flex flex-col gap-[8px]">
            <div className="flex items-center gap-[20px]">
              <MonthYearPicker
                year={view.year}
                month={view.month}
                onSelect={(m, y) => {
                  setView({ year: y, month: m });
                  setSelectedDay(null);
                  setSelectedAppt(null);
                }}
              />
              <div className="flex items-center gap-[6px]">
                <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
                  <Image src="/dashboard/chevron_dark.svg" alt="" width={28} height={28} className="size-7" />
                </button>
                <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)}>
                  <Image src="/dashboard/chevron_dark.svg" alt="" width={28} height={28} className="size-7 rotate-180" />
                </button>
              </div>
            </div>
            <p className="font-inter text-[15.6px] leading-[22px] text-[#1e1e24]">
              {monthCount} {monthCount === 1 ? "appointment" : "appointments"} this month
            </p>
          </div>
        </div>
        <Legend />
      </div>

      {/* Month grid */}
      <div className="flex-1 overflow-hidden rounded-[16px] border border-[#c2c6d4] bg-white shadow-[0px_1px_4px_rgba(0,0,0,0.02)]">
        {/* Weekday header */}
        <div className="grid grid-cols-7 border-b border-[#c2c6d4] bg-[#eff4ff]">
          {WEEKDAYS.map((d, i) => (
            <span
              key={d}
              className={`py-[9px] text-center font-inter text-[13px] font-semibold uppercase tracking-[0.66px] text-[#1e1e24] ${
                i < 6 ? "border-r border-[#c2c6d4]" : ""
              }`}
            >
              {d}
            </span>
          ))}
        </div>
        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map((cell, i) => {
            const isSelected = selectedDay ? sameDay(cell.date, selectedDay) : false;
            const isToday = sameDay(cell.date, today);
            const emphasize = isSelected || (isToday && !selectedDay);
            const appts = cell.inMonth ? monthAppts[cell.date.getDate()] ?? [] : [];
            const lastCol = (i + 1) % 7 === 0;
            return (
              <button
                key={i}
                type="button"
                onClick={() => openDay(cell.date)}
                className={`relative flex min-h-[124px] flex-col gap-[4px] px-[9px] pb-[10px] pt-[9px] text-left ${
                  cell.inMonth ? "bg-white" : "bg-[#f8f9ff]"
                } ${emphasize ? "border border-[#1e1e24]" : `border-b border-[#c2c6d4] ${lastCol ? "" : "border-r"}`}`}
              >
                {emphasize && (
                  <span className="pointer-events-none absolute right-0 top-0 h-0 w-0 border-l-[16px] border-t-[16px] border-l-transparent border-t-[#1e1e24]" />
                )}
                <span
                  className={`self-end font-mono text-[15px] font-medium leading-[22px] ${
                    cell.inMonth ? "text-[#1e1e24]" : "text-[#727783]"
                  }`}
                >
                  {cell.date.getDate()}
                </span>
                <div className="flex flex-col gap-[4px]">
                  {/* Cap each cell at three entries; the rest roll up into a
                      "+N more" line that opens the day's slide-over. */}
                  {appts.slice(0, 3).map((a) => (
                    <ApptChip
                      key={a.id}
                      appt={a}
                      onOpen={(e) => {
                        e.stopPropagation();
                        setSelectedDay(cell.date);
                        setSelectedAppt(a);
                      }}
                    />
                  ))}
                  {appts.length > 3 && (
                    <span className="pl-[3px] font-inter text-[11px] font-medium leading-[16px] text-[#727783]">
                      +{appts.length - 3} more
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Slide-over panel */}
      {selectedDay && (
        <SlideOver
          date={selectedDay}
          appt={selectedAppt}
          appts={dayAppts}
          onSelectAppt={setSelectedAppt}
          onBack={() => setSelectedAppt(null)}
          onClose={() => {
            setSelectedDay(null);
            setSelectedAppt(null);
          }}
          onView={(apptId) =>
            router.push(`/clinic-selection/${code}/appointments?q=${encodeURIComponent(apptId)}`)
          }
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ chips */

function ApptChip({ appt, onOpen }: { appt: CalAppointment; onOpen: (e: React.MouseEvent) => void }) {
  const c = statusColor(appt.status);
  // Solid statuses (On going) fill with the accent + white content; the rest are
  // a light tint with the accent used for the border, dot and text.
  const fg = c.solid ? "#ffffff" : c.accent;
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen(e as unknown as React.MouseEvent);
      }}
      className={`flex items-center gap-[6px] overflow-hidden rounded-[5px] border p-[5px] ${c.solid ? "" : c.bg}`}
      style={{ borderColor: c.accent, backgroundColor: c.solid ? c.accent : undefined }}
    >
      <span className="size-[6.6px] shrink-0 rounded-full" style={{ backgroundColor: fg }} />
      <span
        className={`truncate font-inter text-[11px] leading-[16px] ${
          appt.status === "Cancelled" ? "line-through" : ""
        }`}
        style={{ color: fg }}
      >
        {chipTime(appt.start)} - {appt.shortName}
      </span>
    </span>
  );
}

/* ----------------------------------------------------------------- legend */

function Legend() {
  const items: CalStatus[] = ["Completed", "Ongoing", "Upcoming", "Cancelled"];
  return (
    <div className="flex items-center gap-[18px]">
      {items.map((s) => {
        const { accent } = statusColor(s);
        return <LegendDot key={s} color={accent} text={accent} label={s} />;
      })}
    </div>
  );
}

function LegendDot({ color, text, label }: { color: string; text: string; label: string }) {
  return (
    <div className="flex items-center gap-[4.5px]">
      <span className="size-[9px] rounded-full" style={{ backgroundColor: color }} />
      <span className="font-inter text-[15.6px] leading-[22px]" style={{ color: text }}>
        {label}
      </span>
    </div>
  );
}

/* ------------------------------------------------------- month/year picker */

function MonthYearPicker({
  year,
  month,
  onSelect,
}: {
  year: number;
  month: number;
  onSelect: (month: number, year: number) => void;
}) {
  const [open, setOpen] = useExclusiveDropdown();
  const [draftYear, setDraftYear] = useState(year);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setDraftYear(year);
          setOpen((v) => !v);
        }}
        className="flex items-center gap-[8px]"
      >
        <span className="font-manrope text-[22px] font-semibold leading-[31px] text-[#1e1e24]">
          {MONTHS[month]} {year}
        </span>
        <Image
          src="/dashboard/chevron_dark.svg"
          alt=""
          width={28}
          height={28}
          className={`size-7 transition-transform ${open ? "rotate-90" : "-rotate-90"}`}
        />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-30 w-[260px] rounded-[15px] border border-[#c2c6d4] bg-white p-[16px] shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1)]">
          <div className="mb-[12px] flex items-center justify-between">
            <button type="button" aria-label="Previous year" onClick={() => setDraftYear((y) => y - 1)}>
              <Image src="/dashboard/chevron_dark.svg" alt="" width={24} height={24} className="size-6" />
            </button>
            <span className="font-manrope text-[16px] font-semibold text-[#1e1e24]">{draftYear}</span>
            <button type="button" aria-label="Next year" onClick={() => setDraftYear((y) => y + 1)}>
              <Image src="/dashboard/chevron_dark.svg" alt="" width={24} height={24} className="size-6 rotate-180" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-[6px]">
            {MONTHS_SHORT.map((m, i) => {
              const active = i === month && draftYear === year;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    onSelect(i, draftYear);
                    setOpen(false);
                  }}
                  className={`rounded-[8px] py-[8px] text-center font-inter text-[13px] transition-colors ${
                    active ? "bg-[#0077c0] font-semibold text-white" : "text-[#1e1e24] hover:bg-[#f1f5f9]"
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- slide-over */

function SlideOver({
  date,
  appt,
  appts,
  onSelectAppt,
  onBack,
  onClose,
  onView,
}: {
  date: Date;
  appt: CalAppointment | null;
  appts: CalAppointment[];
  onSelectAppt: (a: CalAppointment) => void;
  onBack: () => void;
  onClose: () => void;
  onView: (apptId: string) => void;
}) {
  const heading = `Appointments - ${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  if (typeof document === "undefined") return null;

  // Portaled and pinned to the shell's white content box (a 19px inset from the
  // viewport) so the panel sits flush against the box on the top, right and
  // bottom with no gap, instead of being inset by the page padding.
  return createPortal(
    <div className="fixed inset-y-[19px] right-[19px] z-[60] flex w-[460px] max-w-[calc(100vw-40px)] flex-col overflow-hidden rounded-r-[28px] border-l border-[#c2c6d4] bg-white shadow-[-12px_0px_36px_-12px_rgba(0,0,0,0.25)]">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[#c2c6d4] px-[30px] pb-[30px] pt-[30px]">
        <div className="flex items-center gap-[10px]">
          {appt && (
            <button type="button" aria-label="Back to list" onClick={onBack}>
              <Image src="/dashboard/chevron_dark.svg" alt="" width={22} height={22} className="size-[22px]" />
            </button>
          )}
          <h2 className="font-manrope text-[19px] font-semibold leading-[27px] text-[#1e1e24]">{heading}</h2>
        </div>
        <button type="button" aria-label="Close" onClick={onClose}>
          <CloseIcon className="size-6 text-[#1e1e24]" />
        </button>
      </div>

      {appt ? (
        <ApptDetail appt={appt} date={date} onView={onView} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-[30px]">
          {appts.length === 0 ? (
            <p className="font-inter text-[15px] text-[#94a3b8]">No appointments on this day.</p>
          ) : (
            <div className="flex flex-col gap-[15px]">
              {appts.map((a) => (
                <ApptListCard key={a.id} appt={a} onClick={() => onSelectAppt(a)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}

const BADGE_LABEL: Record<CalStatus, string> = {
  Completed: "COMPLETED",
  Ongoing: "ON GOING",
  Upcoming: "UPCOMING",
  Cancelled: "CANCELLED",
};

function ApptListCard({ appt, onClick }: { appt: CalAppointment; onClick: () => void }) {
  const c = statusColor(appt.status);
  const solid = !!c.solid;
  // Solid statuses fill with the accent + white content; light ones keep dark
  // content on a tint and carry the accent only on the border + badge.
  const contentColor = solid ? "#ffffff" : "#1e1e24";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-[10px] border p-[15px] text-left transition-opacity hover:opacity-95 ${
        solid ? "" : c.bg
      }`}
      style={{ borderColor: c.accent, backgroundColor: solid ? c.accent : undefined }}
    >
      <div className="flex flex-col gap-[3px]">
        <span className="font-manrope text-[13px] font-medium leading-[19px]" style={{ color: contentColor }}>
          {appt.start === "--" ? "--" : `${appt.start} - ${appt.end}`}
        </span>
        <span className="font-manrope text-[19px] font-semibold leading-[27px]" style={{ color: contentColor }}>
          {appt.patientName}
        </span>
        <span className="font-inter text-[13px] leading-[19px]" style={{ color: contentColor }}>
          {appt.consultationType}
        </span>
      </div>
      <span
        className="shrink-0 rounded-[11.5px] border px-[8px] py-[2px] font-inter text-[11.5px] font-semibold uppercase tracking-[0.58px]"
        style={
          solid
            ? { backgroundColor: "#ffffff", color: c.accent, borderColor: "#ffffff" }
            : { color: c.accent, borderColor: c.accent }
        }
      >
        {BADGE_LABEL[appt.status]}
      </span>
    </button>
  );
}

function ApptDetail({ appt, date, onView }: { appt: CalAppointment; date: Date; onView: (apptId: string) => void }) {
  const dateLabel = `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-[30px] overflow-y-auto p-[30px]">
        {/* Patient */}
        <div className="flex flex-col gap-[15px]">
          <h3 className="font-manrope text-[19px] font-semibold leading-[27px] text-[#0077c0]">
            {appt.patientName}
          </h3>
          <InfoCard>
            <InfoField label="Appointment ID" value={appt.apptId} />
            <InfoField label="Patient ID" value={appt.patientId} />
          </InfoCard>
          <InfoCard>
            <InfoField label="Phone" value={appt.phone} />
            <InfoField label="Email" value={appt.email} />
          </InfoCard>
        </div>

        {/* Appointment details */}
        <div className="flex flex-col gap-[15px]">
          <div className="flex items-center justify-between">
            <h4 className="font-inter text-[11.5px] font-semibold uppercase tracking-[0.58px] text-[#1e1e24]">
              Appointment Details
            </h4>
            <StatusPill status={appt.status} />
          </div>
          <div className="flex flex-col gap-[15px] rounded-[10px] border border-[#c2c6d4]/50 bg-white p-[16px]">
            <DetailRow icon="/dashboard/calendar_today.svg">
              <span className="font-inter text-[15px] font-semibold leading-[23px] text-[#1e1e24]">{dateLabel}</span>
              <span className="font-manrope text-[13px] font-medium leading-[19px] text-[#1e1e24]">
                {appt.start === "--" ? "--" : `${appt.start} - ${appt.end}`}
              </span>
            </DetailRow>
            <div className="h-px w-full bg-[#c2c6d4]/30" />
            <DetailRow icon="/dashboard/dentistry.svg" labelUp="Consultation Type">
              <span className="font-inter text-[15px] leading-[23px] text-[#1e1e24]">{appt.consultationType}</span>
            </DetailRow>
            <div className="h-px w-full bg-[#c2c6d4]/30" />
            <DetailRow icon="/dashboard/oral_disease_dark.svg" labelUp="Assigned Doctor">
              <span className="font-inter text-[15px] leading-[23px] text-[#1e1e24]">
                {appt.doctor === "Unassigned" ? "--" : appt.doctor}
              </span>
            </DetailRow>
          </div>
        </div>

        {/* Message */}
        <div className="flex flex-col gap-[15px]">
          <h4 className="font-inter text-[11.5px] font-semibold uppercase tracking-[0.58px] text-[#1e1e24]">
            Message
          </h4>
          <div className="rounded-[10px] border border-[#c2c6d4]/50 bg-white p-[16px]">
            <p className="font-inter text-[13px] italic leading-[19px] text-[#1e1e24]">{appt.message}</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-[#c2c6d4] px-[30px] pb-[30px] pt-[30px]">
        <button
          type="button"
          onClick={() => onView(appt.apptId)}
          className="w-full rounded-[50px] bg-[#0077c0] py-[15px] text-center font-inter text-[11.5px] font-semibold uppercase tracking-[0.58px] text-white transition-colors hover:bg-[#0069a8]"
        >
          View Appointment
        </button>
      </div>
    </>
  );
}

function InfoCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-[15px] rounded-[10px] border border-[#c2c6d4]/50 bg-white p-[16px]">
      {children}
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
      <span className="font-inter text-[11.5px] font-semibold tracking-[0.58px] text-[#1e1e24]">{label}</span>
      <span className="truncate font-inter text-[13px] leading-[19px] text-[#1e1e24]">{value}</span>
    </div>
  );
}

function DetailRow({
  icon,
  labelUp,
  children,
}: {
  icon: string;
  labelUp?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-[8px]">
      <Image src={icon} alt="" width={24} height={24} className="size-6 shrink-0" />
      <div className="flex flex-col gap-[3px]">
        {labelUp && (
          <span className="font-inter text-[11.5px] font-semibold uppercase tracking-[0.58px] text-[#1e1e24]">
            {labelUp}
          </span>
        )}
        {children}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: CalStatus }) {
  const { accent } = statusColor(status);
  return (
    <span
      className="flex items-center gap-[4px] rounded-[11.5px] px-[11px] py-[3.5px] font-inter text-[11.5px] font-semibold uppercase tracking-[0.58px] text-white"
      style={{ backgroundColor: accent }}
    >
      <span className="size-[9px] rounded-full bg-white" />
      {status}
    </span>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}
