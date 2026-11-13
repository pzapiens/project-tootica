"use client";

import TablePagination from "@/components/TablePagination";

import { RevenueSkeleton } from "@/components/loading/PageSkeletons";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { apiFetch, type RevenueTransaction } from "@/lib/api";
import { frameRange } from "@/lib/analytics";
import { useAppointmentsRevision } from "@/lib/appointmentsBus";
import { statusBadgeClass } from "@/lib/statusColors";
import { Tip } from "@/components/HoverTip";
import DonutChart, { type DonutDatum } from "@/components/DonutChart";

import TimeframeFilter from "../dashboard/TimeframeFilter";
import { type Timeframe } from "../dashboard/mock";
import RevenueFilterPanel, {
  EMPTY_REVENUE_FILTERS,
  revenueFilterCount,
  type RevenueFilters,
} from "./RevenueFilterPanel";
import RevenueTrendChart from "./RevenueTrendChart";
import styles from "./revenue.module.css";

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

const TRANSACTION_COLUMNS = [
  { label: "Transaction ID", width: "15%" },
  { label: "Patient Name", width: "16%" },
  { label: "Consultation Type", width: "28%" },
  { label: "Amount", width: "11%" },
  { label: "Payment Status", width: "14%" },
  { label: "Date", width: "16%" },
];

