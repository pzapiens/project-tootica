"use client";

import { useEffect, useState } from "react";

import { SPECIALIZATIONS } from "./constants";

/**
 * Apply Filter panel (Figma "Doctors3 - filter"): a full-content panel with a
 * header, an "ID Sorting" card (Ascending / Descending) and a "Specialization"
 * card (multi-select chips), plus a footer (Reset All + Apply Filters).
 * Selections are STAGED — they only take effect when "Apply Filters" is clicked.
 */

export interface DoctorFilters {
  /** Sort the list by ID (code); null leaves the natural order. */
  sort: "asc" | "desc" | null;
  /** Keep only doctors whose specialization is in this set (empty = all). */
  specializations: string[];
}

export const EMPTY_FILTERS: DoctorFilters = { sort: null, specializations: [] };

/** Number of active criteria — drives the filter icon badge. */
export function filterCount(f: DoctorFilters): number {
  return (f.sort ? 1 : 0) + f.specializations.length;
}

export default function DoctorFilterPanel({
  applied,
  onApply,
  onClose,
}: {
  applied: DoctorFilters;
  onApply: (filters: DoctorFilters) => void;
  onClose: () => void;
}) {
  const [sort, setSort] = useState<DoctorFilters["sort"]>(applied.sort);
  const [specs, setSpecs] = useState<string[]>(applied.specializations);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Select a direction, or deselect if the same one is re-clicked. */
  function toggleSort(dir: "asc" | "desc") {
    setSort((cur) => (cur === dir ? null : dir));
  }

  function toggleSpec(spec: string) {
    setSpecs((cur) =>
      cur.includes(spec) ? cur.filter((s) => s !== spec) : [...cur, spec],
    );
  }

  const count = (sort ? 1 : 0) + specs.length;
  const canApply = count > 0;

  return (
    <div className="flex h-[calc((100dvh-76px)/0.9)] flex-col md:h-[calc((100dvh-112px)/0.9)]">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-[14px] border-b border-[rgba(30,30,36,0.5)] pb-[18px]">
        <button type="button" aria-label="Close filter" onClick={onClose}>
          <CloseIcon className="size-9 text-[#1e1e24]" />
        </button>
        <h1 className="font-manrope text-[27px] font-semibold tracking-[-0.5px] text-[#1e1e24]">
          Apply Filter
        </h1>
      </div>

      {/* Options (scrolls) */}
      <div className="min-h-0 flex-1 overflow-y-auto py-[32px]">
        <div className="grid grid-cols-2 items-start gap-[24px]">
          {/* ID Sorting */}
          <div className="flex flex-col gap-[16px] self-start rounded-[28px] border border-[#1e1e24] p-[24px] shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
            <div className="flex items-center gap-[8px]">
              <SortIcon className="size-6 text-[#1e1e24]" />
              <h2 className="font-manrope text-[18px] font-semibold text-[#1e1e24]">ID Sorting</h2>
            </div>
            <div className="grid grid-cols-2 gap-[16px] pt-[6px]">
              {(
                [
                  { label: "Ascending", dir: "asc", arrow: "up" },
                  { label: "Descending", dir: "desc", arrow: "down" },
                ] as const
              ).map((opt) => {
                const selected = sort === opt.dir;
                return (
                  <button
                    key={opt.dir}
                    type="button"
                    onClick={() => toggleSort(opt.dir)}
                    className={`flex items-center justify-center gap-[8px] rounded-[8px] border p-[15px] transition-colors ${
                      selected
                        ? "border-[#0077c0] bg-[#0077c0]/5"
                        : "border-[#1e1e24] hover:border-[#0077c0]"
                    }`}
                  >
                    <span
                      className={`flex size-[15px] shrink-0 items-center justify-center rounded-[3px] border ${
                        selected ? "border-[#0077c0] bg-[#0077c0]" : "border-[#1e1e24] bg-white"
                      }`}
                    >
                      {selected && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="size-[10px]" aria-hidden>
                          <path d="M5 12l5 5L20 7" />
                        </svg>
                      )}
                    </span>
                    <span className="font-inter text-[13px] text-[#1e1e24]">{opt.label}</span>
                    <Arrow dir={opt.arrow} className="size-3 text-[#1e1e24]" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Specialization */}
          <div className="flex flex-col gap-[16px] self-start rounded-[28px] border border-[#1e1e24] p-[24px] shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
            <div className="flex items-center gap-[8px]">
              <CrownIcon className="size-6 text-[#1e1e24]" />
              <h2 className="font-manrope text-[18px] font-semibold text-[#1e1e24]">Specialization</h2>
            </div>
            <div className="flex flex-wrap gap-[12px] pt-[6px]">
              {SPECIALIZATIONS.map((spec) => {
                const selected = specs.includes(spec);
                return (
                  <button
                    key={spec}
                    type="button"
                    onClick={() => toggleSpec(spec)}
                    aria-pressed={selected}
                    className={`rounded-[10px] border px-[16px] py-[10px] font-inter text-[14px] transition-colors ${
                      selected
                        ? "border-[#0077c0] bg-[#0077c0] text-white"
                        : "border-[#1e1e24] text-[#1e1e24] hover:border-[#0077c0]"
                    }`}
                  >
                    {spec}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-end gap-[12px] border-t border-[rgba(30,30,36,0.5)] pt-[18px]">
        <button
          type="button"
          onClick={() => {
            setSort(null);
            setSpecs([]);
            if (applied.sort || applied.specializations.length > 0) onApply(EMPTY_FILTERS);
          }}
          disabled={count === 0 && applied.sort === null && applied.specializations.length === 0}
          className="px-[14px] py-[8px] font-inter text-[11px] font-semibold uppercase tracking-[1px] text-[#1e1e24] opacity-70 transition-opacity hover:opacity-100 disabled:opacity-30"
        >
          Reset All
        </button>
        <button
          type="button"
          disabled={!canApply}
          onClick={() => {
            onApply({ sort, specializations: specs });
            onClose();
          }}
          className={`rounded-[50px] px-[22px] py-[10px] font-inter text-[14px] text-white transition-colors ${
            canApply ? "bg-[#0077c0] hover:bg-[#0069a8]" : "cursor-not-allowed bg-[#0077c0] opacity-50"
          }`}
        >
          Apply Filters{count > 0 ? ` (${count})` : ""}
        </button>
      </div>
    </div>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

/** Descending "sort list" glyph beside the ID Sorting title. */
function SortIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden>
      <path d="M4 6h16M4 12h10M4 18h6" />
    </svg>
  );
}

/** Small crown glyph beside the Specialization title (Figma). */
function CrownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M3 7l4 4 5-6 5 6 4-4v11H3V7zm2 9h14v-2H5v2z" />
    </svg>
  );
}

function Arrow({ dir, className }: { dir: "up" | "down"; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {dir === "up" ? <path d="M12 19V5M6 11l6-6 6 6" /> : <path d="M12 5v14M6 13l6 6 6-6" />}
    </svg>
  );
}
