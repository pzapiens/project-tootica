"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import { apiFetch, type AppointmentListItem } from "@/lib/api";
import { useAppointmentsRevision } from "@/lib/appointmentsBus";
import { useExclusiveDropdown } from "@/lib/useExclusiveDropdown";

import { type Time } from "./AppointmentFormStep";
import NewAppointmentModal, { type EditAppointment } from "./NewAppointmentModal";
import {
  STATUS_FILTER_OPTIONS,
  type AppointmentStatus,
  type DashboardAppointment,
} from "./mock";

/** Rows shown per page in the appointments table. */
const PAGE_SIZE = 20;

const p2 = (n: number) => String(n).padStart(2, "0");

/** ISO datetime → "09:00 AM" (local). */
function fmtClock(iso: string): string {
  const d = new Date(iso);
  const period = d.getHours() >= 12 ? "PM" : "AM";
  const h = d.getHours() % 12 || 12;
  return `${p2(h)}:${p2(d.getMinutes())} ${period}`;
}

/** ISO date → "dd/mm/yyyy" (UTC, since dates are stored at UTC midnight). */
function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** ISO datetime → local "dd/mm/yyyy" (matches the local clock the row shows). */
function fmtLocalDmy(iso: string): string {
  const d = new Date(iso);
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "dd/mm/yyyy" → "dd MMM yyyy" (e.g. "12 Aug 2026") for the table's cell. */
function fmtDateLabel(dmy: string): string {
  const [d, m, y] = dmy.split("/");
  const month = MONTHS_SHORT[Number(m) - 1];
  return month ? `${d} ${month} ${y}` : dmy;
}

/** Map the backend appointment status enum onto the table's display statuses. */
const STATUS_MAP: Record<AppointmentListItem["status"], AppointmentStatus> = {
  SCHEDULED: "Upcoming",
  CONFIRMED: "Upcoming",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "Cancelled",
};

/**
 * The display status filter maps to zero-or-more real backend statuses:
 *   - "all"  → no status filter (every appointment)
 *   - "none" → no backend equivalent (e.g. "On going") → show nothing
 *   - list   → filter to those statuses server-side
 */
function backendStatusesFor(
  filter: string,
): "all" | "none" | Array<AppointmentListItem["status"]> {
  switch (filter) {
    case "All status":
      return "all";
    case "Upcoming":
      return ["SCHEDULED", "CONFIRMED"];
    case "Completed":
      return ["COMPLETED"];
    case "Cancelled":
      return ["CANCELLED", "NO_SHOW"];
    default:
      // "On going" / "Rescheduled" aren't modelled in the backend.
      return "none";
  }
}

/** Build the `/appointments` query for the active status filter within the given
 *  day window, or null when the selected status has no backend equivalent (→
 *  render an empty list). */
function buildAppointmentsQuery(
  filter: string,
  range: { from: Date; to: Date },
): string | null {
  const statuses = backendStatusesFor(filter);
  if (statuses === "none") return null;

  const sp = new URLSearchParams();
  if (statuses !== "all") statuses.forEach((s) => sp.append("status", s));
  sp.append("from", range.from.toISOString());
  sp.append("to", range.to.toISOString());
  sp.append("limit", "100");
  return `/appointments?${sp.toString()}`;
}

/** Flatten an API appointment into the shape the table + edit form consume. */
function toDashboardAppointment(item: AppointmentListItem): DashboardAppointment {
  // Zero-duration (start == end) means no time was picked → show "--".
  const noTime = item.startTime === item.endTime;
  // Prefer the structured consultation type for the treatment column; fall back
  // to notes for older appointments created before the field existed.
  const treatment = item.consultationType?.trim()
    ? titleCase(item.consultationType.trim())
    : item.notes?.trim() || "Consultation";
  return {
    id: item.id,
    patientName: item.patient.name,
    treatment,
    doctor: item.doctor.name ? `Dr. ${item.doctor.name}` : "Unassigned",
    startTime: noTime ? "--" : fmtClock(item.startTime),
    endTime: noTime ? "--" : fmtClock(item.endTime),
    status: STATUS_MAP[item.status],
    date: fmtLocalDmy(item.startTime),
    dob: fmtDate(item.patient.dob),
    gender: item.patient.gender ?? "",
    phone: item.patient.phone ?? "",
    email: item.patient.email ?? "",
    consultationType: item.consultationType ?? "",
    leadSource: item.sourceOfEnquiry ?? "",
    message: item.notes ?? "",
    scheduleMode: "datetime",
  };
}

/** "09:00 AM" → { h: "09", m: "00", p: "AM" } for the appointment form. */
function parseTime(s: string): Time {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(s.trim());
  if (!m) return { h: "", m: "", p: "AM" };
  return { h: m[1].padStart(2, "0"), m: m[2], p: m[3].toUpperCase() as "AM" | "PM" };
}

/** "TEETH WHITENING" → "Teeth Whitening" for the table's treatment column. */
function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Build the Edit Appointment prefill from an appointment row. */
function toEdit(a: DashboardAppointment): EditAppointment {
  return {
    id: a.id,
    patient: { name: a.patientName, dob: a.dob, gender: a.gender, phone: a.phone, email: a.email },
    initial: {
      // Stored as one joined string; split back into the multi-select values
      // (empty → no selection, so a fresh pick actually replaces it).
      consultation: a.consultationType ? a.consultationType.split(", ") : [],
      leadSource: a.leadSource,
      message: a.message,
      mode: a.scheduleMode,
      date: a.date,
      from: parseTime(a.startTime),
      to: parseTime(a.endTime),
      // The table shows "Dr. Smith"; the form's doctor options are raw names
      // ("Smith"), so strip the honorific for the prefill to match/resolve.
      doctor: a.doctor === "Unassigned" ? "" : a.doctor.replace(/^Dr\.?\s*/i, ""),
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
 * Appointments table (Figma "TA" + "TA Table"). Shows TODAY's appointments by
 * default: the day window + the status filter are pushed to the server as query
 * params (`/api/appointments?from=…&to=…&status=…`), so filtering reflects the
 * whole dataset — not just a client-side slice. The free-text search stays
 * client-side over the fetched rows, which are paginated (20/page) and ordered
 * newest-first by start time. The table is independent of the top timeframe
 * filter and the mini calendar.
 *
 * When `height` is provided (desktop), the section is fixed to that height so it
 * aligns with the calendar's bottom, and the table body scrolls if the rows
 * overflow.
 */
export default function AppointmentsTable({
  height,
  heading,
  status,
  onStatusChange,
}: {
  height?: number;
  /** Section heading (default, or a reviewed stat card's metric). */
  heading: string;
  /** Active status filter (controlled — lifted so stat cards can drive it). */
  status: string;
  onStatusChange: (status: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<AppointmentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DashboardAppointment | null>(null);
  const [page, setPage] = useState(1);

  // A selected status with no backend equivalent ("On going" / "Rescheduled")
  // has nothing to fetch — the list is simply empty.
  const isNoneFilter = backendStatusesFor(status) === "none";
  const rev = useAppointmentsRevision();

  // Today's local-day window [00:00, 23:59:59.999] — the table shows only today.
  const todayRange = useMemo(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { from, to };
  }, []);

  // Re-query the backend whenever the status filter changes.
  useEffect(() => {
    const path = buildAppointmentsQuery(status, todayRange);
    if (path === null) return; // handled by isNoneFilter in render
    let active = true;
    apiFetch<AppointmentListItem[]>(path)
      .then((list) => {
        if (active) setItems(list);
      })
      .catch(() => {
        if (active) setItems([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [status, todayRange, rev]);

  // Order by start time, newest first. Then map to the display shape and apply
  // the client-side search.
  const rows = useMemo(() => {
    if (isNoneFilter) return [];
    const ordered = [...items].sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
    );
    const q = query.trim().toLowerCase();
    return ordered
      .map(toDashboardAppointment)
      .filter(
        (a) =>
          !q ||
          [a.patientName, a.treatment, a.doctor].some((f) => f.toLowerCase().includes(q)),
      );
  }, [items, query, isNoneFilter]);

  // Paginate the filtered rows, 20 per page. `page` is clamped here (rather than
  // reset via an effect) so a shrinking list — e.g. after a status/search change
  // that leaves fewer pages — always lands on a valid page.
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = useMemo(
    () => rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [rows, safePage],
  );
  const firstRow = rows.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(safePage * PAGE_SIZE, rows.length);

  return (
    <section
      className="flex min-w-0 flex-1 flex-col"
      // Cap at the calendar height (align bottoms + scroll long lists) but let a
      // short list shrink the bordered table down to header + its rows.
      style={height ? { maxHeight: height } : undefined}
    >
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 pb-[28px]">
        <div className="flex items-center gap-3">
          <h2 className="font-inter text-[23.333px] font-semibold leading-[32.667px] text-[#1e1e24]">
            {heading}
          </h2>
        </div>
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
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search here"
              aria-label="Search appointments"
              className="h-[45px] w-[195px] rounded-full border-[1.167px] border-[#c2c6d4] pl-[50px] pr-[10px] font-inter text-[16.333px] text-[#1e1e24] outline-none placeholder:text-[#c2c6d4] focus:border-[#0077c0]"
            />
          </div>
          <StatusFilter
            value={status}
            onChange={(v) => {
              setPage(1);
              onStatusChange(v);
            }}
          />
        </div>
      </div>

      {/* Bordered table — height hugs its content, capped by the section max */}
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-[18.667px] border-[1.2px] border-[#c2c6d4] bg-white shadow-[0px_1.167px_2.333px_0px_rgba(0,0,0,0.05)]">
        {/* Header row */}
        <div className="grid shrink-0 grid-cols-[197fr_123fr_114fr_119fr_75fr] border-b-[1.167px] border-[#c2c6d4] px-[18.667px]">
          {["Patient Name", "Doctor", "Date & Time", "Status", "Action"].map((h, i) => (
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
          {loading ? (
            <p className="px-[18.667px] py-8 font-inter text-[16px] text-[#94a3b8]">
              Loading appointments…
            </p>
          ) : rows.length === 0 ? (
            <p className="px-[18.667px] py-8 font-inter text-[16px] text-[#94a3b8]">
              {query.trim() && items.length > 0 && !isNoneFilter
                ? "No appointments match your search."
                : isNoneFilter || status !== STATUS_FILTER_OPTIONS[0]
                  ? "No appointments today for this filter."
                  : "No appointments today."}
            </p>
          ) : (
            pageRows.map((a) => <Row key={a.id} appt={a} onEdit={() => setEditing(a)} />)
          )}
        </div>
      </div>

      {/* Pagination — only when the filtered list spans more than one page. */}
      {!loading && rows.length > 0 && pageCount > 1 && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 pt-[18px]">
          <span className="font-inter text-[14px] leading-[18.667px] text-[#727783]">
            Showing {firstRow}–{lastRow} of {rows.length}
          </span>
          <div className="flex items-center gap-[10px]">
            <PageButton disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>
              Prev
            </PageButton>
            <span className="font-inter text-[14px] font-medium leading-[18.667px] text-[#1e1e24]">
              Page {safePage} of {pageCount}
            </span>
            <PageButton
              disabled={safePage === pageCount}
              onClick={() => setPage(safePage + 1)}
            >
              Next
            </PageButton>
          </div>
        </div>
      )}

      {editing && (
        <NewAppointmentModal edit={toEdit(editing)} onClose={() => setEditing(null)} />
      )}
    </section>
  );
}

/** A Prev/Next control for the appointments pagination bar. */
function PageButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-full border-[1.167px] border-[#c2c6d4] px-[16px] py-[7px] font-inter text-[14px] font-medium text-[#1e1e24] transition-colors hover:border-[#0077c0] hover:text-[#0077c0] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#c2c6d4] disabled:hover:text-[#1e1e24]"
    >
      {children}
    </button>
  );
}

function Row({ appt, onEdit }: { appt: DashboardAppointment; onEdit: () => void }) {
  const ongoing = appt.status === "On going";
  const nameColor = ongoing ? "text-[#0077c0]" : "text-[#1e1e24]";
  const cellColor = ongoing ? "text-[#0077c0]" : "text-[#1e1e24]";

  return (
    <div className="grid grid-cols-[197fr_123fr_114fr_119fr_75fr] items-center border-t-[1.167px] border-[#c2c6d4] px-[18.667px]">
      {/* Patient */}
      <div className="py-[18.667px] pr-2">
        <p className={`font-inter text-[16.333px] font-medium leading-[23.333px] ${nameColor}`}>
          {appt.patientName}
        </p>
      </div>
      {/* Doctor */}
      <span className={`-ml-[15px] font-inter text-[16.333px] font-medium leading-[23.333px] ${cellColor}`}>
        {appt.doctor}
      </span>
      {/* Date & Time */}
      <div className={`flex flex-col gap-[6px] font-inter text-[12px] font-semibold leading-[15px] ${cellColor}`}>
        <span>{fmtDateLabel(appt.date)}</span>
        <span className="opacity-80">
          {appt.startTime === "--" ? "--" : `${appt.startTime} - ${appt.endTime}`}
        </span>
      </div>
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
