"use client";

import { useState } from "react";

/**
 * Apply Filter panel for the Revenue page (Figma "Revenue2 - Filter"): a
 * full-content panel that replaces the page while open — ID Sorting
 * (Ascending / Descending), a Payment Status chip group (Completed / Pending),
 * and a Consultation Type checkbox list. Selections are STAGED and only take
 * effect on "Apply Filters"; "Clear Filters" clears the draft + applied filters.
 */

export interface RevenueFilters {
  /** Sort by transaction ID/code. */
  idSort: "asc" | "desc" | null;
  /** Selected payment-status labels ("Completed" / "Pending"). */
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

const PAYMENT_STATUSES = ["Completed", "Pending"] as const;

export interface FilterOption {
  value: string;
  label: string;
}

export default function RevenueFilterPanel({
  applied,
  consultationOptions,
  onApply,
  onClose,
}: {
  applied: RevenueFilters;
  consultationOptions: FilterOption[];
  onApply: (f: RevenueFilters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<RevenueFilters>(applied);

  const toggle = (key: "paymentStatuses" | "consultationTypes", value: string) =>
    setDraft((d) => {
      const set = new Set(d[key]);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return { ...d, [key]: [...set] };
    });

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-[16px] border-b-[1.2px] border-[rgba(194,198,212,0.5)] pb-[24px]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close filter"
          className="flex size-[36px] items-center justify-center rounded-full text-[#1e1e24] transition-colors hover:bg-[#f1f5f9]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="size-6" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <h1 className="font-manrope text-[26px] font-bold leading-[34px] tracking-[-0.5px] text-[#1e1e24]">
          Apply Filter
        </h1>
      </div>

      {/* Two-column facet grid */}
      <div className="grid grid-cols-1 items-start gap-[28px] pt-[28px] lg:grid-cols-2">
        <div className="flex flex-col gap-[28px]">
          {/* ID Sorting */}
          <FacetCard icon="sort" title="ID Sorting">
            <div className="flex gap-[16px]">
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
                    className={`rounded-[8px] border px-[18px] py-[9px] font-inter text-[14px] font-medium transition-colors ${
                      active
                        ? "border-[#0077c0] bg-[#0077c0] text-white"
                        : "border-[#c2c6d4] text-[#1e1e24] hover:border-[#0077c0]"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </FacetCard>
        </div>

        {/* Consultation Type */}
        <FacetCard icon="tooth" title="Consultation Type">
          {consultationOptions.length === 0 ? (
            <p className="font-inter text-[14px] text-[#94a3b8]">No consultation types yet.</p>
          ) : (
            // Cap at ~5 rows; the rest scroll inside the card so the page itself
            // doesn't grow a scrollbar.
            <div className="flex max-h-[290px] flex-col gap-[12px] overflow-y-auto pr-[6px]">
              {consultationOptions.map((o) => {
                const checked = draft.consultationTypes.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggle("consultationTypes", o.value)}
                    className="flex items-center justify-between rounded-[8px] border border-[#c2c6d4] px-[18px] py-[13px] text-left transition-colors hover:border-[#0077c0]"
                  >
                    <span className="font-inter text-[15px] text-[#1e1e24]">{o.label}</span>
                    <span
                      className={`flex size-[18px] items-center justify-center rounded-[4px] border ${
                        checked ? "border-[#0077c0] bg-[#0077c0]" : "border-[#c2c6d4]"
                      }`}
                    >
                      {checked && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-3" aria-hidden>
                          <path d="M5 12l5 5L20 7" />
                        </svg>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </FacetCard>
      </div>

      {/* Footer */}
      <div className="mt-auto flex shrink-0 items-center justify-end gap-[28px] border-t-[1.2px] border-[rgba(194,198,212,0.5)] pt-[24px]">
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
          className="rounded-[50px] bg-[#0077c0] px-[28px] py-[12px] font-inter text-[13px] font-semibold uppercase tracking-[0.6px] text-white transition-colors hover:bg-[#0069a8]"
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
    <div className="rounded-[16px] border-[1.2px] border-[#c2c6d4] p-[24px]">
      <div className="flex items-center gap-[10px] pb-[18px]">
        <FacetIcon kind={icon} />
        <h2 className="font-manrope text-[19px] font-semibold leading-[26px] text-[#1e1e24]">{title}</h2>
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
      className={`flex flex-1 items-center gap-[10px] rounded-[10px] border px-[16px] py-[14px] transition-colors ${
        checked ? "border-[#0077c0] bg-[#e6f2fb]" : "border-[#c2c6d4] hover:border-[#0077c0]"
      }`}
    >
      <span
        className={`flex size-[18px] items-center justify-center rounded-[4px] border ${
          checked ? "border-[#0077c0] bg-[#0077c0]" : "border-[#c2c6d4]"
        }`}
      >
        {checked && (
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-3" aria-hidden>
            <path d="M5 12l5 5L20 7" />
          </svg>
        )}
      </span>
      <span className="flex-1 text-left font-inter text-[15px] font-medium text-[#1e1e24]">{label}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="#1e1e24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
        {arrow === "down" ? <path d="M12 5v14M6 13l6 6 6-6" /> : <path d="M12 19V5M6 11l6-6 6 6" />}
      </svg>
    </button>
  );
}
