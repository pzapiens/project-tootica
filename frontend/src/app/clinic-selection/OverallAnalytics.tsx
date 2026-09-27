"use client";

import { useEffect, useMemo, useState } from "react";

import {
  apiFetch,
  type AppointmentListItem,
  type DoctorSummary,
  type RevenueTransaction,
} from "@/lib/api";
import { frameRange } from "@/lib/analytics";
import DonutChart, { type DonutDatum } from "@/components/DonutChart";

import BranchFilter, { type BranchOption } from "./BranchFilter";
import { type Branch } from "./BranchList";
import TimeFilter, { type TimeFrame } from "./TimeFilter";

/**
 * "Overall Analytics" section shown below the branch list on the clinic-selection
 * page (clinic admins only). It mirrors the in-clinic Analytics + Revenue pages'
 * pie-chart UI — Doctor Performance and a Revenue Breakdown — but aggregated
 * across the whole clinic.
 *
 * A shared **All Branch** + **All-Time** filter (both defaults) scopes every
 * chart: with the defaults every appointment/transaction from the beginning of
 * time is summed across all branches; narrowing the branch scopes by each
 * appointment's doctor's branch (unassigned rows drop out) and the timeframe
 * clips by date. One clinic-wide fetch feeds all charts; everything filters
 * client-side.
 */

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Compact INR for the donut centre, e.g. "₹1.25 L" / "₹3.40 Cr" / "₹5.6K". */
function inrCompact(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return `₹${n}`;
}

/** Whether an ISO instant falls inside a timeframe (all-time → always true). */
function inRange(iso: string, tf: TimeFrame): boolean {
  const r = frameRange(tf);
  if (!r) return true;
  const t = new Date(iso).getTime();
  return t >= r.from.getTime() && t <= r.to.getTime();
}

/** The Doctor Performance pie's status slices (mirrors the in-clinic Analytics
 *  page): each partitions the total, so together they fill the ring. */
const DOCTOR_STATUS_SLICES: { label: string; match: AppointmentListItem["status"] }[] = [
  { label: "Pending", match: "CONFIRMED" },
  { label: "On going", match: "ONGOING" },
  { label: "Completed", match: "COMPLETED" },
  { label: "No Show", match: "NO_SHOW" },
  { label: "Cancelled", match: "CANCELLED" },
];

type Tab = "doctor" | "revenue";

