"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { apiFetch, type AppointmentListItem, type AppointmentStatus, type BookingChannel } from "@/lib/api";
import { analyticsRangeQuery } from "@/lib/analytics";
import { useAppointmentsRevision, notifyAppointmentsChanged } from "@/lib/appointmentsBus";
import { bookingChannelLabel } from "@/lib/whatsapp";
import { statusBadgeClass } from "@/lib/statusColors";
import { useExclusiveDropdown } from "@/lib/useExclusiveDropdown";

import NewAppointmentModal, { type EditAppointment } from "../dashboard/NewAppointmentModal";
import { CONSULTATION_TYPES, type Time } from "../dashboard/AppointmentFormStep";
import { type Timeframe } from "../dashboard/mock";
import TimeframeFilter from "../dashboard/TimeframeFilter";
import AppointmentFilterPanel, {
  EMPTY_FILTERS,
  filterCount,
  STATUS_CHIPS,
  type AppointmentFilters,
  type FilterOption,
} from "./AppointmentFilterPanel";
import AppointmentConfirmDialog, { type ConfirmVariant } from "./AppointmentConfirmDialog";
import CancelAppointmentDialog from "./CancelAppointmentDialog";
import AppointmentInfoDialog from "./AppointmentInfoDialog";
import AppointmentCallDialog from "./AppointmentCallDialog";
import AppointmentChatDialog from "./AppointmentChatDialog";
import AppointmentWhatsAppDialog from "./AppointmentWhatsAppDialog";
import AppointmentNotifyDialog from "./AppointmentNotifyDialog";
import PaymentManagementDialog from "./PaymentManagementDialog";
import PatientRecordsView from "./PatientRecordsView";

const PER_PAGE_OPTIONS = [10, 20, 50, 100];

const p2 = (n: number) => String(n).padStart(2, "0");

/** ISO datetime → "09:00 AM" (local). */
function fmtClock(iso: string): string {
  const d = new Date(iso);
  const period = d.getHours() >= 12 ? "PM" : "AM";
  const h = d.getHours() % 12 || 12;
  return `${p2(h)}:${p2(d.getMinutes())} ${period}`;
}

/** ISO date → "dd/mm/yyyy" (UTC — dobs are stored at UTC midnight). */
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

