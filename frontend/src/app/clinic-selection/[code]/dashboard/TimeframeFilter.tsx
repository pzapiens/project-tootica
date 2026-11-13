"use client";

import Image from "next/image";
import FloatingPanel from "@/components/FloatingPanel";
import { useRef, useState } from "react";

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
  compact = true,
  align = "start",
}: {
  compact?: boolean;
  align?: "start" | "end";
  timeframe: Timeframe;
  onChange: (t: Timeframe) => void;
}) {
  const [open, setOpen] = useExclusiveDropdown();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);

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
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        className={`flex items-center gap-1 rounded-full border-[1.167px] border-black transition-colors ${compact ? "h-[40px] px-[14px]" : "h-[48px] px-[16.167px]"}`}
      >
        <span className={`font-inter font-medium text-[#1e1e24] ${compact ? "text-[14px] leading-[20px]" : "text-[15px] leading-[22px]"}`}>
          {timeframeLabel(timeframe)}
        </span>
        <Image
          src="/dashboard/chevron_dark.svg"
          alt=""
          width={24}
          height={24}
          className={`${compact ? "size-5" : "size-5"} transition-transform ${open ? "rotate-90" : "-rotate-90"}`}
        />
      </button>

      {open && (
        <FloatingPanel anchor={triggerRef} align={align} width={288} gap={12} onClose={() => setOpen(false)} role="dialog" label="Appointment timeframe" className="flex flex-col gap-3.5 rounded-[13px] border-[1.167px] border-black bg-white p-[14px] shadow-lg">
          {/* Presets */}
          <PresetRow label="All time" active={timeframe.kind === "all"} onClick={() => choosePreset("all")} />
          <PresetRow label="Today" active={timeframe.kind === "today"} onClick={() => choosePreset("today")} />

          {/* Custom range */}
          <div className="flex min-w-0 flex-col gap-[4px] px-[8px]">
            <span className="font-inter text-[9.838px] font-semibold uppercase tracking-[0.4919px] text-[#1e1e24]">
              From <span className="text-red-500">*</span>
            </span>
            <DateInput value={from} onChange={setFrom} />
          </div>
          <div className="flex min-w-0 flex-col gap-[4px] px-[8px]">
            <span className="font-inter text-[9.838px] font-semibold uppercase tracking-[0.4919px] text-[#424752]">
              To <span className="text-red-500">*</span>
            </span>
            <DateInput value={to} onChange={setTo} />
          </div>

          {/* Actions */}
          <div className="app-toolbar flex items-center justify-between pt-[8px]">
            <button
              type="button"
              disabled={!from && !to}
              onClick={() => {
                setFrom("");
                setTo("");
              }}
              className="w-[122px] border-0 bg-transparent px-[14px] py-[9px] font-inter text-[12px] font-semibold uppercase tracking-[0.6px] text-brand transition-colors enabled:hover:text-brand/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={!canApply}
              onClick={apply}
              className={`w-[120px] rounded-[50px] px-[13px] py-[8px] font-inter text-[12px] font-semibold uppercase tracking-[0.6px] text-white drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)] ${
                canApply ? "bg-[#0077c0] hover:bg-[#0069a8]" : "bg-[#0177c1] opacity-50"
              }`}
            >
              Apply
            </button>
          </div>
        </FloatingPanel>
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
      className={`flex w-full items-center justify-between rounded-[8px] border-[1.167px] px-[13px] py-[10px] ${
        active ? "border-[#e5eff8] bg-[#e5eff8]" : "border-[#f1f5f9] bg-[#f1f5f9] app-option-hover"
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
        <Image src="/dashboard/check_small.svg" alt="" width={24} height={24} className="size-5" />
      )}
    </button>
  );
}
