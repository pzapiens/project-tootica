"use client";

/**
 * Small dark hover tooltip shown above (default) or below an icon button. The
 * button (or wrapping element) must be `group relative` for the hover to trigger
 * and the tooltip to anchor. Used app-wide to label icon-only actions (Edit,
 * Delete, Filter, Export, …) consistently.
 */
export function Tip({ label, below }: { label: string; below?: boolean }) {
  return (
    <span
      role="tooltip"
      className={`pointer-events-none absolute left-1/2 z-[120] -translate-x-1/2 whitespace-nowrap rounded-[6px] bg-[#1e1e24] px-[8px] py-[4px] font-inter text-[12px] font-medium leading-[16px] text-white opacity-0 shadow-[0px_4px_12px_rgba(0,0,0,0.15)] transition-opacity duration-150 group-hover:opacity-100 ${
        below ? "top-[calc(100%+6px)]" : "bottom-[calc(100%+6px)]"
      }`}
    >
      {label}
    </span>
  );
}
