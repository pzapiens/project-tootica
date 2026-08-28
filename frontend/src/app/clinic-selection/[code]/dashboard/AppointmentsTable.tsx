"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import { useExclusiveDropdown } from "@/lib/useExclusiveDropdown";

import { type AppointmentEditResult, type Time } from "./AppointmentFormStep";
import NewAppointmentModal, { type EditAppointment } from "./NewAppointmentModal";
import {
  STATUS_FILTER_OPTIONS,
  TODAYS_APPOINTMENTS,
  todayDmy,
  type AppointmentStatus,
  type DashboardAppointment,
} from "./mock";

/** "09:00 AM" → { h: "09", m: "00", p: "AM" } for the appointment form. */
function parseTime(s: string): Time {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(s.trim());
  if (!m) return { h: "", m: "", p: "AM" };
  return { h: m[1].padStart(2, "0"), m: m[2], p: m[3].toUpperCase() as "AM" | "PM" };
}

/** Minutes-from-midnight of a "09:00 AM" time, for sorting the table by time. */
function startMinutes(s: string): number {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(s.trim());
  if (!m) return Number.MAX_SAFE_INTEGER;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") h += 12;
  return h * 60 + Number(m[2]);
}

/** "TEETH WHITENING" → "Teeth Whitening" for the table's treatment column. */
function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Build the Edit Appointment prefill from a today's-appointments row. */
function toEdit(a: DashboardAppointment): EditAppointment {
  return {
    patient: { name: a.patientName, dob: a.dob, gender: a.gender, phone: a.phone, email: a.email },
    initial: {
      consultation: [a.consultationType],
      leadSource: a.leadSource,
      message: a.message,
      mode: a.scheduleMode,
      date: todayDmy(),
      from: parseTime(a.startTime),
      to: parseTime(a.endTime),
      doctor: a.doctor,
      status: a.status,
    },
  };
}

const STATUS_BADGE: Record<AppointmentStatus, string> = {
  Upcoming: "bg-[#f0fdf4] text-[#16a34a]",
  "On going": "bg-[#0077c0] text-white",
  Completed: "bg-[#f1f5f9] text-[#1e1e24]",
  Rescheduled: "bg-[#fdf9f0] text-[#a36d16]",
  Cancelled: "bg-[#f9f1f1] text-[#ab2222]",
};

// Row styling for each option inside the status dropdown (Figma "Appts Status
// Dropdown"). `text` colours both the label and the selected check (via
// currentColor), so the tick matches the option's content colour.
const STATUS_OPTION: Record<string, { row: string; text: string }> = {
  "All status": { row: "bg-[rgba(0,94,184,0.1)]", text: "text-[#0077c0]" },
  Upcoming: { row: "bg-[#f0fdf4]", text: "text-[#16a34a]" },
  "On going": { row: "bg-[#0077c0]", text: "text-white" },
  Completed: { row: "bg-[#f1f5f9]", text: "text-[#1e1e24]" },
  Rescheduled: { row: "bg-[#fdf9f0]", text: "text-[#a36d16]" },
  Cancelled: { row: "bg-[#f9f1f1]", text: "text-[#ab2222]" },
};

/** check_small icon (from the Figma asset) rendered with currentColor. */
function CheckSmall({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M10 16.4L6 12.4L7.4 11L10 13.6L16.6 7L18 8.4L10 16.4Z" fill="currentColor" />
    </svg>
  );
}

/**
 * "Today's Appointments" table (Figma "TA" + "TA Table"). Client-side search +
 * status filter over the mock list; the on-going row is emphasised in blue.
 *
 * When `height` is provided (desktop), the section is fixed to that height so it
 * aligns with the calendar's bottom, and the table body scrolls if the rows
 * overflow.
 */
