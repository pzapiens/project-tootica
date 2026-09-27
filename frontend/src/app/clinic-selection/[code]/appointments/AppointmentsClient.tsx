"use client";

import Image from "next/image";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { apiFetch, type AppointmentListItem, type AppointmentStatus, type BookingChannel } from "@/lib/api";
import { analyticsRangeQuery } from "@/lib/analytics";
import { useAppointmentsRevision, notifyAppointmentsChanged } from "@/lib/appointmentsBus";
import { bookingChannelLabel } from "@/lib/whatsapp";
import { statusDropdownBadgeClass } from "@/lib/statusColors";
import { useExclusiveDropdown } from "@/lib/useExclusiveDropdown";
import { Tip } from "@/components/HoverTip";

import NewAppointmentModal, { type EditAppointment } from "../dashboard/NewAppointmentModal";
import { CONSULTATION_TYPES, LEAD_SOURCES, type Time } from "../dashboard/AppointmentFormStep";
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

/** The numeric sequence in an appointment code, e.g. "BSD001-A000019" → 19.
 *  Code-less rows (shown as "—") sort last. Used to order the table by ID. */
function codeNum(code: string): number {
  const m = code.match(/(\d+)(?!.*\d)/);
  return m ? Number(m[1]) : -1;
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
  ONGOING: "On going",
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
  ONGOING: "On going",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No Show",
};

