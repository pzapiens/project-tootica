"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { useExclusiveDropdown } from "@/lib/useExclusiveDropdown";

import { DateInput, formatDmy, parseDmy, toIso } from "./DateInput";
import { type Timeframe, timeframeLabel } from "./mock";

/**
 * Dashboard timeframe filter (Figma "Time Filter Flow"). The trigger shows the
 * current selection; the dropdown offers All-Time / Today presets plus a custom
 * FROM–TO range. Each date can be typed or picked from the calendar (shared
 * DateInput). APPLY commits the range (enabled only when both dates are valid
 * and ordered); CLEAR wipes the draft dates.
 */
export default function TimeframeFilter({
  timeframe,
  onChange,
}: {
  timeframe: Timeframe;
  onChange: (t: Timeframe) => void;
}) {
  const [open, setOpen] = useExclusiveDropdown();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [setOpen]);

  function toggle() {
    setOpen((wasOpen) => {
      const next = !wasOpen;
      if (next) {
        // Seed the draft from the committed range (if any) when opening.
        if (timeframe.kind === "range") {
          setFrom(formatDmy(new Date(timeframe.from)));
          setTo(formatDmy(new Date(timeframe.to)));
        } else {
          setFrom("");
          setTo("");
        }
      }
      return next;
    });
  }

  function choosePreset(kind: "all" | "today") {
    onChange({ kind });
    setOpen(false);
  }

  const fromDate = parseDmy(from);
  const toDate = parseDmy(to);
  const canApply = Boolean(fromDate && toDate && fromDate.getTime() <= toDate.getTime());

  function apply() {
    if (!fromDate || !toDate) return;
    onChange({ kind: "range", from: toIso(fromDate), to: toIso(toDate) });
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        className="flex h-[54px] items-center gap-1 rounded-full border-[1.167px] border-[#c2c6d4] px-[16.167px] transition-colors hover:border-[#0077c0]"
      >
        <span className="font-inter text-[16.333px] font-medium leading-[23.333px] text-[#1e1e24]">
          {timeframeLabel(timeframe)}
        </span>
        <Image
          src="/dashboard/chevron_dark.svg"
          alt=""
          width={24}
          height={24}
          className={`size-6 transition-transform ${open ? "rotate-90" : "-rotate-90"}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-30 flex w-[288px] flex-col gap-[16px] rounded-[15px] border border-[#c2c6d4] bg-white p-[17px] drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          {/* Presets */}
          <PresetRow label="All-Time" active={timeframe.kind === "all"} onClick={() => choosePreset("all")} />
          <PresetRow label="Today" active={timeframe.kind === "today"} onClick={() => choosePreset("today")} />

          {/* Custom range */}
          <div className="flex flex-col gap-[4px]">
            <span className="font-inter text-[9.838px] font-semibold uppercase tracking-[0.4919px] text-[#1e1e24]">
              From <span className="text-red-500">*</span>
            </span>
            <DateInput value={from} onChange={setFrom} />
          </div>
          <div className="flex flex-col gap-[4px]">
            <span className="font-inter text-[9.838px] font-semibold uppercase tracking-[0.4919px] text-[#424752]">
              To <span className="text-red-500">*</span>
            </span>
            <DateInput value={to} onChange={setTo} />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-[8px]">
            <button
              type="button"
              onClick={() => {
                setFrom("");
                setTo("");
              }}
              className="w-[122px] rounded-[4px] px-[17px] py-[9px] font-inter text-[12px] font-semibold uppercase tracking-[0.6px] text-[#424752]"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={!canApply}
              onClick={apply}
              className={`w-[120px] rounded-[50px] px-[16px] py-[8px] font-inter text-[12px] font-semibold uppercase tracking-[0.6px] text-white drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)] ${
                canApply ? "bg-[#0077c0] hover:bg-[#0069a8]" : "bg-[#0177c1] opacity-50"
              }`}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PresetRow({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-[8px] px-[16px] py-[10px] ${
        active ? "bg-[rgba(0,94,184,0.1)]" : "bg-[#f1f5f9] hover:bg-[#e9eef4]"
      }`}
    >
      <span
        className={`font-manrope text-[14px] font-semibold leading-[20px] ${
          active ? "text-[#0077c0]" : "text-[#1e1e24]"
        }`}
      >
        {label}
      </span>
      {active && (
        <Image src="/dashboard/check_small.svg" alt="" width={24} height={24} className="size-6" />
      )}
    </button>
  );
}
