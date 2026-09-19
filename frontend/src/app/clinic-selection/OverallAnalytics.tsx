"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { apiFetch, type AppointmentListItem, type DoctorSummary } from "@/lib/api";
import { frameRange } from "@/lib/analytics";
import { Tip } from "@/components/HoverTip";

import BranchFilter, { type BranchOption } from "./BranchFilter";
import { type Branch } from "./BranchList";
import TimeFilter, { type TimeFrame } from "./TimeFilter";

/**
 * "Overall Analytics" section shown below the branch list on the clinic-selection
 * page. Three tabs over a shared **All Branch** + **All-Time** filter:
 *  - **Appointments** — four appointment stat cards (total / completed / pending /
 *    cancelled).
 *  - **Doctor Performance** — per-doctor appointment counts by status.
 *  - **Consultation Type & Lead Source** — appointment counts grouped by each.
 *
 * One clinic-wide fetch (appointments + doctors) feeds every tab; the timeframe
 * filters client-side and the branch filter scopes by each appointment's doctor's
 * branch (unassigned appointments drop out when a specific branch is picked).
 */

type Tab = "appointments" | "doctor" | "counts";
type SortDir = "high" | "low";

const STAT_CARDS = [
  { key: "total", label: "Total Appointments", icon: "/clinic/productivity.svg" },
  { key: "completed", label: "Total Appointments Completed", icon: "/clinic/event_available.svg" },
  { key: "pending", label: "Total Appointments Pending", icon: "/clinic/hourglass_empty.svg" },
  { key: "cancelled", label: "Total Appointments Cancelled", icon: "/clinic/cancel.svg" },
] as const;
type StatKey = (typeof STAT_CARDS)[number]["key"];

const DOCTOR_COLUMNS = [
  { key: "total", header: "Total" },
  { key: "upcoming", header: "Upcoming" },
  { key: "completed", header: "Completed" },
  { key: "noShow", header: "No Show" },
  { key: "cancelled", header: "Cancelled" },
] as const;
type DoctorColKey = (typeof DOCTOR_COLUMNS)[number]["key"];

const DOC_COLS =
  "grid-cols-[minmax(0,220fr)_minmax(0,120fr)_minmax(0,120fr)_minmax(0,120fr)_minmax(0,120fr)_minmax(0,120fr)]";

interface DoctorRow {
  id: string;
  name: string;
  counts: Record<DoctorColKey, number>;
}

/** "TEETH WHITENING" → "Teeth Whitening". */
function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Whether an ISO instant falls inside a timeframe (all-time → always true). */
function inRange(iso: string, tf: TimeFrame): boolean {
  const r = frameRange(tf);
  if (!r) return true;
  const t = new Date(iso).getTime();
  return t >= r.from.getTime() && t <= r.to.getTime();
}

/** Count a list into `{ label, count }[]`, sorted by count (default high→low). */
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

