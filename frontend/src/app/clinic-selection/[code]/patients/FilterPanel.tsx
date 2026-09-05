"use client";

import { useEffect, useState } from "react";

/**
 * Apply Filter panel (Figma "Patients - Filter"): a full-content panel with a
 * header, three sorting cards (ID / Alphabetic / Age, each ascending or
 * descending) and a footer (Reset All + Apply Filters). Selections are STAGED —
 * they only take effect when "Apply Filters" is clicked. Each card contributes
 * at most one sort key; together they form a multi-key sort (ID → name → age).
 */

export interface SortKey {
  key: "id" | "name" | "age";
  dir: "asc" | "desc";
}

/** Staged selection: at most one direction per sort key. */
type Draft = Partial<Record<SortKey["key"], SortKey["dir"]>>;

// Fixed priority for the multi-key sort (and the order chips read back).
const ORDER: SortKey["key"][] = ["id", "name", "age"];

function draftToSorts(draft: Draft): SortKey[] {
  return ORDER.filter((k) => draft[k]).map((k) => ({ key: k, dir: draft[k]! }));
}

interface Option {
  label: string;
  dir: "asc" | "desc";
  arrow: "up" | "down";
}
const GROUPS: Array<{ title: string; key: SortKey["key"]; options: Option[] }> = [
  {
    title: "ID Sorting",
    key: "id",
    options: [
      { label: "Ascending", dir: "asc", arrow: "up" },
      { label: "Descending", dir: "desc", arrow: "down" },
    ],
  },
  {
    // Column 2, row 1 — the 2-col grid auto-places ID, Alphabetic, then Age.
    title: "Alphabetic Order",
    key: "name",
    options: [
      { label: "A to Z", dir: "asc", arrow: "down" },
      { label: "Z to A", dir: "desc", arrow: "up" },
    ],
  },
  {
    title: "Age Sorting",
    key: "age",
    options: [
      { label: "Ascending", dir: "asc", arrow: "up" },
      { label: "Descending", dir: "desc", arrow: "down" },
    ],
  },
];

export default function FilterPanel({
  applied,
  onApply,
  onClose,
}: {
  applied: SortKey[];
  onApply: (sorts: SortKey[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => {
    const d: Draft = {};
    for (const s of applied) d[s.key] = s.dir;
    return d;
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Select a direction, switch within the card, or deselect if re-clicked. */
  function toggle(key: SortKey["key"], dir: SortKey["dir"]) {
    setDraft((d) => {
      const next = { ...d };
      if (next[key] === dir) delete next[key];
      else next[key] = dir;
      return next;
    });
  }

  const draftCount = Object.keys(draft).length;
  // Apply is active only while at least one option is selected. Clearing applied
  // filters is done via Reset All (below), so this can't leave a filter stuck.
  const canApply = draftCount > 0;

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
          {GROUPS.map((group) => (
            <div
              key={group.key}
              className="flex flex-col gap-[16px] self-start rounded-[28px] border border-[#1e1e24] p-[24px] shadow-[0px_1px_2px_rgba(0,0,0,0.05)]"
            >
              <div className="flex items-center gap-[8px]">
                <SortIcon className="size-6 text-[#1e1e24]" />
                <h2 className="font-manrope text-[18px] font-semibold text-[#1e1e24]">
                  {group.title}
                </h2>
              </div>
              <div className="grid grid-cols-2 gap-[16px] pt-[6px]">
                {group.options.map((opt) => {
                  const selected = draft[group.key] === opt.dir;
                  return (
                    <button
                      key={opt.dir}
                      type="button"
                      onClick={() => toggle(group.key, opt.dir)}
                      className={`flex items-center justify-center gap-[8px] rounded-[8px] border p-[15px] transition-colors ${
                        selected ? "border-[#0077c0] bg-[#0077c0]/5" : "border-[#1e1e24] hover:border-[#0077c0]"
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
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-end gap-[12px] border-t border-[rgba(30,30,36,0.5)] pt-[18px]">
        <button
          type="button"
          // Reset clears the staged selections and any already-applied filters.
          onClick={() => {
            setDraft({});
            if (applied.length > 0) onApply([]);
          }}
          disabled={draftCount === 0 && applied.length === 0}
          className="px-[14px] py-[8px] font-inter text-[11px] font-semibold uppercase tracking-[1px] text-[#1e1e24] opacity-70 transition-opacity hover:opacity-100 disabled:opacity-30"
        >
          Reset All
        </button>
        <button
          type="button"
          disabled={!canApply}
          onClick={() => {
            onApply(draftToSorts(draft));
            onClose();
          }}
          className={`rounded-[50px] px-[22px] py-[10px] font-inter text-[14px] text-white transition-colors ${
            canApply ? "bg-[#0077c0] hover:bg-[#0069a8]" : "cursor-not-allowed bg-[#0077c0] opacity-50"
          }`}
        >
          Apply Filters{draftCount > 0 ? ` (${draftCount})` : ""}
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

/** Descending "sort list" glyph beside each group title. */
function SortIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden>
      <path d="M4 6h16M4 12h10M4 18h6" />
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
