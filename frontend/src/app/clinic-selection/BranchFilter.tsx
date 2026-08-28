"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

import { useExclusiveDropdown } from "@/lib/useExclusiveDropdown";

export type BranchOption = { id: string; label: string };

/**
 * "All Branch" filter dropdown (Figma node 472:4309). A pill trigger that opens
 * a radio list of branches; picking one calls `onSelect`. Closes on outside
 * click, Escape, or selection.
 */
export default function BranchFilter({
  options,
  selectedId,
  onSelect,
}: {
  options: BranchOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useExclusiveDropdown();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  const current = options.find((o) => o.id === selectedId) ?? options[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-[54px] max-w-[260px] items-center gap-2 rounded-full border-[1.167px] border-field-border px-4 font-inter text-[16.333px] font-medium leading-[23.333px] text-ink"
      >
        <span className="truncate">{current.label}</span>
        <Image
          src="/clinic/chevron-filter.svg"
          alt=""
          width={24}
          height={24}
          className={`size-6 shrink-0 transition-transform ${open ? "rotate-90" : "-rotate-90"}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Filter by branch"
          className="absolute left-0 top-full z-20 mt-2 flex w-[295px] max-w-[calc(100vw-2rem)] flex-col gap-[5px] rounded-[15px] border border-field-border bg-white p-[17px] drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
        >
          {options.map((opt) => {
            const selected = opt.id === selectedId;
            return (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onSelect(opt.id);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-[8px] bg-[#f1f5f9] py-[10px] pl-4 pr-4 text-left transition-colors hover:bg-[#e7edf4]"
              >
                <span className="font-manrope text-[14px] font-semibold leading-5 text-ink">
                  {opt.label}
                </span>
                {selected ? (
                  <span className="flex size-3 shrink-0 items-center justify-center rounded-full border border-ink">
                    <span className="size-1.5 rounded-full bg-ink" />
                  </span>
                ) : (
                  <span className="size-3 shrink-0 rounded-full border border-ink" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