export default function OverallAnalytics({ branches }: { branches: Branch[] }) {
  const [tab, setTab] = useState<Tab>("appointments");
  const [branchId, setBranchId] = useState("all");
  const [timeFrame, setTimeFrame] = useState<TimeFrame>({ kind: "all" });

  const [items, setItems] = useState<AppointmentListItem[]>([]);
  const [doctors, setDoctors] = useState<DoctorSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const [doctorQuery, setDoctorQuery] = useState("");
  const [consultSort, setConsultSort] = useState<SortDir>("high");
  const [leadSort, setLeadSort] = useState<SortDir>("high");

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<AppointmentListItem[]>("/appointments?limit=500"),
      apiFetch<DoctorSummary[]>("/doctors"),
    ])
      .then(([appts, docs]) => {
        if (!active) return;
        // Pending (SCHEDULED) WhatsApp bookings live in their own popup until
        // accepted, so they're excluded from analytics — matching the dashboard.
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
  }, []);

  const options: BranchOption[] = useMemo(
    () => [{ id: "all", label: "All Branch" }, ...branches.map((b) => ({ id: b.id, label: b.branch }))],
    [branches],
  );

  // doctor id → branch id, so the branch filter can scope the clinic-wide data.
  const doctorBranch = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const d of doctors) m.set(d.id, d.branchId);
    return m;
  }, [doctors]);

  const filtered = useMemo(
    () =>
      items.filter((a) => {
        if (!inRange(a.startTime, timeFrame)) return false;
        if (branchId !== "all") {
          const b = a.doctor.id ? doctorBranch.get(a.doctor.id) : null;
          if (b !== branchId) return false;
        }
        return true;
      }),
    [items, timeFrame, branchId, doctorBranch],
  );

  const cardCounts = useMemo<Record<StatKey, number>>(() => {
    const by = (s: AppointmentListItem["status"]) => filtered.filter((a) => a.status === s).length;
    return {
      total: filtered.length,
      completed: by("COMPLETED"),
      pending: by("CONFIRMED"),
      cancelled: by("CANCELLED") + by("NO_SHOW"),
    };
  }, [filtered]);

  const scopedDoctors = useMemo(
    () => (branchId === "all" ? doctors : doctors.filter((d) => d.branchId === branchId)),
    [doctors, branchId],
  );

  const doctorRows = useMemo<DoctorRow[]>(() => {
    const rows = scopedDoctors.map((d) => {
      const mine = filtered.filter((a) => a.doctor.id === d.id);
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
  }, [scopedDoctors, filtered, doctorQuery]);

  const consultRows = useMemo(
    () =>
      countBy(
        filtered,
        (a) => (a.consultationType ?? "").split(",").map((c) => c.trim()).filter(Boolean).map(titleCase),
        consultSort,
      ),
    [filtered, consultSort],
  );
  const leadRows = useMemo(
    () =>
      countBy(
        filtered,
        (a) => {
          const s = a.sourceOfEnquiry?.trim();
          return s ? [s] : [];
        },
        leadSort,
      ),
    [filtered, leadSort],
  );

  return (
    <section className="flex shrink-0 flex-col gap-[24px]">
      <h2 className="font-inter text-[26px] font-bold leading-tight text-ink md:text-[30px]">
        Overall Analytics
      </h2>

      {/* Tabs */}
      <div className="flex w-fit max-w-full items-center gap-[6px] overflow-x-auto rounded-full border-[1.2px] border-field-border p-[5px]">
        <TabButton label="Appointments" active={tab === "appointments"} onClick={() => setTab("appointments")} />
        <TabButton label="Doctor Performance" active={tab === "doctor"} onClick={() => setTab("doctor")} />
        <TabButton
          label="Consultation Type & Lead Source"
          active={tab === "counts"}
          onClick={() => setTab("counts")}
        />
      </div>

      {/* Shared filters */}
      <div className="flex flex-wrap items-center gap-3">
        <BranchFilter options={options} selectedId={branchId} onSelect={setBranchId} />
        <TimeFilter value={timeFrame} onChange={setTimeFrame} />
      </div>

      {tab === "appointments" && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:gap-[28px] xl:grid-cols-4">
          {STAT_CARDS.map((c) => (
            <StatCard key={c.key} value={loading ? "—" : cardCounts[c.key]} label={c.label} icon={c.icon} />
          ))}
        </div>
      )}

      {tab === "doctor" && (
        <DoctorPerformance
          rows={doctorRows}
          query={doctorQuery}
          onQueryChange={setDoctorQuery}
          loading={loading}
        />
      )}

      {tab === "counts" && (
        <div className="grid grid-cols-1 items-start gap-[28px] md:grid-cols-2">
          <CountCard
            title="Consultation Type"
            rows={consultRows}
            sort={consultSort}
            onToggleSort={() => setConsultSort((s) => (s === "high" ? "low" : "high"))}
            loading={loading}
            emptyLabel="No consultation types yet."
          />
          <CountCard
            title="Lead Source"
            rows={leadRows}
            sort={leadSort}
            onToggleSort={() => setLeadSort((s) => (s === "high" ? "low" : "high"))}
            loading={loading}
            emptyLabel="No lead sources yet."
          />
        </div>
      )}
    </section>
  );
}

/** One appointment stat card (blue, number + label + icon). */
function StatCard({ value, label, icon }: { value: number | string; label: string; icon: string }) {
  return (
    <div className="flex h-[170px] flex-col justify-between overflow-hidden rounded-[24px] bg-brand p-6">
      <div className="flex flex-col gap-[4px]">
        <span className="font-inter text-[34px] font-bold leading-[40px] text-white">{value}</span>
        <span className="font-inter text-[16px] font-medium leading-[22px] text-white">{label}</span>
      </div>
      <Image src={icon} alt="" width={32} height={32} className="size-8" />
    </div>
  );
}

