"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { apiFetch, type AppointmentListItem, type DoctorSummary } from "@/lib/api";
import { frameRange } from "@/lib/analytics";
import { useAppointmentsRevision } from "@/lib/appointmentsBus";
import { Tip } from "@/components/HoverTip";

import TimeframeFilter from "../dashboard/TimeframeFilter";
import { type Timeframe } from "../dashboard/mock";

/** Sort direction for a count list. */
type SortDir = "high" | "low";

/** "TEETH WHITENING" → "Teeth Whitening". */
function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Minor words kept lowercase in proper-cased labels (unless they lead the string).
const MINOR_WORDS = new Set(["of", "and", "the", "to", "a", "an", "in", "on", "for", "or", "by", "with"]);

/** "WORD OF MOUTH" → "Word of Mouth" (title case, minor words lowercased). */
function properCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && MINOR_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Whether an ISO instant falls inside a timeframe (all-time → always true). */
function inRange(iso: string, tf: Timeframe): boolean {
  const r = frameRange(tf);
  if (!r) return true;
  const t = new Date(iso).getTime();
  return t >= r.from.getTime() && t <= r.to.getTime();
}

/** Escape one CSV cell (wrap in quotes when it contains a comma/quote/newline). */
function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** The four summary stat cards (Figma "Dashboard - Stats Cards" reused on Analytics).
 *  `status` is the appointments-page status filter the "Review" link deep-links to. */
const STAT_CARDS = [
  { key: "total", label: "Total Appointments", icon: "/dashboard/stat_productivity.svg", status: "" },
  { key: "completed", label: "Total Appointments Completed", icon: "/dashboard/stat_event_available.svg", status: "Completed" },
  { key: "pending", label: "Total Appointments Pending", icon: "/dashboard/stat_hourglass_empty.svg", status: "Upcoming" },
  { key: "cancelled", label: "Total Appointments Cancelled", icon: "/dashboard/stat_cancel.svg", status: "Cancelled" },
] as const;

type StatKey = (typeof STAT_CARDS)[number]["key"];

/** Doctor-performance columns. `status` is the appointments status the column's
 *  eye drill-down filters to (empty = no status filter, e.g. Total). */
const DOCTOR_COLUMNS = [
  { key: "total", header: "Total Appointments", status: "" },
  { key: "upcoming", header: "Upcoming Appointments", status: "Upcoming" },
  { key: "completed", header: "Completed Appointments", status: "Completed" },
  { key: "noShow", header: "No Show Appointments", status: "No Show" },
  { key: "cancelled", header: "Cancelled Appointments", status: "Cancelled" },
] as const;

type DoctorColKey = (typeof DOCTOR_COLUMNS)[number]["key"];

interface DoctorRow {
  id: string;
  name: string;
  counts: Record<DoctorColKey, number>;
}

// Grid template shared by the doctor table's header + every row.
const DOC_COLS =
  "grid-cols-[minmax(0,220fr)_minmax(0,155fr)_minmax(0,155fr)_minmax(0,155fr)_minmax(0,155fr)_minmax(0,155fr)]";

type Tab = "doctor" | "counts";

