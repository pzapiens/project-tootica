"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { apiFetch, type RevenueTransaction } from "@/lib/api";
import { frameRange } from "@/lib/analytics";
import { useAppointmentsRevision } from "@/lib/appointmentsBus";
import { statusBadgeClass } from "@/lib/statusColors";
import { Tip } from "@/components/HoverTip";

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
      if (statusSet.size > 0 && !statusSet.has(t.paid ? "Completed" : "Pending")) return false;
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
  }, [items, query, txTf, filters]);

  function exportCsv() {
    const header = ["Transaction ID", "Patient Name", "Consultation Type", "Amount", "Payment Status", "Date"];
    const lines = rows.map((t) =>
      [
        t.code,
        t.patientName,
        t.consultationType ? titleCase(t.consultationType) : "--",
        String(t.amount),
        t.paid ? "Completed" : "Pending",
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

      {/* Summary cards */}
      <div className="grid shrink-0 grid-cols-1 gap-[28px] md:grid-cols-2">
        <SummaryCard
          amount={loading ? null : summary.generated}
          label="Total Revenue Generated"
          icon="check"
        />
        <SummaryCard
          amount={loading ? null : summary.pending}
          label="Total Revenue Pending"
          icon="hourglass"
        />
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
            placeholder="Search transactions by id and Patient name"
            aria-label="Search transactions"
            className="h-[54px] w-full rounded-[27px] border-[1.2px] border-[#c2c6d4] pl-[58px] pr-[20px] font-inter text-[16px] text-[#1e1e24] outline-none placeholder:text-[#94a3b8] focus:border-[#0077c0]"
          />
        </div>

        {/* Table */}
        <div className="flex flex-col overflow-hidden rounded-[20px] border-[1.2px] border-[#c2c6d4] bg-white">
          <div className={`grid ${COLS} items-center border-b-[1.2px] border-[rgba(194,198,212,0.5)]`}>
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
              {query.trim() || revenueFilterCount(filters) > 0
                ? "No transactions match your search."
                : "No transactions yet."}
            </p>
          ) : (
            rows.map((t) => {
              const status = t.paid ? "Completed" : "Pending";
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
  );
}

/** A big blue revenue stat card (amount + label + icon). */
function SummaryCard({
  amount,
  label,
  icon,
}: {
  amount: number | null;
  label: string;
  icon: "check" | "hourglass";
}) {
  return (
    <div className="flex h-[224px] flex-col justify-between overflow-hidden rounded-[28px] bg-[#0077c0] p-[28px]">
      <div className="flex flex-col gap-[6px]">
        <span className="font-inter text-[42px] font-bold leading-[46.667px] text-white">
          {amount === null ? "—" : inr.format(amount)}
        </span>
        <span className="font-inter text-[18.667px] font-medium leading-[28px] text-white">{label}</span>
      </div>
      <div className="flex items-end">
        {icon === "check" ? (
          <CheckCircle className="size-10 text-white" />
        ) : (
          <Image
            src="/dashboard/stat_hourglass_empty.svg"
            alt=""
            width={40}
            height={40}
            className="size-10 [filter:brightness(0)_invert(1)]"
          />
        )}
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

function CheckCircle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