/** One pill in the segmented tab control. */
function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`whitespace-nowrap rounded-full px-[20px] py-[9px] font-inter text-[14px] font-semibold transition-colors ${
        active ? "bg-brand text-white" : "text-[#727783] hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

/** The "Doctor Performance" tab: a search box + a per-doctor counts table. */
function DoctorPerformance({
  rows,
  query,
  onQueryChange,
  loading,
}: {
  rows: DoctorRow[];
  query: string;
  onQueryChange: (q: string) => void;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full sm:w-[340px]">
        <Image
          src="/clinic/search.svg"
          alt=""
          width={24}
          height={24}
          className="pointer-events-none absolute left-4 top-1/2 size-6 -translate-y-1/2"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search doctor name"
          aria-label="Search doctor name"
          className="h-[54px] w-full rounded-full border-[1.167px] border-field-border bg-white pl-[52px] pr-4 font-inter text-[16px] text-ink outline-none placeholder:text-field-placeholder focus:border-brand"
        />
      </div>

      <div className="overflow-x-auto rounded-[24px] border-[1.2px] border-field-border bg-white">
        <div className={`grid ${DOC_COLS} min-w-[720px] border-b-[1.2px] border-[rgba(194,198,212,0.5)]`}>
          <span className="px-6 py-5 font-inter text-[13px] font-semibold uppercase leading-[17px] tracking-[0.5px] text-[#727783]">
            Doctor Name
          </span>
          {DOCTOR_COLUMNS.map((c) => (
            <span
              key={c.key}
              className="px-3 py-5 font-inter text-[13px] font-semibold uppercase leading-[17px] tracking-[0.5px] text-[#727783]"
            >
              {c.header}
            </span>
          ))}
        </div>

        {loading ? (
          <p className="px-6 py-8 font-inter text-[16px] text-ink/60">Loading analytics…</p>
        ) : rows.length === 0 ? (
          <p className="px-6 py-8 font-inter text-[16px] text-ink/60">
            {query.trim() ? "No doctors match your search." : "No doctors yet."}
          </p>
        ) : (
          rows.map((r) => (
            <div
              key={r.id}
              className={`grid ${DOC_COLS} min-w-[720px] items-center border-b-[1.2px] border-[rgba(194,198,212,0.5)] last:border-b-0`}
            >
              <span className="px-6 py-5 font-inter text-[15px] font-medium leading-[21px] text-ink">
                {r.name}
              </span>
              {DOCTOR_COLUMNS.map((c) => (
                <span
                  key={c.key}
                  className="px-3 py-5 font-inter text-[15px] font-medium leading-[21px] text-ink"
                >
                  {r.counts[c.key]}
                </span>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** An appointment-counts card: a title + a sort toggle, then `label → count` rows. */
function CountCard({
  title,
  rows,
  sort,
  onToggleSort,
  loading,
  emptyLabel,
}: {
  title: string;
  rows: { label: string; count: number }[];
  sort: SortDir;
  onToggleSort: () => void;
  loading: boolean;
  emptyLabel: string;
}) {
  const sortLabel = sort === "low" ? "Low to High" : "High to Low";
  return (
    <div className="flex flex-col gap-[20px] rounded-[24px] border-[1.2px] border-field-border bg-white p-[26px]">
      <div className="flex items-start gap-[16px]">
        <div className="flex-1">
          <h3 className="font-inter text-[18px] font-bold uppercase leading-[24px] tracking-[0.4px] text-ink">
            {title}
          </h3>
          <p className="mt-[3px] font-inter text-[14px] leading-[20px] text-[#727783]">Appointment Counts</p>
        </div>
        <button
          type="button"
          onClick={onToggleSort}
          aria-label={`Sort ${sortLabel}`}
          className="group relative flex size-[48px] shrink-0 items-center justify-center rounded-full border-[1.4px] border-field-border text-ink transition-colors hover:border-brand hover:text-brand"
        >
          <SortIcon dir={sort} className="size-6" />
          <Tip label={sortLabel} below />
        </button>
      </div>
      <div className="flex flex-col gap-[14px]">
        {loading ? (
          <p className="py-6 font-inter text-[15px] text-ink/60">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 font-inter text-[15px] text-ink/60">{emptyLabel}</p>
        ) : (
          rows.map((r) => (
            <div
              key={r.label}
              className="flex items-center justify-between rounded-[14px] border-[1.2px] border-field-border px-[22px] py-[18px]"
            >
              <span className="font-inter text-[16px] leading-[22px] text-ink">{r.label}</span>
              <span className="font-inter text-[22px] font-bold leading-[26px] text-brand">{r.count}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** Sort-direction glyph (ascending bars for low→high, descending for high→low). */
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