/** ISO datetime → short "dd/mm/yy" for the Date & Time cell. */
function fmtShortDate(iso: string): string {
  const d = new Date(iso);
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)}`;
}

/** Whole years between `dob` and today; null when no/invalid DOB. */
function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age >= 0 && age < 200 ? age : null;
}

/** "TEETH WHITENING" → "Teeth Whitening". */
function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** "09:00 AM" → { h, m, p } for the appointment form. */
function parseTime(s: string): Time {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(s.trim());
  if (!m) return { h: "", m: "", p: "AM" };
  return { h: m[1].padStart(2, "0"), m: m[2], p: m[3].toUpperCase() as "AM" | "PM" };
}

/**
 * Map each backend status onto its display badge label. A newly-booked
 * (`SCHEDULED`) appointment reads as **Pending** — awaiting the clinic's
 * accept/reject; accepting it (`CONFIRMED`) makes it **Upcoming**.
 */
const STATUS_LABEL: Record<AppointmentStatus, string> = {
  SCHEDULED: "Pending",
  CONFIRMED: "Upcoming",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No Show",
};

/** The appointment-form status labels (used for the Edit prefill). Both SCHEDULED
 *  (an accepted-but-timeless WhatsApp booking) and CONFIRMED read as "Upcoming" —
 *  the single active state the form offers. */
const FORM_STATUS: Record<AppointmentStatus, string> = {
  SCHEDULED: "Upcoming",
  CONFIRMED: "Upcoming",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No Show",
};

/** Which backend statuses each status chip selects (empty = no equivalent). */
const CHIP_STATUSES: Record<string, AppointmentStatus[]> = {
  Pending: ["SCHEDULED"],
  Upcoming: ["CONFIRMED"],
  "On going": [],
  Completed: ["COMPLETED"],
  Cancelled: ["CANCELLED"],
  "No Show": ["NO_SHOW"],
};

/** A flattened appointment row: display fields + the raw bits an edit needs. */
interface AppointmentRow {
  id: string;
  code: string;
  patientName: string;
  consultationType: string;
  /** The raw consultation values (upper-case), split from the joined string. */
  consultationTypes: string[];
  doctor: string;
  doctorId: string;
  rawStatus: AppointmentStatus;
  statusLabel: string;
  date: string;
  timeRange: string;
  noTime: boolean;
  age: number | null;
  gender: string;
  /** How the booking came in — WEB / WHATSAPP (drives the Booking Channel filter). */
  bookingChannel: BookingChannel;
  /** Payment summary for the row's status glyph. */
  paymentCount: number;
  paymentComplete: boolean;
  startTime: string;
  // Extra fields carried for the Edit Appointment prefill.
  dob: string;
  phone: string;
  email: string;
  message: string;
}

function toRow(item: AppointmentListItem): AppointmentRow {
  const noTime = item.startTime === item.endTime;
  const rawConsult = item.consultationType?.trim() ?? "";
  // Show only the consultation type(s) chosen in the create-appointment form;
  // no dummy fallback to notes / "Consultation" when none was set.
  const consultation = rawConsult ? titleCase(rawConsult) : "--";
  // Split the joined ("A, B") consultation string into its canonical values.
  const consultationTypes = rawConsult
    ? rawConsult.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean)
    : [];
  return {
    id: item.id,
    code: item.code ?? "—",
    patientName: item.patient.name,
    consultationType: consultation,
    consultationTypes,
    doctor: item.doctor.name ? `Dr. ${item.doctor.name}` : "Unassigned",
    doctorId: item.doctor.id ?? "",
    rawStatus: item.status,
    statusLabel: STATUS_LABEL[item.status],
    date: noTime ? fmtLocalDmy(item.startTime) : fmtShortDate(item.startTime),
    timeRange: noTime ? "--" : `${fmtClock(item.startTime)} - ${fmtClock(item.endTime)}`,
    noTime,
    age: ageFromDob(item.patient.dob),
    gender: item.patient.gender ?? "",
    bookingChannel: item.bookingChannel,
    paymentCount: item.paymentCount,
    paymentComplete: item.paymentComplete,
    startTime: item.startTime,
    dob: fmtDate(item.patient.dob),
    phone: item.patient.phone ?? "",
    email: item.patient.email ?? "",
    message: item.notes ?? "",
  };
}

/** Build the Edit Appointment prefill from a row (mirrors the dashboard table). */
function toEdit(item: AppointmentListItem, r: AppointmentRow): EditAppointment {
  return {
    id: r.id,
    patient: { name: r.patientName, dob: r.dob, gender: r.gender, phone: r.phone, email: r.email },
    initial: {
      consultation: item.consultationType ? item.consultationType.split(", ") : [],
      leadSource: item.sourceOfEnquiry ?? "",
      message: r.message,
      mode: "datetime",
      date: fmtLocalDmy(item.startTime),
      from: r.noTime ? { h: "", m: "", p: "AM" } : parseTime(fmtClock(item.startTime)),
      to: r.noTime ? { h: "", m: "", p: "AM" } : parseTime(fmtClock(item.endTime)),
      doctor: r.doctor === "Unassigned" ? "" : r.doctor.replace(/^Dr\.?\s*/i, ""),
      status: FORM_STATUS[item.status],
      bookingChannel: bookingChannelLabel(item.bookingChannel),
      // A time-less booking (e.g. accepted from WhatsApp) opens with "Skip time
      // & availability check" pre-ticked so it can be saved without a time.
      nonMandatory: r.noTime,
    },
  };
}

/** Build the visible page-number list, e.g. [1,2,3,"…",7]. */
function pageList(current: number, total: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: Array<number | "…"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push("…");
  out.push(total);
  return out;
}

/** Escape one CSV cell (wrap in quotes when it contains a comma/quote/newline). */
function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// `minmax(0,…fr)` (not bare `fr`) so a long cell value can't stretch its column
// past its share — otherwise body columns would grow wider than the header's and
// the two would stop lining up. Header + every row share this template. The
// Actions column keeps a fixed min-width so its icon buttons (payment glyph +
// edit + ⋮) always fit and never get clipped by the row's overflow-hidden.
const COLS =
  "grid-cols-[minmax(0,130fr)_minmax(0,185fr)_minmax(0,175fr)_minmax(0,150fr)_minmax(0,155fr)_minmax(0,150fr)_minmax(0,105fr)_minmax(160px,110fr)]";

/** The active row dialog (accept/reject/delete confirm, cancel, or info). */
type RowDialog =
  | { kind: "confirm"; variant: ConfirmVariant; row: AppointmentRow }
  | { kind: "cancel"; row: AppointmentRow }
  | { kind: "info"; row: AppointmentRow }
  | { kind: "call"; row: AppointmentRow }
  | { kind: "chat"; row: AppointmentRow }
  | { kind: "notify"; row: AppointmentRow }
  | { kind: "payments"; row: AppointmentRow };

export default function AppointmentsClient() {
  // Deep-link params: `?q=` pre-fills the search, `?status=` auto-applies a status
  // filter (from the dashboard stat cards, calendar "View Appointment", patients).
  const searchParams = useSearchParams();

  const [items, setItems] = useState<AppointmentListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [timeframe, setTimeframe] = useState<Timeframe>({ kind: "all" });
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [filters, setFilters] = useState<AppointmentFilters>(() => {
    const status = searchParams.get("status");
    return status && (STATUS_CHIPS as readonly string[]).includes(status)
      ? { ...EMPTY_FILTERS, statuses: [status] }
      : EMPTY_FILTERS;
  });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  const [filterOpen, setFilterOpen] = useState(false);
  // The patient whose "Patient Records" view is open (⋮ → Records), or null.
  const [records, setRecords] = useState<{ name: string; code: string; id: string } | null>(null);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AppointmentListItem | null>(null);
  const [dialog, setDialog] = useState<RowDialog | null>(null);

  const rev = useAppointmentsRevision();

  useEffect(() => {
    let active = true;
    const rangeQ = analyticsRangeQuery(timeframe);
    const path = `/appointments${rangeQ}${rangeQ ? "&" : "?"}limit=500`;
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
  }, [timeframe, rev]);

  // Keep the raw item alongside its display row so edit can read the original.
  const allRows = useMemo(
    () => items.map((item) => ({ item, row: toRow(item) })),
    [items],
  );

  // Distinct filter options derived from the fetched data.
  const doctorOptions = useMemo<FilterOption[]>(() => {
    const map = new Map<string, string>();
    for (const { row } of allRows) {
      if (row.doctorId && row.doctor !== "Unassigned") map.set(row.doctorId, row.doctor);
    }
    return [...map].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [allRows]);

  // The consultation-type filter offers the same canonical list used when
  // creating an appointment (not just the types already present in the data).
  const consultationOptions = useMemo<FilterOption[]>(
    () => CONSULTATION_TYPES.map((c) => ({ value: c, label: titleCase(c) })),
    [],
  );

  // The Booking Channel filter offers the two fixed channels (Web / WhatsApp),
  // matching the backend `bookingChannel` enum.
  const channelOptions = useMemo<FilterOption[]>(
    () => [
      { value: "WEB", label: "Web" },
      { value: "WHATSAPP", label: "WhatsApp" },
    ],
    [],
  );

  // Search → facet filters → sort.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");

    const chipStatuses = new Set(
      filters.statuses.flatMap((c) => CHIP_STATUSES[c] ?? []),
    );
    const doctorSet = new Set(filters.doctorIds);
    const consultationSet = new Set(filters.consultationTypes);
    const channelSet = new Set(filters.channels);

    let out = allRows.filter(({ row }) => {
      // Pending (SCHEDULED) bookings arrive via WhatsApp and live only in the
      // "WhatsApp Appointments" popup until they're accepted — never the main
      // table. Accepting flips them to CONFIRMED, at which point they appear here.
      if (row.rawStatus === "SCHEDULED") return false;
      if (q) {
        const phoneHit = qDigits.length > 0 && row.phone.replace(/\D/g, "").includes(qDigits);
        const textHit = [row.code, row.patientName, row.doctor, row.consultationType].some((f) =>
          f.toLowerCase().includes(q),
        );
        if (!textHit && !phoneHit) return false;
      }
      if (doctorSet.size > 0 && !doctorSet.has(row.doctorId)) return false;
      if (consultationSet.size > 0 && !row.consultationTypes.some((c) => consultationSet.has(c))) return false;
      if (channelSet.size > 0 && !channelSet.has(row.bookingChannel)) return false;
      if (filters.statuses.length > 0 && !chipStatuses.has(row.rawStatus)) return false;
      return true;
    });

    // Default order: newest start time first. Filters can override.
    out = [...out].sort((a, b) => {
      if (filters.idSort) {
        const cmp = a.row.code.localeCompare(b.row.code);
        return filters.idSort === "desc" ? -cmp : cmp;
      }
      const cmp = new Date(a.row.startTime).getTime() - new Date(b.row.startTime).getTime();
      // dateSort "oldest" = ascending; default + "newest" = descending.
      return filters.dateSort === "oldest" ? cmp : -cmp;
    });

    return out;
  }, [allRows, query, filters]);

  // Pending (SCHEDULED) bookings for the "WhatsApp Appointments" popup — the
  // rows deliberately excluded from the main table above, straight from the
  // backend (WhatsApp bookings arrive SCHEDULED). Newest first.
  const pendingRows = useMemo(
    () =>
      allRows
        .filter(({ row }) => row.rawStatus === "SCHEDULED")
        .map(({ row }) => row)
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()),
    [allRows],
  );

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, pageCount);
  const pageRows = useMemo(
    () => rows.slice((safePage - 1) * perPage, safePage * perPage),
    [rows, safePage, perPage],
  );
  const firstRow = total === 0 ? 0 : (safePage - 1) * perPage + 1;
  const lastRow = Math.min(safePage * perPage, total);

  function exportCsv() {
    const header = [
      "ID", "Patient Name", "Consultation Type", "Doctor", "Date", "Time", "Status", "Age", "Gender",
    ];
    const lines = rows.map(({ row }) =>
      [
        row.code === "—" ? "" : row.code,
        row.patientName,
        row.consultationType,
        row.doctor === "Unassigned" ? "" : row.doctor,
        row.date,
        row.noTime ? "" : row.timeRange,
        row.statusLabel,
        row.age === null ? "" : String(row.age),
        row.gender,
      ]
        .map(csvCell)
        .join(","),
    );
    const csv = [header.join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `appointments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // The Patient Records view replaces the whole content area (Figma "Appts8 -
  // Records"), reached from a row's ⋮ → Records.
  if (records) {
    return (
      <PatientRecordsView
        patientName={records.name}
        patientCode={records.code}
        patientId={records.id}
        onClose={() => setRecords(null)}
      />
    );
  }

  // The Apply Filter panel replaces the whole content area (Figma "Appts4 - Filter").
  if (filterOpen) {
    return (
      <AppointmentFilterPanel
        applied={filters}
        doctorOptions={doctorOptions}
        consultationOptions={consultationOptions}
        channelOptions={channelOptions}
        onApply={(f) => {
          setFilters(f);
          setPage(1);
        }}
        onClose={() => setFilterOpen(false)}
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-[24px]">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-[16px]">
        <h1 className="flex-1 font-manrope text-[35px] font-bold leading-[44px] tracking-[-0.7px] text-[#1e1e24]">
          Appointments
        </h1>
        <TimeframeFilter timeframe={timeframe} onChange={(t) => { setTimeframe(t); setPage(1); }} />
        <IconButton
          label="WhatsApp appointments"
          tip="Whatsapp appointments"
          onClick={() => setWhatsappOpen(true)}
          icon="/dashboard/whatsapp.svg"
          badge={pendingRows.length}
        />
        <IconButton
          label="Filter appointments"
          tip="Filter"
          onClick={() => setFilterOpen(true)}
          icon="/dashboard/filter_alt.svg"
          badge={filterCount(filters)}
        />
        <IconButton label="Export appointments to CSV" tip="Export" onClick={exportCsv} icon="/dashboard/download.svg" />
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex h-[54px] items-center gap-[10px] rounded-[50px] bg-[#0077c0] px-[26px] font-inter text-[15px] font-semibold uppercase tracking-[0.5px] text-white transition-colors hover:bg-[#0069a8]"
        >
          <Image src="/dashboard/add.svg" alt="" width={22} height={22} className="size-[22px] [filter:brightness(0)_invert(1)]" />
          New Appointment
        </button>
      </div>

      {/* Search + reload + count */}
      <div className="flex shrink-0 items-center gap-[16px]">
        <div className="relative flex-1">
          <Image
            src="/dashboard/search.svg"
            alt=""
            width={24}
            height={24}
            className="pointer-events-none absolute left-[22px] top-1/2 size-6 -translate-y-1/2"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search by id, patient, doctor, consultation..."
            aria-label="Search appointments"
            className="h-[54px] w-full rounded-[27px] border-[1.2px] border-[#c2c6d4] pl-[58px] pr-[20px] font-inter text-[16px] text-[#1e1e24] outline-none placeholder:text-[#94a3b8] focus:border-[#0077c0]"
          />
        </div>
        <p className="shrink-0 font-inter text-[19px] leading-[28px] text-[#1e1e24]">
          Counts : <span className="font-bold">{loading ? "—" : total}</span>
        </p>
      </div>

      {/* Table */}
      <div className="flex flex-col overflow-hidden rounded-[28px] border-[1.2px] border-[#c2c6d4] bg-white">
        {/* Header row */}
        <div className={`grid shrink-0 ${COLS} items-center border-b-[1.2px] border-[rgba(194,198,212,0.5)]`}>
          {["ID", "Patient Name", "Consultation Type", "Doctor", "Date & Time", "Status", "Age / Gender", "Actions"].map(
            (h) => (
              <span
                key={h}
                // The Actions cell's content is padded to px-[16px] (tighter, to
                // fit its icon buttons), so its header matches that start.
                className={`py-[24px] text-left font-inter text-[13px] font-semibold uppercase leading-[17px] tracking-[0.5px] text-[#727783] ${
                  h === "Actions" ? "px-[16px]" : "px-[20px]"
                }`}
              >
                {h}
              </span>
            ),
          )}
        </div>

        {/* Body */}
        <div>
          {loading ? (
            <p className="px-[20px] py-10 font-inter text-[16px] text-[#94a3b8]">Loading appointments…</p>
          ) : total === 0 ? (
            <p className="px-[20px] py-10 font-inter text-[16px] text-[#94a3b8]">
              {query.trim() || filterCount(filters) > 0
                ? "No appointments match your search."
                : "No appointments yet."}
            </p>
          ) : (
            pageRows.map(({ item, row }) => (
              <AppointmentRowView
                key={row.id}
                row={row}
                onEdit={() => setEditing(item)}
                onRecords={() =>
                  setRecords({ name: row.patientName, code: item.patient.code ?? "—", id: item.patient.id })
                }
                onAccept={() => setDialog({ kind: "confirm", variant: "accept", row })}
                onReject={() => setDialog({ kind: "confirm", variant: "reject", row })}
                onCancel={() => setDialog({ kind: "cancel", row })}
                onDelete={() => setDialog({ kind: "confirm", variant: "delete", row })}
                onInfo={() => setDialog({ kind: "info", row })}
                onCall={() => setDialog({ kind: "call", row })}
                onChat={() => setDialog({ kind: "chat", row })}
                onNotify={() => setDialog({ kind: "notify", row })}
                onPayments={() => setDialog({ kind: "payments", row })}
              />
            ))
          )}
        </div>
      </div>

      {/* Footer — mt-auto pins it to the page bottom when the table is too
          short to scroll; when the table overflows it just follows the rows. */}
      {!loading && total > 0 && (
        <div className="mt-auto flex shrink-0 flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-[24px]">
            <span className="font-inter text-[15px] leading-[22px] text-[#1e1e24]">
              Showing {firstRow}-{lastRow} of {total} records
            </span>
            <div className="flex items-center gap-[10px]">
              <span className="font-inter text-[12px] font-semibold uppercase tracking-[0.6px] text-[#727783]">
                Show:
              </span>
              <PerPageDropdown
                value={perPage}
                onChange={(n) => {
                  setPerPage(n);
                  setPage(1);
                }}
              />
            </div>
          </div>
          <Pagination current={safePage} total={pageCount} onChange={setPage} />
        </div>
      )}

      {creating && (
        <NewAppointmentModal
          onClose={() => {
            setCreating(false);
            notifyAppointmentsChanged();
          }}
        />
      )}
      {editing && (
        <NewAppointmentModal
          edit={toEdit(editing, toRow(editing))}
          onClose={() => {
            setEditing(null);
            notifyAppointmentsChanged();
          }}
        />
      )}

      {whatsappOpen && (
        <AppointmentWhatsAppDialog
          rows={pendingRows}
          onClose={() => setWhatsappOpen(false)}
          onAccept={(row) =>
            setDialog({ kind: "confirm", variant: "accept", row: row as AppointmentRow })
          }
          onReject={(row) =>
            setDialog({ kind: "confirm", variant: "reject", row: row as AppointmentRow })
          }
        />
      )}

      {dialog?.kind === "confirm" && (
        <AppointmentConfirmDialog
          variant={dialog.variant}
          appointmentId={dialog.row.id}
          patientName={dialog.row.patientName}
          appointmentCode={dialog.row.code}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            notifyAppointmentsChanged();
          }}
        />
      )}
      {dialog?.kind === "cancel" && (
        <CancelAppointmentDialog
          appointmentId={dialog.row.id}
          patientName={dialog.row.patientName}
          patientCode={dialog.row.code}
          existingNotes={dialog.row.message}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            notifyAppointmentsChanged();
          }}
        />
      )}
      {dialog?.kind === "info" && (
        <AppointmentInfoDialog
          patientName={dialog.row.patientName}
          patientCode={dialog.row.code}
          message={dialog.row.message}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "call" && (
        <AppointmentCallDialog
          patientName={dialog.row.patientName}
          patientCode={dialog.row.code}
          phone={dialog.row.phone}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "chat" && (
        <AppointmentChatDialog
          patientName={dialog.row.patientName}
          patientCode={dialog.row.code}
          phone={dialog.row.phone}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "notify" && (
        <AppointmentNotifyDialog
          patientName={dialog.row.patientName}
          appointmentCode={dialog.row.code}
          onConfirm={() => setDialog(null)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "payments" && (
        <PaymentManagementDialog
          appointmentId={dialog.row.id}
          patientName={dialog.row.patientName}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

/** Circular outlined icon button used in the header (Filter / Export). */
function IconButton({
  label,
  tip,
  onClick,
  icon,
  badge = 0,
}: {
  label: string;
  /** Short hover-tooltip text (falls back to `label`). */
  tip?: string;
  onClick: () => void;
  icon: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      aria-label={badge > 0 ? `${label} (${badge} active)` : label}
      onClick={onClick}
      className="group relative flex size-[54px] items-center justify-center rounded-full border-[1.4px] border-[#c2c6d4] transition-colors hover:border-[#0077c0]"
    >
      <Image src={icon} alt="" width={28} height={28} className="size-7" />
      {badge > 0 && (
        <span className="absolute -right-[2px] -top-[2px] flex size-[22px] items-center justify-center rounded-full border-2 border-white bg-[#0077c0] font-inter text-[12px] font-semibold leading-none text-white">
          {badge}
        </span>
      )}
      <Tip label={tip ?? label} below />
    </button>
  );
}

/** Small dark hover tooltip shown above (or below) an icon button; the parent
 *  button needs `group relative`. */
function Tip({ label, below }: { label: string; below?: boolean }) {
  return (
    <span
      role="tooltip"
      className={`pointer-events-none absolute left-1/2 z-[120] -translate-x-1/2 whitespace-nowrap rounded-[6px] bg-[#1e1e24] px-[8px] py-[4px] font-inter text-[12px] font-medium leading-[16px] text-white opacity-0 shadow-[0px_4px_12px_rgba(0,0,0,0.15)] transition-opacity duration-150 group-hover:opacity-100 ${
        below ? "top-[calc(100%+6px)]" : "bottom-[calc(100%+6px)]"
      }`}
    >
      {label}
    </span>
  );
}

function AppointmentRowView({
  row,
  onEdit,
  onRecords,
  onAccept,
  onReject,
  onCancel,
  onDelete,
  onInfo,
  onCall,
  onChat,
  onNotify,
  onPayments,
}: {
  row: AppointmentRow;
  onEdit: () => void;
  onRecords: () => void;
  onAccept: () => void;
  onReject: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onInfo: () => void;
  onCall: () => void;
  onChat: () => void;
  onNotify: () => void;
  onPayments: () => void;
}) {
  const ongoing = row.statusLabel === "On going";
  const textColor = ongoing ? "text-[#0077c0]" : "text-[#1e1e24]";
  // A newly-booked (Pending) appointment awaits accept/reject; every other
  // status offers the edit + overflow-menu actions.
  const pending = row.rawStatus === "SCHEDULED";
  // Payment status glyph: shown once a payment has been added for this
  // appointment — an amber hourglass (pending) that becomes a green tick once
  // "Mark as complete" is ticked in the Payment Management dialog. Driven by the
  // per-row summary from the appointments list (paymentCount / paymentComplete).
  const hasPayment = row.paymentCount > 0;
  const paymentComplete = row.paymentComplete;

  return (
    <div className={`grid ${COLS} items-center border-b-[1.2px] border-[rgba(194,198,212,0.5)] last:border-b-0`}>
      {/* ID */}
      <span className={`px-[20px] py-[22px] font-inter text-[15px] font-medium leading-[21px] ${textColor}`}>
        {row.code}
      </span>
      {/* Patient Name */}
      <span className={`px-[20px] py-[22px] font-inter text-[15px] font-medium leading-[21px] ${textColor}`}>
        {row.patientName}
      </span>
      {/* Consultation Type */}
      <span className={`px-[20px] py-[22px] font-inter text-[14px] font-medium leading-[20px] ${textColor}`}>
        {row.consultationType}
      </span>
      {/* Doctor */}
      <span className={`px-[20px] py-[22px] font-inter text-[14px] font-medium leading-[20px] ${textColor}`}>
        {row.doctor === "Unassigned" ? "--" : row.doctor}
      </span>
      {/* Date & Time */}
      <div className={`flex flex-col gap-[3px] px-[20px] py-[22px] font-inter text-[13px] font-medium leading-[18px] ${textColor}`}>
        <span>{row.date}</span>
        <span className="opacity-80">{row.timeRange}</span>
      </div>
      {/* Status */}
      <div className="flex items-center gap-[6px] px-[20px] py-[22px]">
        <span
          className={`inline-flex rounded-full px-[12px] py-[4px] font-inter text-[13px] font-medium leading-[18px] ${statusBadgeClass(
            row.statusLabel,
          )}`}
        >
          {row.statusLabel}
        </span>
      </div>
      {/* Age / Gender */}
      <span className={`px-[20px] py-[22px] font-inter text-[14px] font-medium leading-[20px] ${textColor}`}>
        {row.age === null ? "--" : row.age} / {row.gender || "--"}
      </span>
      {/* Actions — Pending shows Accept/Reject; otherwise Edit + overflow menu.
          A payment-status glyph leads the group once a payment exists. */}
      <div className="flex items-center justify-start gap-[8px] px-[16px] py-[22px]">
        {/* The glyph slot is always reserved (fixed size) so the row layout is
            identical with or without a payment — the icon never shifts the
            other columns; only its visibility toggles. */}
        <span className="group relative flex size-[34px] shrink-0 items-center justify-center">
          {hasPayment && (
            <>
              <Image
                src={paymentComplete ? "/dashboard/payment_complete.svg" : "/dashboard/payment_pending.svg"}
                alt={paymentComplete ? "Payment complete" : "Payment pending"}
                width={24}
                height={24}
                className="size-6"
              />
              <span
                role="tooltip"
                className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-[130] -translate-x-1/2 whitespace-nowrap rounded-[8px] bg-[#1e1e24] px-[10px] py-[6px] font-inter text-[12px] font-medium leading-[16px] text-white opacity-0 shadow-[0px_4px_12px_rgba(0,0,0,0.15)] transition-opacity duration-150 group-hover:opacity-100"
              >
                {paymentComplete ? "Payment Complete" : "Payment Pending"}
              </span>
            </>
          )}
        </span>
        {pending ? (
          <>
            <button
              type="button"
              onClick={onAccept}
              aria-label={`Accept ${row.patientName}'s appointment`}
              className="flex size-[34px] items-center justify-center text-[#16a34a] transition-transform hover:scale-110"
            >
              <CircleGlyph kind="check" className="size-7" />
            </button>
            <button
              type="button"
              onClick={onReject}
              aria-label={`Reject ${row.patientName}'s appointment`}
              className="flex size-[34px] items-center justify-center text-[#dc2626] transition-transform hover:scale-110"
            >
              <CircleGlyph kind="x" className="size-7" />
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onEdit} aria-label={`Edit ${row.patientName}'s appointment`} className="group relative flex size-[34px] items-center justify-center">
              <Image src="/dashboard/edit_square.svg" alt="" width={24} height={24} className="size-6" />
              <Tip label="Edit" />
            </button>
            <MoreMenu
              row={row}
              onRecords={onRecords}
              onInfo={onInfo}
              onCancel={onCancel}
              onDelete={onDelete}
              onCall={onCall}
              onChat={onChat}
              onNotify={onNotify}
              onPayments={onPayments}
            />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Row overflow ("⋮") menu (Figma "Appts More Dropdown"): Records, Payments, Call,
 * Chat, Notify, Info, Cancel and Delete. Payments / Info / Cancel / Delete / Call /
 * Chat / Notify open their dialogs (Payments → the "Payment Management" flow, Figma
 * "Appts15/16 - Payments"; Call → "Proceed to Call?", Figma "Appts - Call"; Chat →
 * "Proceed to Chat?", Figma "PTC" — opens the patient's WhatsApp; Notify → "Notify
 * the Patient", Figma "NTP" — the send is a placeholder until the notification
 * backend lands). Records opens the full "Patient Records" view (Figma "Appts8 -
 * Records") in place of the table.
 */
function MoreMenu({
  row,
  onRecords,
  onInfo,
  onCancel,
  onDelete,
  onCall,
  onChat,
  onNotify,
  onPayments,
}: {
  row: AppointmentRow;
  onRecords: () => void;
  onInfo: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onCall: () => void;
  onChat: () => void;
  onNotify: () => void;
  onPayments: () => void;
}) {
  const [open, setOpen] = useExclusiveDropdown();
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // The menu is portaled to <body> with fixed positioning so it escapes the
  // table body's scroll/overflow clipping; `pos` is computed on open.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Menu footprint: 8 pills (py-10 + 20px line = 40px), 7×5px gaps, 2×17 padding.
  const MENU_WIDTH = 220;
  const MENU_HEIGHT = 8 * 40 + 7 * 5 + 2 * 17;

  /** Place the menu above or below the trigger based on available space. */
  function place() {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    // Open upward only when there isn't room below AND there's more room above.
    const openUp = spaceBelow < MENU_HEIGHT + 12 && r.top > spaceBelow;
    const top = openUp ? Math.max(8, r.top - MENU_HEIGHT - 6) : r.bottom + 6;
    // Right-align the menu to the trigger, clamped to the viewport.
    const left = Math.min(
      Math.max(8, r.right - MENU_WIDTH),
      window.innerWidth - MENU_WIDTH - 8,
    );
    setPos({ top, left });
  }

  function toggle() {
    if (!open) place();
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    // A fixed-positioned menu detaches on scroll/resize — close it instead of
    // letting it drift away from its row.
    function onReflow() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open, setOpen]);

  const phoneDigits = row.phone.replace(/\D/g, "");

  function run(fn: () => void) {
    fn();
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label={`More actions for ${row.patientName}'s appointment`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex size-[34px] items-center justify-center rounded-full transition-colors hover:bg-[#f1f5f9]"
      >
        <MoreIcon className="size-6 text-[#1e1e24]" />
      </button>
      {open && pos && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: "fixed", top: pos.top, left: pos.left, width: MENU_WIDTH }}
            className="z-[120] flex flex-col gap-[5px] rounded-[15px] border border-[#c2c6d4] bg-white p-[17px] drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
          >
            <MenuItem label="Records" onClick={() => run(onRecords)} />
            <MenuItem label="Payments" onClick={() => run(onPayments)} />
            <MenuItem
              label="Call"
              disabled={!phoneDigits}
              onClick={() => run(onCall)}
            />
            <MenuItem
              label="Chat"
              disabled={!phoneDigits}
              onClick={() => run(onChat)}
            />
            <MenuItem label="Notify" onClick={() => run(onNotify)} />
            <MenuItem label="Info" onClick={() => run(onInfo)} />
            <MenuItem label="Cancel" onClick={() => run(onCancel)} />
            <MenuItem label="Delete" tone="danger" onClick={() => run(onDelete)} />
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * A single filled-pill row inside the overflow menu (Figma "Appts More
 * Dropdown"): light-grey `#f1f5f9` fill, Manrope SemiBold; the Delete variant
 * uses the red `#f9f1f1` / `#ab2222` tone.
 */
function MenuItem({
  label,
  onClick,
  disabled = false,
  tone = "default",
  title,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`w-full rounded-[8px] px-[16px] py-[10px] text-left font-manrope text-[14px] font-semibold leading-[20px] transition-colors ${
        tone === "danger"
          ? "bg-[#f9f1f1] text-[#ab2222] hover:bg-[#f4e3e3]"
          : "bg-[#f1f5f9] text-[#1e1e24] hover:bg-[#e9eef4]"
      } ${disabled ? "cursor-not-allowed opacity-60 hover:bg-[#f1f5f9]" : ""}`}
    >
      {label}
    </button>
  );
}

/** A circled check / cross glyph for the Accept / Reject row actions. */
function CircleGlyph({ kind, className }: { kind: "check" | "x"; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      {kind === "check" ? <path d="M8.5 12l2.5 2.5L15.5 9" /> : <path d="M9 9l6 6M15 9l-6 6" />}
    </svg>
  );
}

/** "20 per page" dropdown for the pagination footer. */
function PerPageDropdown({ value, onChange }: { value: number; onChange: (n: number) => void }) {
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
        className="flex h-[44px] items-center gap-[10px] rounded-[10px] border-[1.2px] border-[#c2c6d4] px-[16px] font-inter text-[15px] text-[#1e1e24] transition-colors hover:border-[#0077c0]"
      >
        {value} per page
        <Image
          src="/dashboard/chevron_dark.svg"
          alt=""
          width={20}
          height={20}
          className={`size-5 transition-transform ${open ? "rotate-90" : "-rotate-90"}`}
        />
      </button>
      {open && (
        <div className="absolute bottom-[calc(100%+8px)] left-0 z-30 flex w-[176px] flex-col gap-[5px] rounded-[15px] border border-[#c2c6d4] bg-white p-[17px] drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          {PER_PAGE_OPTIONS.map((n) => {
            const selected = n === value;
            return (
              <button
                key={n}
                type="button"
                onClick={() => {
                  onChange(n);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-[8px] bg-[#f1f5f9] p-[10px] text-left transition-colors hover:bg-[#e9eef4]"
              >
                <span className="font-manrope text-[14px] font-semibold leading-[20px] text-[#1e1e24]">
                  {n} per page
                </span>
                {selected ? (
                  <span className="flex size-3 shrink-0 items-center justify-center rounded-full border border-[#1e1e24]">
                    <span className="size-1.5 rounded-full bg-[#1e1e24]" />
                  </span>
                ) : (
                  <span className="size-3 shrink-0 rounded-full border border-[#1e1e24]" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Numbered pagination with ellipsis + prev/next chevrons. */
function Pagination({
  current,
  total,
  onChange,
}: {
  current: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center gap-[8px]">
      <PageArrow label="Previous page" disabled={current === 1} onClick={() => onChange(current - 1)} flip />
      {pageList(current, total).map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="px-[6px] font-inter text-[15px] text-[#94a3b8]">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            aria-current={p === current ? "page" : undefined}
            onClick={() => onChange(p)}
            className={`flex size-[40px] items-center justify-center rounded-[10px] font-inter text-[15px] transition-colors ${
              p === current ? "bg-[#0077c0] font-semibold text-white" : "text-[#1e1e24] hover:bg-[#f1f5f9]"
            }`}
          >
            {p}
          </button>
        ),
      )}
      <PageArrow label="Next page" disabled={current === total} onClick={() => onChange(current + 1)} />
    </div>
  );
}

function PageArrow({
  label,
  disabled,
  onClick,
  flip = false,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  flip?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-[40px] items-center justify-center rounded-[10px] border-[1.2px] border-[#c2c6d4] transition-colors hover:border-[#0077c0] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#c2c6d4]"
    >
      <Image src="/dashboard/chevron_dark.svg" alt="" width={20} height={20} className={`size-5 ${flip ? "" : "rotate-180"}`} />
    </button>
  );
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}
