"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/**
 * Selected appointment time window. `all` = every appointment, `today` = the
 * current day, `range` = an inclusive custom FROM–TO window (dates as
 * `yyyy-mm-dd`, the value produced by a native date input).
 */
export type TimeFrame =
  | { kind: "all" }
  | { kind: "today" }
  | { kind: "range"; from: string; to: string };

/** Short label for the trigger pill (e.g. "All-Time", "Today", "01/10 – 23/10"). */
export function timeFrameLabel(tf: TimeFrame): string {
  if (tf.kind === "all") return "All-Time";
  if (tf.kind === "today") return "Today";
  return `${formatShort(tf.from)} – ${formatShort(tf.to)}`;
}

function formatShort(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/**
 * "All-Time" time-frame filter dropdown (Figma "Time Filter Flow" 114:5958). A
 * pill trigger opens a panel with All-Time / Today quick options plus a custom
 * FROM–TO date range. APPLY (enabled only once both dates are set and ordered)
 * commits the range; CLEAR empties the draft dates. Closes on outside click,
 * Escape, or committing a selection.
 */
export default function TimeFilter({
  value,
  onChange,
}: {
  value: TimeFrame;
  onChange: (tf: TimeFrame) => void;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Seed the draft date fields from the active value each time the panel opens.
  useEffect(() => {
    if (!open) return;
    setFrom(value.kind === "range" ? value.from : "");
    setTo(value.kind === "range" ? value.to : "");
  }, [open, value]);

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
  }, [open]);

  const rangeValid = from !== "" && to !== "" && from <= to;

  function select(tf: TimeFrame) {
    onChange(tf);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-[54px] items-center gap-2 rounded-full border-[1.167px] border-field-border px-4 font-inter text-[16.333px] font-medium leading-[23.333px] text-ink"
      >
        <span className="whitespace-nowrap">{timeFrameLabel(value)}</span>
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
          role="dialog"
          aria-label="Filter by time frame"
          className="absolute right-0 top-full z-20 mt-2 flex w-[288px] max-w-[calc(100vw-2rem)] flex-col gap-4 rounded-[15px] border border-field-border bg-white p-[17px] drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
        >
          <QuickOption label="All-Time" selected={value.kind === "all"} onClick={() => select({ kind: "all" })} />
          <QuickOption label="Today" selected={value.kind === "today"} onClick={() => select({ kind: "today" })} />

          <div className="flex flex-col gap-4">
            <DateField label="FROM" value={from} max={to || undefined} onChange={setFrom} />
            <DateField label="TO" value={to} min={from || undefined} onChange={setTo} />

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  setFrom("");
                  setTo("");
                }}
                className="w-[122px] rounded-[4px] px-[17px] py-[9px] font-inter text-[12px] font-semibold tracking-[0.6px] text-[#424752]"
              >
                CLEAR
              </button>
              <button
                type="button"
                disabled={!rangeValid}
                onClick={() => rangeValid && select({ kind: "range", from, to })}
                className="w-[120px] rounded-full bg-brand px-4 py-2 font-inter text-[12px] font-semibold tracking-[0.6px] text-white drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)] transition-opacity disabled:opacity-50"
              >
                APPLY
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuickOption({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex w-full items-center justify-between rounded-[8px] py-[10px] pl-4 pr-4 text-left transition-colors ${
        selected ? "bg-[rgba(0,94,184,0.1)]" : "bg-[#f1f5f9] hover:bg-[#e7edf4]"
      }`}
    >
      <span
        className={`font-manrope text-[14px] font-semibold leading-5 ${
          selected ? "text-brand" : "text-ink"
        }`}
      >
        {label}
      </span>
      {selected && <Image src="/clinic/check.svg" alt="" width={24} height={24} className="size-6" />}
    </button>
  );
}

function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-[3.577px]">
      <span className="font-inter text-[9.838px] font-semibold uppercase tracking-[0.4919px] text-[#424752]">
        {label} <span className="text-red-500">*</span>
      </span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="border-b-[0.894px] border-field-border/60 bg-transparent pb-[8px] pt-[7px] font-inter text-[14.31px] text-ink outline-none focus:border-brand"
      />
    </label>
  );
}