/** Which backend statuses each status chip selects (empty = no equivalent). */
const CHIP_STATUSES: Record<string, AppointmentStatus[]> = {
  Pending: ["SCHEDULED"],
  Upcoming: ["CONFIRMED"],
  "On going": ["ONGOING"],
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
  | { kind: "call"; row: AppointmentRow }
  | { kind: "chat"; row: AppointmentRow }
  | { kind: "notify"; row: AppointmentRow }
  | { kind: "payments"; row: AppointmentRow };

export default function AppointmentsClient() {
  // Deep-link params: `?q=` pre-fills the search, `?status=` auto-applies a status
  // filter, `?patientId=` pins the list to one patient (from the patients page's
  // Appointments action).
  const searchParams = useSearchParams();
  const router = useRouter();
  const { code } = useParams<{ code: string }>();

  const [items, setItems] = useState<AppointmentListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [timeframe, setTimeframe] = useState<Timeframe>({ kind: "all" });
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  // Exact single-patient filter (by id) from the patients page; cleared via the
  // banner's ✕.
  const [patientFilterId, setPatientFilterId] = useState(() => searchParams.get("patientId") ?? "");
  // Exact source-of-enquiry filter (from the analytics "Source of Enquiry" card),
  // cleared via its banner's ✕.
  const [sourceFilter, setSourceFilter] = useState(() => searchParams.get("source") ?? "");
  const [filters, setFilters] = useState<AppointmentFilters>(() => {
    // Deep-links from the dashboard/analytics: `?status=` auto-applies a status
    // chip, `?doctorId=` pins the list to one doctor (analytics eye drill-down),
    // `?consultationType=` pre-selects a consultation-type facet (analytics card).
    const status = searchParams.get("status");
    const doctorId = searchParams.get("doctorId");
    const consultationType = searchParams.get("consultationType");
    return {
      ...EMPTY_FILTERS,
      statuses:
        status && (STATUS_CHIPS as readonly string[]).includes(status) ? [status] : [],
      doctorIds: doctorId ? [doctorId] : [],
      consultationTypes: consultationType ? [consultationType] : [],
    };
  });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  const [filterOpen, setFilterOpen] = useState(false);
  // The patient whose "Patient Records" view is open (⋮ → Records), or null. The
  // appointment's notes ride along so the records header's Info action can show
  // the Additional Info dialog (patient message + cancellation reason).
  const [records, setRecords] = useState<
    {
      name: string;
      code: string;
      id: string;
      message: string;
      appointmentCode: string;
      appointmentDate: string;
      appointmentTime: string;
    } | null
  >(null);
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

  // The Source of Enquiry filter offers the same canonical list used when
  // creating an appointment (how the patient heard of the clinic).
  const sourceOptions = useMemo<FilterOption[]>(
    () => LEAD_SOURCES.map((s) => ({ value: s, label: titleCase(s) })),
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
    const sourceSet = new Set(filters.sourcesOfEnquiry);

    let out = allRows.filter(({ item, row }) => {
      // Pending (SCHEDULED) bookings arrive via WhatsApp and live only in the
      // "WhatsApp Appointments" popup until they're accepted — never the main
      // table. Accepting flips them to CONFIRMED, at which point they appear here.
      if (row.rawStatus === "SCHEDULED") return false;
      // Exact single-patient filter (from the patients page).
      if (patientFilterId && item.patient.id !== patientFilterId) return false;
      // Exact source-of-enquiry filter (from the analytics card).
      if (sourceFilter && (item.sourceOfEnquiry ?? "").trim() !== sourceFilter) return false;
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
      if (sourceSet.size > 0 && !sourceSet.has((item.sourceOfEnquiry ?? "").trim())) return false;
      if (filters.statuses.length > 0 && !chipStatuses.has(row.rawStatus)) return false;
      return true;
    });

    // Default order: highest appointment ID first (newest sequence number). The
    // ID Sorting filter overrides the direction; the Date & Time filter sorts by
    // start time instead.
    out = [...out].sort((a, b) => {
      if (filters.dateSort) {
        const cmp = new Date(a.row.startTime).getTime() - new Date(b.row.startTime).getTime();
        // dateSort "oldest" = ascending; "newest" = descending.
        return filters.dateSort === "oldest" ? cmp : -cmp;
      }
      if (filters.nameSort) {
        const cmp = a.row.patientName.localeCompare(b.row.patientName);
        // nameSort "asc" = A→Z; "desc" = Z→A.
        return filters.nameSort === "asc" ? cmp : -cmp;
      }
      // Compare by the code's numeric sequence (e.g. "BSD001-A000019" → 19).
      const cmp = codeNum(a.row.code) - codeNum(b.row.code);
      // Default + "desc" = highest first; "asc" = lowest first.
      return filters.idSort === "asc" ? cmp : -cmp;
    });

    return out;
  }, [allRows, query, filters, patientFilterId, sourceFilter]);

  // Name of the patient the list is pinned to (for the filter banner), resolved
  // from the loaded rows. Empty when no filter (or the patient has no rows).
  const patientFilterName = useMemo(
    () =>
      patientFilterId
        ? allRows.find(({ item }) => item.patient.id === patientFilterId)?.row.patientName ?? ""
        : "",
    [allRows, patientFilterId],
  );

  // Pending (SCHEDULED) bookings for the "WhatsApp Appointments" popup — the
  // rows deliberately excluded from the main table above, straight from the
  // backend (WhatsApp bookings arrive SCHEDULED). Highest appointment code
  // first (newest booking), matching the main list's ordering.
  const pendingRows = useMemo(
    () =>
      allRows
        .filter(({ row }) => row.rawStatus === "SCHEDULED")
        .map(({ row }) => row)
        .sort((a, b) => codeNum(b.code) - codeNum(a.code)),
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
        message={records.message}
        appointmentCode={records.appointmentCode}
        appointmentDate={records.appointmentDate}
        appointmentTime={records.appointmentTime}
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
        sourceOptions={sourceOptions}
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
            placeholder="Search here..."
            aria-label="Search appointments"
            className="h-[54px] w-full rounded-[27px] border-[1.2px] border-[#c2c6d4] pl-[58px] pr-[20px] font-inter text-[16px] text-[#1e1e24] outline-none placeholder:text-[#94a3b8] focus:border-[#0077c0]"
          />
        </div>
        <p className="shrink-0 font-inter text-[19px] leading-[28px] text-[#1e1e24]">
          Counts : <span className="font-bold">{loading ? "—" : total}</span>
        </p>
      </div>

      {/* Single-patient filter banner (from the patients page's Appointments action). */}
      {patientFilterId && (
        <div className="flex shrink-0 items-center gap-[10px] self-start rounded-full bg-[#e6f2fb] py-[8px] pl-[16px] pr-[10px]">
          <span className="font-inter text-[14px] text-[#0077c0]">
            Showing appointments for{" "}
            <span className="font-semibold">{patientFilterName || "this patient"}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setPatientFilterId("");
              setPage(1);
            }}
            aria-label="Clear patient filter"
            className="flex size-[22px] items-center justify-center rounded-full text-[#0077c0] transition-colors hover:bg-[#0077c0]/10"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}

      {/* Source-of-enquiry filter banner (from the analytics "Source of Enquiry" card). */}
      {sourceFilter && (
        <div className="flex shrink-0 items-center gap-[10px] self-start rounded-full bg-[#e6f2fb] py-[8px] pl-[16px] pr-[10px]">
          <span className="font-inter text-[14px] text-[#0077c0]">
            Showing appointments from source <span className="font-semibold">{sourceFilter}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setSourceFilter("");
              setPage(1);
            }}
            aria-label="Clear source-of-enquiry filter"
            className="flex size-[22px] items-center justify-center rounded-full text-[#0077c0] transition-colors hover:bg-[#0077c0]/10"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}

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
              {query.trim() || filterCount(filters) > 0 || patientFilterId || sourceFilter
                ? "No appointments match your search."
                : "No appointments yet."}
            </p>
          ) : (
            pageRows.map(({ item, row }) => (
              <AppointmentRowView
                key={row.id}
                row={row}
                onPatient={
                  // Clicking the name opens the patient's history summary. Pending
                  // WhatsApp leads have no patient row yet, so there's nowhere to go.
                  item.patient.id
                    ? () => router.push(`/clinic-selection/${code}/patients/${item.patient.id}/history`)
                    : undefined
                }
                onEdit={() => setEditing(item)}
                onRecords={() =>
                  // Records is only reachable for non-pending rows, which always
                  // have a real patient; the ?? "" just satisfies the type.
                  setRecords({
                    name: row.patientName,
                    code: item.patient.code ?? "—",
                    id: item.patient.id ?? "",
                    message: row.message,
                    appointmentCode: row.code,
                    appointmentDate: row.date,
                    appointmentTime: row.timeRange,
                  })
                }
                onAccept={() => setDialog({ kind: "confirm", variant: "accept", row })}
                onReject={() => setDialog({ kind: "confirm", variant: "reject", row })}
                onCancel={() => setDialog({ kind: "cancel", row })}
                onDelete={() => setDialog({ kind: "confirm", variant: "delete", row })}
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

function AppointmentRowView({
  row,
  onPatient,
  onEdit,
  onRecords,
  onAccept,
  onReject,
  onCancel,
  onDelete,
  onCall,
  onChat,
  onNotify,
  onPayments,
}: {
  row: AppointmentRow;
  /** Opens the patient's history summary; undefined for pending leads (no patient). */
  onPatient?: () => void;
  onEdit: () => void;
  onRecords: () => void;
  onAccept: () => void;
  onReject: () => void;
  onCancel: () => void;
  onDelete: () => void;
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
  // The Payments action turns green once the appointment's payments are settled
  // (every entry paid); otherwise — pending entries or none — it stays black.
  const paymentComplete = row.paymentComplete;

  return (
    <div className={`grid ${COLS} items-center border-b-[1.2px] border-[rgba(194,198,212,0.5)] last:border-b-0`}>
      {/* ID */}
      <span className={`px-[20px] py-[22px] font-inter text-[15px] font-medium leading-[21px] ${textColor}`}>
        {row.code}
      </span>
      {/* Patient Name — opens the patient's history summary (when a patient exists). */}
      <span className="px-[20px] py-[22px]">
        {onPatient ? (
          <button
            type="button"
            onClick={onPatient}
            className={`cursor-pointer text-left font-inter text-[15px] font-medium leading-[21px] transition-colors hover:text-[#0077c0] ${textColor}`}
          >
            {row.patientName}
          </button>
        ) : (
          <span className={`font-inter text-[15px] font-medium leading-[21px] ${textColor}`}>
            {row.patientName}
          </span>
        )}
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
          className={`inline-flex rounded-full px-[12px] py-[4px] font-inter text-[13px] font-medium leading-[18px] ${statusDropdownBadgeClass(
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
      {/* Actions — Pending shows Accept/Reject; otherwise Records, Payments,
          Edit + an overflow menu for the rest. */}
      <div className="flex items-center justify-start gap-[8px] px-[16px] py-[22px]">
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
            <button type="button" onClick={onRecords} aria-label={`View ${row.patientName}'s records`} className="group relative flex size-[34px] items-center justify-center">
              <RecordsIcon className={`size-6 ${textColor}`} />
              <Tip label="Records" />
            </button>
            <button
              type="button"
              onClick={onPayments}
              aria-label={`Manage ${row.patientName}'s payments${paymentComplete ? " (received)" : ""}`}
              className="group relative flex size-[34px] items-center justify-center"
            >
              {/* Paid keeps its semantic green; otherwise the icon follows the
                  row's colour (blue when ongoing, ink otherwise). */}
              <PaymentsIcon className={`size-6 ${paymentComplete ? "text-[#16a34a]" : textColor}`} />
              <Tip label={paymentComplete ? "Payments (Received)" : "Payments (Pending)"} />
            </button>
            <button type="button" onClick={onEdit} aria-label={`Edit ${row.patientName}'s appointment`} className="group relative flex size-[34px] items-center justify-center">
              <Image src={ongoing ? "/dashboard/edit_square_blue.svg" : "/dashboard/edit_square.svg"} alt="" width={24} height={24} className="size-6" />
              <Tip label="Edit" />
            </button>
            <MoreMenu
              row={row}
              onCancel={onCancel}
              onDelete={onDelete}
              onCall={onCall}
              onChat={onChat}
              onNotify={onNotify}
            />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Row overflow ("⋮") menu (Figma "Appts More Dropdown"): Call, Chat, Notify,
 * Cancel and Delete. (Records and Payments are now standalone row buttons; Info
 * moved to the Patient Records header.) Each opens its dialog — Call → "Proceed
 * to Call?" (Figma "Appts - Call"); Chat → "Proceed to Chat?" (Figma "PTC" —
 * opens the patient's WhatsApp); Notify → "Notify the Patient" (Figma "NTP" — the
 * send is a placeholder until the notification backend lands); Cancel / Delete
 * their respective dialogs.
 */
function MoreMenu({
  row,
  onCancel,
  onDelete,
  onCall,
  onChat,
  onNotify,
}: {
  row: AppointmentRow;
  onCancel: () => void;
  onDelete: () => void;
  onCall: () => void;
  onChat: () => void;
  onNotify: () => void;
}) {
  const [open, setOpen] = useExclusiveDropdown();
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // The menu is portaled to <body> with fixed positioning so it escapes the
  // table body's scroll/overflow clipping; `pos` is computed on open.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Menu footprint: 5 pills (py-10 + 20px line = 40px), 4×5px gaps, 2×17 padding.
  const MENU_WIDTH = 220;
  const MENU_HEIGHT = 5 * 40 + 4 * 5 + 2 * 17;

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
        <MoreIcon className={`size-6 ${row.statusLabel === "On going" ? "text-[#0077c0]" : "text-[#1e1e24]"}`} />
      </button>
      {open && pos && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: "fixed", top: pos.top, left: pos.left, width: MENU_WIDTH }}
            className="z-[120] flex flex-col gap-[5px] rounded-[15px] border border-[#c2c6d4] bg-white p-[17px] drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
          >
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

/** Records action icon (Material "clinical_notes"), inlined so it takes the row's
 *  text colour. */
function RecordsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 52 52" fill="currentColor" className={className} aria-hidden>
      <path d="M32.2292 32.7708C30.9653 31.5069 30.3333 29.9722 30.3333 28.1667C30.3333 26.3611 30.9653 24.8264 32.2292 23.5625C33.4931 22.2986 35.0278 21.6667 36.8333 21.6667C38.6389 21.6667 40.1736 22.2986 41.4375 23.5625C42.7014 24.8264 43.3333 26.3611 43.3333 28.1667C43.3333 29.9722 42.7014 31.5069 41.4375 32.7708C40.1736 34.0347 38.6389 34.6667 36.8333 34.6667C35.0278 34.6667 33.4931 34.0347 32.2292 32.7708ZM38.3771 29.7104C38.7924 29.2951 39 28.7806 39 28.1667C39 27.5528 38.7924 27.0382 38.3771 26.6229C37.9618 26.2076 37.4472 26 36.8333 26C36.2194 26 35.7049 26.2076 35.2896 26.6229C34.8743 27.0382 34.6667 27.5528 34.6667 28.1667C34.6667 28.7806 34.8743 29.2951 35.2896 29.7104C35.7049 30.1257 36.2194 30.3333 36.8333 30.3333C37.4472 30.3333 37.9618 30.1257 38.3771 29.7104ZM23.8333 49.8333V43.55C23.8333 42.7917 24.0139 42.0785 24.375 41.4104C24.7361 40.7424 25.2417 40.2097 25.8917 39.8125C27.0472 39.1264 28.266 38.5576 29.5479 38.1062C30.8299 37.6549 32.1389 37.3208 33.475 37.1042L36.8333 41.1667L40.1917 37.1042C41.5278 37.3208 42.8278 37.6549 44.0917 38.1062C45.3556 38.5576 46.5653 39.1264 47.7208 39.8125C48.3708 40.2097 48.8854 40.7424 49.2646 41.4104C49.6437 42.0785 49.8333 42.7917 49.8333 43.55V49.8333H23.8333ZM28.1125 45.5H34.775L31.85 41.925C31.2 42.1056 30.5681 42.3403 29.9542 42.6292C29.3403 42.9181 28.7264 43.225 28.1125 43.55V45.5ZM38.8917 45.5H45.5V43.55C44.9222 43.1889 44.3264 42.8729 43.7125 42.6021C43.0986 42.3312 42.4667 42.1056 41.8167 41.925L38.8917 45.5ZM10.8333 45.5C9.64167 45.5 8.62153 45.0757 7.77292 44.2271C6.92431 43.3785 6.5 42.3583 6.5 41.1667V10.8333C6.5 9.64167 6.92431 8.62153 7.77292 7.77292C8.62153 6.92431 9.64167 6.5 10.8333 6.5H41.1667C42.3583 6.5 43.3785 6.92431 44.2271 7.77292C45.0757 8.62153 45.5 9.64167 45.5 10.8333V21.6667C44.9222 20.9444 44.2903 20.2583 43.6042 19.6083C42.9181 18.9583 42.1056 18.525 41.1667 18.3083V10.8333H10.8333V41.1667H19.825C19.7167 41.5639 19.6354 41.9611 19.5812 42.3583C19.5271 42.7556 19.5 43.1528 19.5 43.55V45.5H10.8333ZM15.1667 19.5H30.3333C31.2722 18.7778 32.3014 18.2361 33.4208 17.875C34.5403 17.5139 35.6778 17.3333 36.8333 17.3333V15.1667H15.1667V19.5ZM15.1667 28.1667H26C26 27.4083 26.0812 26.6681 26.2437 25.9458C26.4062 25.2236 26.6319 24.5194 26.9208 23.8333H15.1667V28.1667ZM15.1667 36.8333H22.6417C23.0389 36.5083 23.4632 36.2194 23.9146 35.9667C24.366 35.7139 24.8264 35.4792 25.2958 35.2625V32.5H15.1667V36.8333ZM10.8333 41.1667V10.8333V18.2542V17.3333V41.1667Z" />
    </svg>
  );
}

/** Payments action icon (Material "account_balance_wallet"), inlined so it can
 *  switch colour: black by default, green once all payments are settled. */
function PaymentsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M5 21C4.45 21 3.97917 20.8042 3.5875 20.4125C3.19583 20.0208 3 19.55 3 19V5C3 4.45 3.19583 3.97917 3.5875 3.5875C3.97917 3.19583 4.45 3 5 3H19C19.55 3 20.0208 3.19583 20.4125 3.5875C20.8042 3.97917 21 4.45 21 5V7.5H19V5H5V19H19V16.5H21V19C21 19.55 20.8042 20.0208 20.4125 20.4125C20.0208 20.8042 19.55 21 19 21H5ZM13 17C12.45 17 11.9792 16.8042 11.5875 16.4125C11.1958 16.0208 11 15.55 11 15V9C11 8.45 11.1958 7.97917 11.5875 7.5875C11.9792 7.19583 12.45 7 13 7H20C20.55 7 21.0208 7.19583 21.4125 7.5875C21.8042 7.97917 22 8.45 22 9V15C22 15.55 21.8042 16.0208 21.4125 16.4125C21.0208 16.8042 20.55 17 20 17H13ZM20 15V9H13V15H20ZM17.0625 13.0625C17.3542 12.7708 17.5 12.4167 17.5 12C17.5 11.5833 17.3542 11.2292 17.0625 10.9375C16.7708 10.6458 16.4167 10.5 16 10.5C15.5833 10.5 15.2292 10.6458 14.9375 10.9375C14.6458 11.2292 14.5 11.5833 14.5 12C14.5 12.4167 14.6458 12.7708 14.9375 13.0625C15.2292 13.3542 15.5833 13.5 16 13.5C16.4167 13.5 16.7708 13.3542 17.0625 13.0625Z" />
    </svg>
  );
}