export default function AppointmentsTable({ height }: { height?: number }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>(STATUS_FILTER_OPTIONS[0]);
  const [appointments, setAppointments] = useState<DashboardAppointment[]>(TODAYS_APPOINTMENTS);
  const [editing, setEditing] = useState<DashboardAppointment | null>(null);

  // Filter by the search + status, then always order by start time.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return appointments
      .filter((a) => {
        const matchesQuery =
          !q ||
          [a.patientName, a.treatment, a.doctor].some((f) => f.toLowerCase().includes(q));
        const matchesStatus = status === STATUS_FILTER_OPTIONS[0] || a.status === status;
        return matchesQuery && matchesStatus;
      })
      .sort((a, b) => startMinutes(a.startTime) - startMinutes(b.startTime));
  }, [query, status, appointments]);

  // Persist an edit back into the table (and re-sort by the new time).
  function handleSave(result: AppointmentEditResult) {
    if (!editing) return;
    setAppointments((list) =>
      list.map((a) =>
        a.id === editing.id
          ? {
              ...a,
              doctor: result.doctor || a.doctor,
              startTime: result.startTime || a.startTime,
              endTime: result.endTime || a.endTime,
              treatment: result.consultationType ? titleCase(result.consultationType) : a.treatment,
              consultationType: result.consultationType || a.consultationType,
              leadSource: result.leadSource,
              message: result.message,
              scheduleMode: result.scheduleMode,
            }
          : a,
      ),
    );
  }

  return (
    <section
      className="flex min-w-0 flex-1 flex-col"
      // Cap at the calendar height (align bottoms + scroll long lists) but let a
      // short list shrink the bordered table down to header + its rows.
      style={height ? { maxHeight: height } : undefined}
    >
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 pb-[28px]">
        <h2 className="font-inter text-[23.333px] font-semibold leading-[32.667px] text-[#1e1e24]">
          Today&apos;s Appointments
        </h2>
        <div className="flex items-center gap-[14px]">
          <div className="relative">
            <Image
              src="/dashboard/search.svg"
              alt=""
              width={24}
              height={24}
              className="pointer-events-none absolute left-[16px] top-1/2 size-6 -translate-y-1/2"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search here"
              aria-label="Search today's appointments"
              className="h-[45px] w-[195px] rounded-full border-[1.167px] border-[#c2c6d4] pl-[50px] pr-[10px] font-inter text-[16.333px] text-[#1e1e24] outline-none placeholder:text-[#c2c6d4] focus:border-[#0077c0]"
            />
          </div>
          <StatusFilter value={status} onChange={setStatus} />
        </div>
      </div>

      {/* Bordered table — height hugs its content, capped by the section max */}
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-[18.667px] border-[1.2px] border-[#c2c6d4] bg-white shadow-[0px_1.167px_2.333px_0px_rgba(0,0,0,0.05)]">
        {/* Header row */}
        <div className="grid shrink-0 grid-cols-[197fr_123fr_114fr_119fr_75fr] border-b-[1.167px] border-[#c2c6d4] px-[18.667px]">
          {["Patient Name", "Doctor", "Time", "Status", "Action"].map((h, i) => (
            <span
              key={h}
              className={`py-[18.667px] font-inter text-[14px] font-medium uppercase leading-[18.667px] tracking-[0.35px] text-[#1e1e24] ${
                i === 4 ? "text-right" : ""
              } ${i === 1 ? "-ml-[15px]" : ""}`}
            >
              {h}
            </span>
          ))}
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <p className="px-[18.667px] py-8 font-inter text-[16px] text-[#94a3b8]">
              No appointments match your filters.
            </p>
          ) : (
            rows.map((a) => <Row key={a.id} appt={a} onEdit={() => setEditing(a)} />)
          )}
        </div>
      </div>

      {editing && (
        <NewAppointmentModal
          edit={toEdit(editing)}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function Row({ appt, onEdit }: { appt: DashboardAppointment; onEdit: () => void }) {
  const ongoing = appt.status === "On going";
  const nameColor = ongoing ? "text-[#0077c0]" : "text-[#1e1e24]";
  const treatmentColor = ongoing
    ? "text-[#0077c0]"
    : appt.status === "Completed"
      ? "text-[#1e1e24]"
      : "text-[#94a3b8]";
  const cellColor = ongoing ? "text-[#0077c0]" : "text-[#1e1e24]";

  return (
    <div className="grid grid-cols-[197fr_123fr_114fr_119fr_75fr] items-center border-t-[1.167px] border-[#c2c6d4] px-[18.667px]">
      {/* Patient */}
      <div className="py-[18.667px] pr-2">
        <p className={`font-inter text-[16.333px] font-medium leading-[23.333px] ${nameColor}`}>
          {appt.patientName}
        </p>
        <p className={`font-inter text-[14px] leading-[18.667px] ${treatmentColor}`}>
          {appt.treatment}
        </p>
      </div>
      {/* Doctor */}
      <span className={`-ml-[15px] font-inter text-[16.333px] font-medium leading-[23.333px] ${cellColor}`}>
        {appt.doctor}
      </span>
      {/* Time */}
      <span className={`font-inter text-[16.333px] font-medium leading-[23.333px] ${cellColor}`}>
        {appt.startTime} -<br />
        {appt.endTime}
      </span>
      {/* Status */}
      <div>
        <span
          className={`inline-flex rounded-full px-[14px] py-[4px] font-inter text-[14px] font-medium leading-[18.667px] ${STATUS_BADGE[appt.status]}`}
        >
          {appt.status}
        </span>
      </div>
      {/* Action */}
      <div className="flex justify-end">
        <button type="button" onClick={onEdit} aria-label={`Edit ${appt.patientName}'s appointment`}>
          <Image
            src={ongoing ? "/dashboard/edit_square_blue.svg" : "/dashboard/edit_square.svg"}
            alt=""
            width={24}
            height={24}
            className="size-6"
          />
        </button>
      </div>
    </div>
  );
}

function StatusFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useExclusiveDropdown();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [setOpen]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-[45px] items-center gap-1 rounded-full border-[1.167px] border-[#c2c6d4] px-[16.167px] transition-colors hover:border-[#0077c0]"
      >
        <span className="whitespace-nowrap font-inter text-[16.333px] font-medium leading-[23.333px] text-[#1e1e24]">
          {value}
        </span>
        <Image
          src="/dashboard/chevron_dark.svg"
          alt=""
          width={24}
          height={24}
          className={`size-6 transition-transform ${open ? "rotate-90" : "-rotate-90"}`}
        />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-30 flex w-[203px] flex-col gap-[5px] rounded-[15px] border border-[#c2c6d4] bg-white p-[17px] drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          {STATUS_FILTER_OPTIONS.map((opt) => {
            const style = STATUS_OPTION[opt];
            const selected = opt === value;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-[8px] px-[16px] py-[10px] ${style.row} ${style.text}`}
              >
                <span className="font-manrope text-[14px] font-semibold leading-[20px]">
                  {opt}
                </span>
                {selected && <CheckSmall className="size-6" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