export default function RevenueClient() {
  const rev = useAppointmentsRevision();

  const [items, setItems] = useState<RevenueTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const [cardsTf, setCardsTf] = useState<Timeframe>({ kind: "all" });
  const [txTf, setTxTf] = useState<Timeframe>({ kind: "all" });
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
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
        if (active) {
          // Keep displayed dates, filtering, sorting and exports on the same
          // payment-entry date used by the revenue trend.
          setItems(list.map((transaction) => ({
            ...transaction,
            date: transaction.recordedAt ?? transaction.date,
          })));
        }
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

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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

  if (loading) return <RevenueSkeleton />;

  // The Apply Filter panel replaces the whole content area (Figma "Revenue2 - Filter").
  if (filterOpen) {
    return (
      <RevenueFilterPanel
        applied={filters}
        onApply={(next) => { setFilters(next); setPage(1); }}
        onClose={() => setFilterOpen(false)}
      />
    );
  }

  return (
    <div className="app-page flex flex-1 flex-col gap-[34px]">
      {/* Header */}
      <div className="app-toolbar flex shrink-0 items-center gap-[13px]">
        <h1 className="app-page-title flex-1 font-manrope text-[31px] font-bold leading-[39px] tracking-[-0.7px] text-[#1e1e24]">
          Revenue Summary
        </h1>
        <IconButton label="Export revenue to CSV" tip="Export" onClick={exportCsv} icon="/dashboard/download.svg" />
      </div>

      <div className="app-chart-grid grid shrink-0 grid-cols-1 gap-5 xl:grid-cols-2">
        <RevenueTrendChart transactions={items} loading={loading} />
        <section aria-label="Revenue breakdown" className="app-chart-card flex h-[420px] min-h-0 min-w-0 flex-col overflow-hidden rounded-[20px] border-[1.167px] border-black bg-white p-4 sm:p-5">
          <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-inter text-[14px] font-bold text-[#1e1e24]">
                Revenue Breakdown
              </h2>
              <p className="mt-1 font-inter text-[12px] leading-5 text-[#727783]">
                Received and pending revenue
              </p>
            </div>
            <TimeframeFilter align="end" timeframe={cardsTf} onChange={setCardsTf} />
          </div>
          <div className="flex min-h-0 flex-1 flex-col justify-start pt-3">
            {loading ? (
              <p className="py-5 font-inter text-[14px] text-[#94a3b8]">Loading…</p>
            ) : (
              <DonutChart
                data={revenuePie}
                onSelect={(key) => { setPieStatus((s) => (s === key ? null : key)); setPage(1); }}
                formatValue={(n) => inr.format(n)}
                formatCenter={inrCompact}
                totalLabel="Total Revenue"
                selectedKey={pieStatus}
                size={300}
                compact
              />
            )}
          </div>
        </section>
      </div>

      {/* Recent Transactions */}
      <div className="flex min-w-0 shrink-0 flex-col gap-[20px]">
        <div className="app-toolbar flex items-center gap-[13px]">
          <h2 className="flex-1 font-manrope text-[23px] font-bold leading-[30px] tracking-[-0.5px] text-[#1e1e24]">
            Recent Transactions
          </h2>
          <TimeframeFilter align="end" timeframe={txTf} onChange={(next) => { setTxTf(next); setPage(1); }} />
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
            className="pointer-events-none absolute left-[22px] top-1/2 size-5 -translate-y-1/2"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="Search here..."
            aria-label="Search transactions"
            className="app-search-input h-[40px] w-full rounded-[23px] border-[1.167px] border-black pl-[49px] pr-[17px] font-inter text-[14px] text-[#1e1e24] outline-none "
          />
        </div>

        {/* Active pie filter banner (from clicking a Revenue Breakdown segment). */}
        {pieStatus && (
          <div className="app-tabs flex w-fit shrink-0 items-center gap-[10px] rounded-full bg-[#e6f2fb] py-[8px] pl-[13px] pr-[10px]">
            <span className="font-inter text-[14px] text-[#0077c0]">
              Filtered by payment status: <span className="font-semibold">{pieStatus}</span>
            </span>
            <button
              type="button"
              onClick={() => { setPieStatus(null); setPage(1); }}
              aria-label="Clear payment status filter"
              className="flex size-[24px] items-center justify-center rounded-full text-[#0077c0] transition-colors hover:bg-[#0077c0]/10"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="size-4" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        )}

        {/* Pagination follows the naturally sized table, without an inner scroller. */}
        <div className={styles.tableAndPagination}>
          <div className={styles.tableFrame}>
            <table aria-label="Revenue transactions" className={styles.table}>
              <colgroup>
                {TRANSACTION_COLUMNS.map(column => <col key={column.label} style={{ width: column.width }} />)}
              </colgroup>
              <thead className="app-table-header">
                <tr>
                  {TRANSACTION_COLUMNS.map(column => (
                    <th key={column.label} scope="col" className={`${column.label === "Date" ? styles.dateColumn : ""} font-inter text-[13px] font-semibold uppercase leading-[17px] tracking-[0.4px]`}>
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={TRANSACTION_COLUMNS.length} className="font-inter text-[14px] text-[#94a3b8]">
                      {query.trim() || revenueFilterCount(filters) > 0 || pieStatus
                        ? "No transactions match your search."
                        : "No transactions yet."}
                    </td>
                  </tr>
                ) : pageRows.map(transaction => {
                  const status = transaction.paid ? "Received" : "Pending";
                  return (
                    <tr key={transaction.id}>
                      <td data-label="Transaction ID" className="font-inter text-[14px] font-medium text-[#1e1e24]">{transaction.code}</td>
                      <td data-label="Patient Name" className="font-inter text-[14px] font-medium text-[#1e1e24]">{transaction.patientName}</td>
                      <td data-label="Consultation Type" className="font-inter text-[14px] text-[#1e1e24]">
                        {transaction.consultationType ? titleCase(transaction.consultationType) : "--"}
                      </td>
                      <td data-label="Amount" className="font-inter text-[14px] font-medium text-[#1e1e24]">{inr.format(transaction.amount)}</td>
                      <td data-label="Payment Status">
                        <span className={`inline-block max-w-full rounded-full px-[clamp(2px,1vw,12px)] py-[4px] font-inter text-[13px] font-medium leading-[18px] ${statusBadgeClass(status)}`}>
                          {status}
                        </span>
                      </td>
                      <td data-label="Date" className={`${styles.dateColumn} font-inter text-[13px] text-[#727783]`}>{fmtDate(transaction.date)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TablePagination
            totalRecords={rows.length}
            currentPage={currentPage}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          />
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
      className="group relative flex size-[40px] shrink-0 items-center justify-center rounded-full border-[1.167px] border-black transition-colors"
    >
      <Image src={icon} alt="" width={28} height={28} className="size-5" />
      {badge > 0 && (
        <span className="absolute -right-[2px] -top-[2px] flex size-[22px] items-center justify-center rounded-full border-2 border-white bg-[#0077c0] font-inter text-[12px] font-semibold leading-none text-white">
          {badge}
        </span>
      )}
      <Tip label={tip ?? label} below />
    </button>
  );
}
