"use client";

import { useMemo, useState } from "react";
import { searchTreatments } from "@/lib/treatments";

/**
 * Apply Filter panel for the Revenue page (Figma "Revenue2 - Filter"): a
 * full-content panel that replaces the page while open — ID Sorting
 * (Ascending / Descending), a Payment Status chip group (Received / Pending),
 * and a Consultation Type checkbox list. Selections are STAGED and only take
 * effect on "Apply Filters"; "Clear Filters" clears the draft + applied filters.
 */

export interface RevenueFilters {
  /** Sort by transaction ID/code. */
  idSort: "asc" | "desc" | null;
  /** Selected payment-status labels ("Received" / "Pending"). */
  paymentStatuses: string[];
  /** Selected consultation types (raw upper-case values). */
  consultationTypes: string[];
}

export const EMPTY_REVENUE_FILTERS: RevenueFilters = {
  idSort: null,
  paymentStatuses: [],
  consultationTypes: [],
};

/** Number of active filter facets — drives the header filter badge. */
export function revenueFilterCount(f: RevenueFilters): number {
  return (f.idSort ? 1 : 0) + f.paymentStatuses.length + f.consultationTypes.length;
}

const PAYMENT_STATUSES = ["Received", "Pending"] as const;

export default function RevenueFilterPanel({
  applied,
  onApply,
  onClose,
}: {
  applied: RevenueFilters;
  onApply: (f: RevenueFilters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<RevenueFilters>(applied);
  const [treatmentQuery, setTreatmentQuery] = useState("");
  const visibleTreatments = useMemo(() => searchTreatments(treatmentQuery), [treatmentQuery]);

  const toggle = (key: "paymentStatuses" | "consultationTypes", value: string) =>
    setDraft((d) => {
      const set = new Set(d[key]);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return { ...d, [key]: [...set] };
    });

  return (
    <div className="app-filter-page">
      {/* Header */}
      <div className="app-toolbar flex shrink-0 items-center gap-[13px] border-b-[1.167px] border-black pb-[20px]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close filter"
          className="flex size-[36px] items-center justify-center rounded-full text-[#1e1e24] transition-colors hover:bg-[#f1f5f9]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="size-5" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <h1 className="font-manrope text-[23px] font-bold leading-[30px] tracking-[-0.5px] text-[#1e1e24]">
          Apply Filter
        </h1>
      </div>

      {/* Two-column facet grid */}
      <div className="app-filter-grid items-start gap-[24px] pt-[24px]">
        <div className="flex flex-col gap-[24px]">
          {/* ID Sorting */}
          <FacetCard icon="sort" title="ID Sorting">
            <div className="app-toolbar gap-[13px]">
              <SortCheckbox
                label="Ascending"
                arrow="up"
                checked={draft.idSort === "asc"}
                onClick={() => setDraft((d) => ({ ...d, idSort: d.idSort === "asc" ? null : "asc" }))}
              />
              <SortCheckbox
                label="Descending"
                arrow="down"
                checked={draft.idSort === "desc"}
                onClick={() => setDraft((d) => ({ ...d, idSort: d.idSort === "desc" ? null : "desc" }))}
              />
            </div>
          </FacetCard>

          {/* Payment Status */}
          <FacetCard icon="status" title="Payment Status">
            <div className="flex flex-wrap gap-[12px]">
              {PAYMENT_STATUSES.map((s) => {
                const active = draft.paymentStatuses.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggle("paymentStatuses", s)}
                    className={`rounded-[8px] border-[1.167px] px-[15px] py-[9px] font-inter text-[14px] font-medium transition-colors ${
                      active
                        ? "border-[#0077c0] bg-[#0077c0] text-white"
                        : "border-black text-[#1e1e24] app-option-hover"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </FacetCard>
        </div>

        {/* Same treatment catalogue and search as the Appointments filter. */}
        <FacetCard icon="tooth" title="Reason for visit / Treatment">
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute left-[16px] top-1/2 size-5 -translate-y-1/2 text-[#1e1e24]" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              type="search"
              value={treatmentQuery}
              onChange={(e) => setTreatmentQuery(e.target.value)}
              placeholder="Search treatments, e.g. RCT..."
              aria-label="Search reasons for visit or treatments"
              className="app-search-input h-[44px] w-full rounded-full border-[1.167px] border-black pl-[42px] pr-[14px] font-inter text-[14px] text-[#1e1e24] outline-none"
            />
          </div>
          <div className="flex max-h-[220px] flex-col gap-[12px] overflow-y-auto pt-[6px]">
            {visibleTreatments.length === 0 ? (
              <span role="status" className="font-inter text-[13px] text-[#94a3b8]">No treatments found. Try a broader term.</span>
            ) : (
              visibleTreatments.map((o) => {
                const checked = draft.consultationTypes.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggle("consultationTypes", o.value)}
                    className={`flex items-center justify-between gap-[12px] rounded-[10px] border-[1.167px] px-[13px] py-[13px] text-left transition-colors ${
                      checked ? "border-[#0077c0] bg-[#0077c0]/5" : "border-black"
                    }`}
                  >
                    <span className="font-inter text-[14px] text-[#1e1e24]">{o.label}</span>
                    <span
                      className={`flex size-[16px] shrink-0 items-center justify-center rounded-[3px] border-[1.167px] ${
                        checked ? "border-[#0077c0] bg-[#0077c0]" : "border-black bg-white"
                      }`}
                    >
                      {checked && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="size-[10px]" aria-hidden>
                          <path d="M5 12l5 5L20 7" />
                        </svg>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </FacetCard>
      </div>

      {/* Footer */}
      <div className="app-toolbar mt-auto flex shrink-0 items-center justify-end gap-[24px] border-t-[1.167px] border-black pt-[20px]">
        <button
          type="button"
          onClick={() => setDraft(EMPTY_REVENUE_FILTERS)}
          className="font-inter text-[13px] font-semibold tracking-[0.3px] text-[#727783] transition-colors hover:text-[#1e1e24]"
        >
          Clear Filters
        </button>
        <button
          type="button"
          onClick={() => {
            onApply(draft);
            onClose();
          }}
          className="rounded-[50px] bg-[#0077c0] px-[24px] py-[12px] font-inter text-[13px] font-semibold uppercase tracking-[0.6px] text-white transition-colors hover:bg-[#0069a8]"
        >
          Apply Filters
        </button>
      </div>
    </div>
  );
}

/** A bordered facet card with an icon + title header. */
function FacetCard({
  icon,
  title,
  children,
}: {
  icon: "sort" | "status" | "tooth";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[13px] border-[1.167px] border-black p-[20px]">
      <div className="flex items-center gap-[10px] pb-[15px]">
        <FacetIcon kind={icon} />
        <h2 className="font-manrope text-[17px] font-semibold leading-[23px] text-[#1e1e24]">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function FacetIcon({ kind }: { kind: "sort" | "status" | "tooth" }) {
  const cls = "size-6 text-[#1e1e24]";
  if (kind === "sort") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cls} aria-hidden>
        <path d="M4 6h13M4 12h9M4 18h5" />
      </svg>
    );
  }
  if (kind === "status") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls} aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden>
      <path d="M7 3c-2 0-3 1.5-3 4 0 1.5.5 3 1 5s.5 5 1.5 8c.4 1.2 1.6 1.2 2-.2.4-1.5.5-3.5 2.5-3.5s2.1 2 2.5 3.5c.4 1.4 1.6 1.4 2 .2 1-3 1-6 1.5-8s1-3.5 1-5c0-2.5-1-4-3-4-1.5 0-2.5 1-4 1s-2.5-1-4-1Z" />
    </svg>
  );
}

/** A bordered checkbox pill with a directional arrow (Ascending / Descending). */
function SortCheckbox({
  label,
  arrow,
  checked,
  onClick,
}: {
  label: string;
  arrow: "up" | "down";
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center gap-[10px] rounded-[10px] border-[1.167px] px-[13px] py-[14px] transition-colors ${
        checked ? "border-[#0077c0] bg-[#e6f2fb]" : "border-black"
      }`}
    >
      <span
        className={`flex size-[18px] items-center justify-center rounded-[4px] border-[1.167px] ${
          checked ? "border-[#0077c0] bg-[#0077c0]" : "border-black"
        }`}
      >
        {checked && (
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-3" aria-hidden>
            <path d="M5 12l5 5L20 7" />
          </svg>
        )}
      </span>
      <span className="flex-1 text-left font-inter text-[14px] font-medium text-[#1e1e24]">{label}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="#1e1e24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
        {arrow === "down" ? <path d="M12 5v14M6 13l6 6 6-6" /> : <path d="M12 19V5M6 11l6-6 6 6" />}
      </svg>
    </button>
  );
}