export default function OverallAnalytics({ branches }: { branches: Branch[] }) {
  const [tab, setTab] = useState<Tab>("doctor");
  // Defaults: All Branch + All-Time — the section opens showing every branch's
  // data from the beginning of time until the filters are narrowed.
  const [branchId, setBranchId] = useState("all");
  const [timeFrame, setTimeFrame] = useState<TimeFrame>({ kind: "all" });

  const [items, setItems] = useState<AppointmentListItem[]>([]);
  const [doctors, setDoctors] = useState<DoctorSummary[]>([]);
  const [transactions, setTransactions] = useState<RevenueTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<AppointmentListItem[]>("/appointments?limit=500"),
      apiFetch<DoctorSummary[]>("/doctors"),
      apiFetch<RevenueTransaction[]>("/revenue/transactions"),
    ])
      .then(([appts, docs, tx]) => {
        if (!active) return;
        // Pending (SCHEDULED) WhatsApp bookings live in their own popup until
        // accepted, so they're excluded from analytics — matching the dashboard.
        setItems(appts.filter((a) => a.status !== "SCHEDULED"));
        setDoctors(docs);
        setTransactions(tx);
      })
      .catch(() => {
        if (!active) return;
        setItems([]);
        setDoctors([]);
        setTransactions([]);
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

  const filteredTx = useMemo(
    () =>
      transactions.filter((t) => {
        if (!inRange(t.date, timeFrame)) return false;
        if (branchId !== "all" && t.branchId !== branchId) return false;
        return true;
      }),
    [transactions, timeFrame, branchId],
  );

  // Doctor Performance — appointment-status breakdown; zero-count slices dropped.
  const doctorPie = useMemo<DonutDatum[]>(
    () =>
      DOCTOR_STATUS_SLICES.map((s) => ({
        key: s.label,
        label: s.label,
        value: filtered.filter((a) => a.status === s.match).length,
      })).filter((d) => d.value > 0),
    [filtered],
  );

  // Revenue breakdown — generated (paid) vs pending (unpaid) amounts.
  const revenuePie = useMemo<DonutDatum[]>(() => {
    let generated = 0;
    let pending = 0;
    for (const t of filteredTx) {
      if (t.paid) generated += t.amount;
      else pending += t.amount;
    }
    return [
      { key: "Completed", label: "Revenue Received", value: generated },
      { key: "Pending", label: "Revenue Pending", value: pending },
    ].filter((d) => d.value > 0);
  }, [filteredTx]);

  return (
    <section className="mt-4 flex shrink-0 flex-col gap-[24px] md:mt-8">
      <h2 className="font-inter text-[23.333px] font-semibold leading-[32.667px] text-ink">
        Overall Analytics
      </h2>

      {/* Tabs */}
      <div className="flex w-fit max-w-full items-center gap-[6px] overflow-x-auto rounded-full border-[1.2px] border-field-border p-[5px]">
        <TabButton label="Appointments" active={tab === "doctor"} onClick={() => setTab("doctor")} />
        <TabButton label="Revenue" active={tab === "revenue"} onClick={() => setTab("revenue")} />
      </div>

      {/* Shared filters (default All Branch + All-Time) */}
      <div className="flex flex-wrap items-center gap-3">
        <BranchFilter options={options} selectedId={branchId} onSelect={setBranchId} />
        <TimeFilter value={timeFrame} onChange={setTimeFrame} />
      </div>

      {tab === "doctor" && (
        <div className="grid grid-cols-1 gap-[28px] xl:grid-cols-2">
          <ChartCard
            title="Appointments :"
            subtitle="Appointments by status across the clinic."
            loading={loading}
            data={doctorPie}
          />
        </div>
      )}

      {tab === "revenue" && (
        <div className="grid grid-cols-1 gap-[28px] xl:grid-cols-2">
          <ChartCard
            title="Revenue :"
            subtitle="Breakdown of received and pending revenue"
            loading={loading}
            data={revenuePie}
            formatValue={(n) => inr.format(n)}
            formatCenter={inrCompact}
            totalLabel="Total Revenue"
            emptyLabel="No revenue recorded yet."
          />
        </div>
      )}
    </section>
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

/** A bordered analytics card: title + hint, then the shared donut chart. Matches
 *  the in-clinic Analytics / Revenue pages' chart cards. The overview charts are
 *  read-only (no drill-down — there's no clinic route to open from here). */
function ChartCard({
  title,
  subtitle,
  loading,
  data,
  formatValue,
  formatCenter,
  totalLabel,
  emptyLabel,
}: {
  title: string;
  subtitle: string;
  loading: boolean;
  data: DonutDatum[];
  formatValue?: (n: number) => string;
  formatCenter?: (n: number) => string;
  totalLabel?: string;
  emptyLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-[24px] rounded-[28px] border-[1.2px] border-field-border bg-white p-[28px]">
      <div>
        <h3 className="font-inter text-[18px] font-bold uppercase leading-[24px] tracking-[0.4px] text-ink">
          {title}
        </h3>
        <p className="mt-[3px] font-inter text-[14px] leading-[20px] text-[#727783]">{subtitle}</p>
      </div>
      {loading ? (
        <p className="py-6 font-inter text-[15px] text-[#94a3b8]">Loading…</p>
      ) : (
        <DonutChart
          data={data}
          onSelect={() => {}}
          formatValue={formatValue}
          formatCenter={formatCenter}
          totalLabel={totalLabel}
          emptyLabel={emptyLabel}
        />
      )}
    </div>
  );
}
