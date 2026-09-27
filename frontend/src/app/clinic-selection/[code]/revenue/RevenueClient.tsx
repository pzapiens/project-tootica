"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { apiFetch, type RevenueTransaction } from "@/lib/api";
import { frameRange } from "@/lib/analytics";
import { useAppointmentsRevision } from "@/lib/appointmentsBus";
import { statusBadgeClass } from "@/lib/statusColors";
import { Tip } from "@/components/HoverTip";
import DonutChart, { type DonutDatum } from "@/components/DonutChart";

import TimeframeFilter from "../dashboard/TimeframeFilter";
import { CONSULTATION_TYPES } from "../dashboard/AppointmentFormStep";
import { type Timeframe } from "../dashboard/mock";
import RevenueFilterPanel, {
  EMPTY_REVENUE_FILTERS,
  revenueFilterCount,
  type FilterOption,
  type RevenueFilters,
} from "./RevenueFilterPanel";

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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const p2 = (n: number) => String(n).padStart(2, "0");

/** ISO → "Oct 24, 09:30 AM". */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  const period = d.getHours() >= 12 ? "PM" : "AM";
  const h = d.getHours() % 12 || 12;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${p2(h)}:${p2(d.getMinutes())} ${period}`;
}

/** "TEETH WHITENING" → "Teeth Whitening". */
function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
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

/** Split a (possibly joined "A, B") consultation string into canonical values. */
function splitTypes(s: string | null): string[] {
  return (s ?? "").split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
}

// Header + every row share this grid template.
const COLS =
  "grid-cols-[minmax(0,150fr)_minmax(0,150fr)_minmax(0,165fr)_minmax(0,110fr)_minmax(0,120fr)_minmax(0,130fr)]";

export default function RevenueClient() {
  const rev = useAppointmentsRevision();

  const [items, setItems] = useState<RevenueTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const [cardsTf, setCardsTf] = useState<Timeframe>({ kind: "all" });
  const [txTf, setTxTf] = useState<Timeframe>({ kind: "all" });
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<RevenueFilters>(EMPTY_REVENUE_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  // Payment-status filter driven by clicking the breakdown pie ("Received" /
  // "Pending"); applies on top of the panel filters + search. Click the same
  // slice again to clear it.
  const [pieStatus, setPieStatus] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch<RevenueTransaction[]>("/revenue/transactions")
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
  }, [rev]);

  // Summary cards — totals within the header timeframe.
  const summary = useMemo(() => {
    const inTf = items.filter((t) => inRange(t.date, cardsTf));
    let generated = 0;
    let pending = 0;
    for (const t of inTf) {
      if (t.paid) generated += t.amount;
      else pending += t.amount;
    }
    return { generated, pending };
  }, [items, cardsTf]);

  // Revenue breakdown pie — generated (paid) vs pending (unpaid) amounts within
  // the header timeframe. Zero-value slices are dropped.
  const revenuePie = useMemo<DonutDatum[]>(
    () =>
      [
        { key: "Received", label: "Revenue Received", value: summary.generated },
        { key: "Pending", label: "Revenue Pending", value: summary.pending },
      ].filter((d) => d.value > 0),
    [summary],
  );

  // The filter offers the app's full canonical consultation-type list (not just
  // the types present in the revenue data), matching the appointments filter.
  const consultationOptions = useMemo<FilterOption[]>(
    () => CONSULTATION_TYPES.map((c) => ({ value: c, label: titleCase(c) })),
    [],
  );

  // Transactions table — timeframe + search + facet filters, then sort.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const statusSet = new Set(filters.paymentStatuses);
    const consultSet = new Set(filters.consultationTypes);

    let out = items.filter((t) => {
      if (!inRange(t.date, txTf)) return false;
      if (q && !t.code.toLowerCase().includes(q) && !t.patientName.toLowerCase().includes(q)) return false;
      if (pieStatus && (t.paid ? "Received" : "Pending") !== pieStatus) return false;
      if (statusSet.size > 0 && !statusSet.has(t.paid ? "Received" : "Pending")) return false;
      if (consultSet.size > 0 && !splitTypes(t.consultationType).some((c) => consultSet.has(c))) return false;
      return true;
    });

    out = [...out].sort((a, b) => {
      // ID sorting overrides the default; otherwise newest date first.
      if (filters.idSort) {
        const cmp = a.code.localeCompare(b.code);
        return filters.idSort === "asc" ? cmp : -cmp;
      }
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    return out;
  }, [items, query, txTf, filters, pieStatus]);

  function exportCsv() {
    const header = ["Transaction ID", "Patient Name", "Consultation Type", "Amount", "Payment Status", "Date"];
    const lines = rows.map((t) =>
      [
        t.code,
        t.patientName,
        t.consultationType ? titleCase(t.consultationType) : "--",
        String(t.amount),
        t.paid ? "Received" : "Pending",
        fmtDate(t.date),
      ]
        .map(csvCell)
        .join(","),
    );
    const csv = [header.join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `revenue-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // The Apply Filter panel replaces the whole content area (Figma "Revenue2 - Filter").
  if (filterOpen) {
    return (
      <RevenueFilterPanel
        applied={filters}
        consultationOptions={consultationOptions}
        onApply={setFilters}
        onClose={() => setFilterOpen(false)}
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-[40px]">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-[16px]">
        <h1 className="flex-1 font-manrope text-[35px] font-bold leading-[44px] tracking-[-0.7px] text-[#1e1e24]">
          Revenue Summary
        </h1>
        <IconButton label="Export revenue to CSV" tip="Export" onClick={exportCsv} icon="/dashboard/download.svg" />
        <TimeframeFilter timeframe={cardsTf} onChange={setCardsTf} />
      </div>

      {/* Revenue breakdown pie (replaces the summary cards). A single chart, so it
          sits on the left at a bounded width rather than stretching the page. */}
      <div className="flex w-full max-w-[680px] shrink-0 flex-col gap-[24px] rounded-[28px] border-[1.2px] border-[#c2c6d4] bg-white p-[28px]">
        <div>
          <h2 className="font-inter text-[18px] font-bold uppercase leading-[24px] tracking-[0.4px] text-[#1e1e24]">
            Revenue Breakdown :
          </h2>
          <p className="mt-[3px] font-inter text-[14px] leading-[20px] text-[#727783]">
            Breakdown of received and pending revenue
          </p>
        </div>
        {loading ? (
          <p className="py-6 font-inter text-[15px] text-[#94a3b8]">Loading…</p>
        ) : (
          <DonutChart
            data={revenuePie}
            onSelect={(key) => setPieStatus((s) => (s === key ? null : key))}
            formatValue={(n) => inr.format(n)}
            formatCenter={inrCompact}
            totalLabel="Total Revenue"
            selectedKey={pieStatus}
            size={300}
          />
        )}
      </div>

      {/* Recent Transactions */}
      <div className="flex min-h-0 flex-1 flex-col gap-[24px]">
        <div className="flex items-center gap-[16px]">
          <h2 className="flex-1 font-manrope text-[26px] font-bold leading-[34px] tracking-[-0.5px] text-[#1e1e24]">
            Recent Transactions
          </h2>
          <TimeframeFilter timeframe={txTf} onChange={setTxTf} />
          <IconButton
            label="Filter transactions"
            tip="Filter"
            onClick={() => setFilterOpen(true)}
            icon="/dashboard/filter_alt.svg"
            badge={revenueFilterCount(filters)}
          />
        </div>

        {/* Search */}
        <div className="relative w-full max-w-[540px]">
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
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search here..."
            aria-label="Search transactions"
            className="h-[54px] w-full rounded-[27px] border-[1.2px] border-[#c2c6d4] pl-[58px] pr-[20px] font-inter text-[16px] text-[#1e1e24] outline-none placeholder:text-[#94a3b8] focus:border-[#0077c0]"
          />
        </div>

        {/* Active pie filter banner (from clicking a Revenue Breakdown segment). */}
        {pieStatus && (
          <div className="flex w-fit shrink-0 items-center gap-[10px] rounded-full bg-[#e6f2fb] py-[8px] pl-[16px] pr-[10px]">
            <span className="font-inter text-[14px] text-[#0077c0]">
              Filtered by payment status: <span className="font-semibold">{pieStatus}</span>
            </span>
            <button
              type="button"
              onClick={() => setPieStatus(null)}
              aria-label="Clear payment status filter"
              className="flex size-[24px] items-center justify-center rounded-full text-[#0077c0] transition-colors hover:bg-[#0077c0]/10"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="size-4" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        )}

        {/* Table */}
        <div className="flex flex-col overflow-hidden rounded-[20px] border-[1.2px] border-[#c2c6d4] bg-white">
          {/* Header + body share ONE scroll container so their columns line up —
              a body-only scrollbar would shift the rows relative to the header.
              The header is sticky so it stays put while the body scrolls. */}
          <div className="max-h-[547px] overflow-y-auto">
          <div className={`sticky top-0 z-10 grid ${COLS} items-center border-b-[1.2px] border-[rgba(194,198,212,0.5)] bg-white`}>
            {["Transaction ID", "Patient Name", "Consultation Type", "Amount", "Payment Status", "Date"].map((h) => (
              <span
                key={h}
                className="px-[20px] py-[20px] font-inter text-[13px] font-semibold uppercase leading-[17px] tracking-[0.4px] text-[#727783]"
              >
                {h}
              </span>
            ))}
          </div>

          {loading ? (
            <p className="px-[20px] py-10 font-inter text-[16px] text-[#94a3b8]">Loading transactions…</p>
          ) : rows.length === 0 ? (
            <p className="px-[20px] py-10 font-inter text-[16px] text-[#94a3b8]">
              {query.trim() || revenueFilterCount(filters) > 0 || pieStatus
                ? "No transactions match your search."
                : "No transactions yet."}
            </p>
          ) : (
            rows.map((t) => {
              const status = t.paid ? "Received" : "Pending";
              return (
                <div
                  key={t.id}
                  className={`grid ${COLS} items-center border-b-[1.2px] border-[rgba(194,198,212,0.5)] last:border-b-0`}
                >
                  <span className="px-[20px] py-[22px] font-inter text-[15px] font-medium text-[#1e1e24]">{t.code}</span>
                  <span className="px-[20px] py-[22px] font-inter text-[15px] font-medium text-[#1e1e24]">{t.patientName}</span>
                  <span className="px-[20px] py-[22px] font-inter text-[14px] text-[#1e1e24]">
                    {t.consultationType ? titleCase(t.consultationType) : "--"}
                  </span>
                  <span className="px-[20px] py-[22px] font-inter text-[15px] font-medium text-[#1e1e24]">{inr.format(t.amount)}</span>
                  <div className="px-[20px] py-[22px]">
                    <span
                      className={`inline-flex rounded-full px-[12px] py-[4px] font-inter text-[13px] font-medium leading-[18px] ${statusBadgeClass(status)}`}
                    >
                      {status}
                    </span>
                  </div>
                  <span className="px-[20px] py-[22px] font-inter text-[13px] text-[#727783]">{fmtDate(t.date)}</span>
                </div>
              );
            })
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Circular outlined icon button used in the header + transactions toolbar. */
function IconButton({
  label,
  tip,
  onClick,
  icon,
  badge = 0,
}: {
  label: string;
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
      className="group relative flex size-[54px] shrink-0 items-center justify-center rounded-full border-[1.4px] border-[#c2c6d4] transition-colors hover:border-[#0077c0]"
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