export default function AnalyticsClient() {
  const router = useRouter();
  const { code } = useParams<{ code: string }>();
  const rev = useAppointmentsRevision();

  const [items, setItems] = useState<AppointmentListItem[]>([]);
  const [doctors, setDoctors] = useState<DoctorSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<Tab>("doctor");

  // Per-section timeframes: the header cards, the doctor tab, and a single shared
  // timeframe for both count cards on the Consultation/Source tab.
  const [cardsTf, setCardsTf] = useState<Timeframe>({ kind: "all" });
  const [doctorTf, setDoctorTf] = useState<Timeframe>({ kind: "all" });
  const [countsTf, setCountsTf] = useState<Timeframe>({ kind: "all" });

  const [doctorQuery, setDoctorQuery] = useState("");
  // Each count card sorts by its count; the sort-toggle icon flips the direction.
  const [consultSort, setConsultSort] = useState<SortDir>("high");
  const [leadSort, setLeadSort] = useState<SortDir>("high");

  // One all-time fetch feeds every section; each section filters by its own
  // timeframe client-side. Doctors are fetched so zero-count doctors still list.
  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<AppointmentListItem[]>("/appointments?limit=500"),
      apiFetch<DoctorSummary[]>("/doctors"),
    ])
      .then(([appts, docs]) => {
        if (!active) return;
        // Analytics counts only the main appointments table. Pending (SCHEDULED)
        // WhatsApp bookings live in the "WhatsApp Appointments" popup until they're
        // accepted (which flips them to CONFIRMED), so they're excluded here.
        setItems(appts.filter((a) => a.status !== "SCHEDULED"));
        setDoctors(docs);
      })
      .catch(() => {
        if (!active) return;
        setItems([]);
        setDoctors([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [rev]);

  // Summary cards — counts within the header timeframe (pending = confirmed
  // upcoming bookings, cancelled rolls in no-shows). SCHEDULED WhatsApp requests
  // are already filtered out of `items`.
  const cardCounts = useMemo<Record<StatKey, number>>(() => {
    const inTf = items.filter((a) => inRange(a.startTime, cardsTf));
    const by = (s: AppointmentListItem["status"]) => inTf.filter((a) => a.status === s).length;
    return {
      total: inTf.length,
      completed: by("COMPLETED"),
      pending: by("CONFIRMED"),
      cancelled: by("CANCELLED") + by("NO_SHOW"),
    };
  }, [items, cardsTf]);

  // Doctor performance — every doctor (incl. zero-count), counts within the
  // doctor-section timeframe, filtered by the search box.
  const doctorRows = useMemo<DoctorRow[]>(() => {
    const inTf = items.filter((a) => inRange(a.startTime, doctorTf));
    const rows = doctors.map((d) => {
      const mine = inTf.filter((a) => a.doctor.id === d.id);
      const by = (s: AppointmentListItem["status"]) => mine.filter((a) => a.status === s).length;
      return {
        id: d.id,
        name: d.name ? `Dr. ${d.name}` : "Unassigned",
        counts: {
          total: mine.length,
          upcoming: by("CONFIRMED"),
          completed: by("COMPLETED"),
          noShow: by("NO_SHOW"),
          cancelled: by("CANCELLED"),
        },
      };
    });
    const q = doctorQuery.trim().toLowerCase();
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
  }, [items, doctors, doctorTf, doctorQuery]);

  // Appointment counts grouped by consultation type (a joined "A, B" value counts
  // toward each type) and by lead source, within each card's own timeframe.
  const consultRows = useMemo(
    () =>
      countBy(
        items.filter((a) => inRange(a.startTime, countsTf)),
        (a) => (a.consultationType ?? "").split(",").map((c) => c.trim()).filter(Boolean).map(titleCase),
        consultSort,
      ),
    [items, countsTf, consultSort],
  );
  const leadRows = useMemo(
    () =>
      countBy(
        items.filter((a) => inRange(a.startTime, countsTf)),
        (a) => {
          const s = a.sourceOfEnquiry?.trim();
          return s ? [s] : [];
        },
        leadSort,
      ),
    [items, countsTf, leadSort],
  );

  /** Open the appointments list with the given deep-link filters (empty values
   *  are dropped): `doctorId`, `status`, `consultationType`, `source`. */
  function openAppointments(params: Record<string, string>) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    const qs = sp.toString();
    router.push(`/clinic-selection/${code}/appointments${qs ? `?${qs}` : ""}`);
  }
  const drillDown = (doctorId: string, status: string) => openAppointments({ doctorId, status });

  function exportCsv() {
    let header: string[];
    let lines: string[];
    if (tab === "doctor") {
      header = ["Doctor Name", ...DOCTOR_COLUMNS.map((c) => c.header)];
      lines = doctorRows.map((r) =>
        [r.name, ...DOCTOR_COLUMNS.map((c) => String(r.counts[c.key]))].map(csvCell).join(","),
      );
    } else {
      header = ["Category", "Label", "Count"];
      lines = [
        ...consultRows.map((r) => ["Consultation Type", r.label, String(r.count)].map(csvCell).join(",")),
        ...leadRows.map((r) => ["Lead Source", r.label, String(r.count)].map(csvCell).join(",")),
      ];
    }
    const csv = [header.join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-1 flex-col gap-[48px]">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-[16px]">
        <h1 className="flex-1 font-manrope text-[35px] font-bold leading-[44px] tracking-[-0.7px] text-[#1e1e24]">
          Analytics Summary
        </h1>
        <TimeframeFilter timeframe={cardsTf} onChange={setCardsTf} />
        <IconButton label="Export analytics to CSV" tip="Export" onClick={exportCsv} icon="/dashboard/download.svg" />
      </div>

      {/* Stat cards */}
      <div className="flex shrink-0 flex-wrap gap-[28px] xl:flex-nowrap">
        {STAT_CARDS.map((card) => (
          <div
            key={card.key}
            className="flex h-[224px] min-w-[220px] flex-1 flex-col justify-between overflow-hidden rounded-[28px] bg-[#0077c0] p-[28px]"
          >
            <div className="flex flex-col gap-[4.667px]">
              <span className="font-inter text-[42px] font-bold leading-[46.667px] text-white">
                {loading ? "—" : cardCounts[card.key]}
              </span>
              <span className="font-inter text-[18.667px] font-medium leading-[28px] text-white">
                {card.label}
              </span>
            </div>
            <div className="flex items-end justify-between pt-[18.667px]">
              <Image src={card.icon} alt="" width={40} height={40} className="size-10 [filter:brightness(0)_invert(1)]" />
              <button
                type="button"
                onClick={() => drillDown("", card.status)}
                className="font-inter text-[16.333px] font-medium leading-[23.333px] text-white hover:underline"
              >
                Review
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Segmented toggle: Doctor Performance | Consultation Type & Lead Source */}
      <div className="flex shrink-0 flex-col gap-[28px]">
        <div className="flex w-fit items-center gap-[6px] rounded-full border-[1.2px] border-[#c2c6d4] p-[5px]">
          <TabButton label="Doctor Performance" active={tab === "doctor"} onClick={() => setTab("doctor")} />
          <TabButton
            label="Consultation Type & Source of Enquiry"
            active={tab === "counts"}
            onClick={() => setTab("counts")}
          />
        </div>

        {tab === "doctor" ? (
          <DoctorPerformance
            rows={doctorRows}
            query={doctorQuery}
            onQueryChange={setDoctorQuery}
            timeframe={doctorTf}
            onTimeframeChange={setDoctorTf}
            loading={loading}
            onDrill={drillDown}
          />
        ) : (
          // Same scale as the sections above: a single shared timeframe, then the
          // two count cards side by side.
          <div className="flex flex-col gap-[24px]">
            <div className="self-start">
              <TimeframeFilter timeframe={countsTf} onChange={setCountsTf} />
            </div>
            <div className="grid grid-cols-1 items-start gap-[28px] md:grid-cols-2">
              <CountCard
                title="Consultation Type :"
                rows={consultRows}
                sort={consultSort}
                onToggleSort={() => setConsultSort((s) => (s === "high" ? "low" : "high"))}
                onRowClick={(label) => openAppointments({ consultationType: label.toUpperCase() })}
                loading={loading}
                emptyLabel="No consultation types yet."
              />
              <CountCard
                title="Source of Enquiry :"
                rows={leadRows}
                sort={leadSort}
                onToggleSort={() => setLeadSort((s) => (s === "high" ? "low" : "high"))}
                onRowClick={(label) => openAppointments({ source: label })}
                format={properCase}
                loading={loading}
                emptyLabel="No sources of enquiry yet."
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** One pill in the segmented toggle. */
function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`whitespace-nowrap rounded-full px-[22px] py-[11px] font-inter text-[15px] font-semibold transition-colors ${
        active ? "bg-[#0077c0] text-white" : "text-[#727783] hover:text-[#1e1e24]"
      }`}
    >
      {label}
    </button>
  );
}

/** The "Doctor Performance" tab: search + timeframe + the per-doctor table. */
function DoctorPerformance({
  rows,
  query,
  onQueryChange,
  timeframe,
  onTimeframeChange,
  loading,
  onDrill,
}: {
  rows: DoctorRow[];
  query: string;
  onQueryChange: (q: string) => void;
  timeframe: Timeframe;
  onTimeframeChange: (t: Timeframe) => void;
  loading: boolean;
  onDrill: (doctorId: string, status: string) => void;
}) {
  return (
    <div className="flex flex-col gap-[24px]">
      {/* Search + timeframe */}
      <div className="flex items-center gap-[16px]">
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
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search doctor name"
            aria-label="Search doctor name"
            className="h-[54px] w-full rounded-[27px] border-[1.2px] border-[#c2c6d4] pl-[58px] pr-[20px] font-inter text-[16px] text-[#1e1e24] outline-none placeholder:text-[#94a3b8] focus:border-[#0077c0]"
          />
        </div>
        <TimeframeFilter timeframe={timeframe} onChange={onTimeframeChange} />
      </div>

      {/* Table */}
      <div className="flex flex-col overflow-hidden rounded-[28px] border-[1.2px] border-[#c2c6d4] bg-white">
        <div className={`grid ${DOC_COLS} items-start border-b-[1.2px] border-[rgba(194,198,212,0.5)]`}>
          <span className="px-[24px] py-[24px] font-inter text-[13px] font-semibold uppercase leading-[17px] tracking-[0.5px] text-[#727783]">
            Doctor Name
          </span>
          {DOCTOR_COLUMNS.map((c) => (
            <span
              key={c.key}
              className="px-[12px] py-[24px] font-inter text-[13px] font-semibold uppercase leading-[17px] tracking-[0.5px] text-[#727783]"
            >
              {c.header}
            </span>
          ))}
        </div>

        {loading ? (
          <p className="px-[24px] py-10 font-inter text-[16px] text-[#94a3b8]">Loading analytics…</p>
        ) : rows.length === 0 ? (
          <p className="px-[24px] py-10 font-inter text-[16px] text-[#94a3b8]">
            {query.trim() ? "No doctors match your search." : "No doctors yet."}
          </p>
        ) : (
          rows.map((r) => (
            <div
              key={r.id}
              className={`grid ${DOC_COLS} items-center border-b-[1.2px] border-[rgba(194,198,212,0.5)] last:border-b-0`}
            >
              <span className="px-[24px] py-[26px] font-inter text-[15px] font-medium leading-[21px] text-[#1e1e24]">
                {r.name}
              </span>
              {DOCTOR_COLUMNS.map((c) => (
                <div key={c.key} className="flex items-center gap-[10px] px-[12px] py-[26px]">
                  <span className="font-inter text-[15px] font-medium leading-[21px] text-[#1e1e24]">
                    {r.counts[c.key]}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDrill(r.id, c.status)}
                    aria-label={`View ${r.name} ${c.header.toLowerCase()}`}
                    className="group relative flex size-[28px] items-center justify-center text-[#0077c0] transition-transform hover:scale-110"
                  >
                    <EyeIcon className="size-[22px]" />
                    <Tip label="View appointments" />
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** Count a list into `{ label, count }[]`, sorted by count (default = high→low). */
function countBy(
  items: AppointmentListItem[],
  keys: (a: AppointmentListItem) => string[],
  sort: SortDir,
): { label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const a of items) {
    for (const k of keys(a)) map.set(k, (map.get(k) ?? 0) + 1);
  }
  const rows = [...map].map(([label, count]) => ({ label, count }));
  rows.sort((a, b) => (sort === "low" ? a.count - b.count : b.count - a.count));
  return rows;
}

/** An "Appointment Counts" card: a header with the category title + "Appointment
 *  Counts" subtitle and a sort-direction toggle, then a list of bordered
 *  `label → count` rows. Sized to match the sections above. */
function CountCard({
  title,
  rows,
  sort,
  onToggleSort,
  onRowClick,
  format = (s) => s,
  loading,
  emptyLabel,
}: {
  title: string;
  rows: { label: string; count: number }[];
  sort: SortDir;
  onToggleSort: () => void;
  /** Navigate to the appointments list filtered to the clicked row's value. */
  onRowClick: (label: string) => void;
  /** How to render a row label (defaults to identity; source uses proper case). */
  format?: (label: string) => string;
  loading: boolean;
  emptyLabel: string;
}) {
  const sortLabel = sort === "low" ? "Low to High" : "High to Low";
  return (
    <div className="flex flex-col gap-[20px] rounded-[28px] border-[1.2px] border-[#c2c6d4] bg-white p-[28px]">
      <div className="flex items-start gap-[16px]">
        <div className="flex-1">
          <h3 className="font-inter text-[18px] font-bold uppercase leading-[24px] tracking-[0.4px] text-[#1e1e24]">
            {title}
          </h3>
          <p className="mt-[3px] font-inter text-[14px] leading-[20px] text-[#727783]">Appointment Counts</p>
        </div>
        <button
          type="button"
          onClick={onToggleSort}
          aria-label={`Sort ${sortLabel}`}
          className="group relative flex size-[54px] shrink-0 items-center justify-center rounded-full border-[1.4px] border-[#c2c6d4] text-[#1e1e24] transition-colors hover:border-[#0077c0] hover:text-[#0077c0]"
        >
          <SortIcon dir={sort} className="size-7" />
          <Tip label={sortLabel} below />
        </button>
      </div>
      <div className="flex flex-col gap-[16px]">
        {loading ? (
          <p className="py-6 font-inter text-[15px] text-[#94a3b8]">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 font-inter text-[15px] text-[#94a3b8]">{emptyLabel}</p>
        ) : (
          rows.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => onRowClick(r.label)}
              aria-label={`View ${format(r.label)} appointments (${r.count})`}
              className="flex items-center justify-between rounded-[14px] border-[1.2px] border-[#c2c6d4] px-[24px] py-[22px] text-left transition-colors hover:border-[#0077c0] hover:bg-[#f6fbff]"
            >
              <span className="font-inter text-[17px] leading-[24px] text-[#1e1e24]">{format(r.label)}</span>
              <span className="font-inter text-[24px] font-bold leading-[28px] text-[#0077c0]">{r.count}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/** Sort-direction glyph: ascending bars + up arrow for "low → high", descending
 *  bars + down arrow for "high → low". */
function SortIcon({ dir, className }: { dir: SortDir; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {dir === "low" ? (
        <>
          <path d="M4 6h4M4 12h7M4 18h10" />
          <path d="M19 20V8M16 11l3-3 3 3" />
        </>
      ) : (
        <>
          <path d="M4 6h10M4 12h7M4 18h4" />
          <path d="M19 8v12M16 17l3 3 3-3" />
        </>
      )}
    </svg>
  );
}

/** Circular outlined icon button used in the header + card toolbars. */
function IconButton({
  label,
  tip,
  onClick,
  icon,
}: {
  label: string;
  tip?: string;
  onClick: () => void;
  icon: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="group relative flex size-[54px] shrink-0 items-center justify-center rounded-full border-[1.4px] border-[#c2c6d4] transition-colors hover:border-[#0077c0]"
    >
      <Image src={icon} alt="" width={28} height={28} className="size-7" />
      <Tip label={tip ?? label} below />
    </button>
  );
}

/** Row "view" glyph (Material "visibility") in the row's blue accent. */
function EyeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 5c-5.5 0-9.27 4.5-10 7 .73 2.5 4.5 7 10 7s9.27-4.5 10-7c-.73-2.5-4.5-7-10-7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
