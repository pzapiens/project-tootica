"use client";

import { useState } from "react";

export interface DonutDatum {
  /** Value passed to `onSelect` (a filter value / id). */
  key: string;
  /** Human label shown in the legend + centre readout. */
  label: string;
  /** Numeric magnitude of the slice. */
  value: number;
}

// A distinct, theme-leading palette (primary blue first), cycled for extra slices.
const DONUT_COLORS = [
  "#0077c0", "#00a7b5", "#f59e0b", "#7c3aed", "#e11d48",
  "#16a34a", "#2563eb", "#db2777", "#f97316", "#0891b2",
  "#65a30d", "#9333ea", "#dc2626", "#0d9488", "#ca8a04",
];

/** Point on a circle for `angle` degrees, measured clockwise from the top. */
function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  const a = ((angle - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/** SVG path for a donut segment between two angles (clockwise). */
function donutSlice(cx: number, cy: number, rOuter: number, rInner: number, start: number, end: number): string {
  const large = end - start > 180 ? 1 : 0;
  const [ox1, oy1] = polar(cx, cy, rOuter, start);
  const [ox2, oy2] = polar(cx, cy, rOuter, end);
  const [ix2, iy2] = polar(cx, cy, rInner, end);
  const [ix1, iy1] = polar(cx, cy, rInner, start);
  return `M ${ox1} ${oy1} A ${rOuter} ${rOuter} 0 ${large} 1 ${ox2} ${oy2} L ${ix2} ${iy2} A ${rInner} ${rInner} 0 ${large} 0 ${ix1} ${iy1} Z`;
}

/**
 * A clickable donut chart: the donut sits on the left, with colour-coded legend
 * rows on the right that scroll when tall. The centre shows the total, swapping
 * to the hovered (or selected) slice's readout. Every slice + legend row calls
 * `onSelect` with its `key`.
 *
 * Shared by Analytics (counts → deep-link to appointments) and Revenue (amounts →
 * filter the transactions table); pass `formatValue`/`formatCenter` to render
 * currency, and `selectedKey` to persistently highlight an applied selection.
 */
export default function DonutChart({
  data,
  onSelect,
  formatValue = (n) => String(n),
  formatCenter,
  totalLabel = "Total",
  selectedKey = null,
  emptyLabel = "No data to chart yet.",
  size = 240,
}: {
  data: DonutDatum[];
  onSelect: (key: string) => void;
  /** Legend / slice value formatter (defaults to the plain number). */
  formatValue?: (n: number) => string;
  /** Centre-readout formatter (defaults to `formatValue`). */
  formatCenter?: (n: number) => string;
  totalLabel?: string;
  /** Key of the currently-applied selection, highlighted persistently. */
  selectedKey?: string | null;
  emptyLabel?: string;
  /** Donut diameter in px (max width); the legend scroll height tracks it. */
  size?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  const fmtCenter = formatCenter ?? formatValue;
  const pct = (f: number) => Math.round(f * 100);

  if (data.length === 0 || total === 0) {
    return <p className="py-6 font-inter text-[15px] text-[#94a3b8]">{emptyLabel}</p>;
  }

  const CX = 110;
  const CY = 110;
  const R_OUTER = 100;
  const R_INNER = 62;

  const slices = data.map((d, i) => {
    // Cumulative values before / including this slice → its angular span.
    const before = data.slice(0, i).reduce((sum, x) => sum + x.value, 0);
    return {
      ...d,
      i,
      start: (before / total) * 360,
      end: ((before + d.value) / total) * 360,
      frac: d.value / total,
      color: DONUT_COLORS[i % DONUT_COLORS.length],
    };
  });

  const single = slices.length === 1;
  const hovered = hover !== null ? slices[hover] : null;
  const selected = selectedKey != null ? slices.find((s) => s.key === selectedKey) ?? null : null;
  const active = hovered ?? selected;
  const activeKey = active?.key ?? null;

  return (
    <div className="flex flex-col items-center gap-[24px] sm:flex-row sm:items-center sm:gap-[32px]">
      {/* Donut — left */}
      <div className="relative w-full shrink-0" style={{ maxWidth: size }}>
        <svg viewBox="0 0 220 220" className="block aspect-square w-full" role="img" aria-label="Distribution chart">
          {single ? (
            <>
              <circle cx={CX} cy={CY} r={R_OUTER} fill={slices[0].color} />
              <circle cx={CX} cy={CY} r={R_INNER} fill="white" />
              {/* Invisible hit area so the lone slice is still clickable. */}
              <circle
                cx={CX}
                cy={CY}
                r={(R_OUTER + R_INNER) / 2}
                fill="none"
                stroke="transparent"
                strokeWidth={R_OUTER - R_INNER}
                onClick={() => onSelect(slices[0].key)}
                onMouseEnter={() => setHover(0)}
                onMouseLeave={() => setHover((h) => (h === 0 ? null : h))}
                style={{ cursor: "pointer", outline: "none" }}
              />
            </>
          ) : (
            slices.map((s) => (
              <path
                key={s.key}
                d={donutSlice(CX, CY, R_OUTER, R_INNER, s.start, s.end)}
                fill={s.color}
                stroke="white"
                strokeWidth={2}
                role="button"
                tabIndex={0}
                aria-label={`${s.label}: ${formatValue(s.value)} (${pct(s.frac)}%)`}
                onClick={() => onSelect(s.key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(s.key);
                  }
                }}
                onMouseEnter={() => setHover(s.i)}
                onMouseLeave={() => setHover((h) => (h === s.i ? null : h))}
                style={{
                  cursor: "pointer",
                  outline: "none",
                  opacity: activeKey === null || activeKey === s.key ? 1 : 0.4,
                  transition: "opacity 150ms",
                }}
              />
            ))
          )}
        </svg>

        {/* Centre readout: total by default; hovered / selected slice otherwise. */}
        <div className="pointer-events-none absolute inset-[24%] flex flex-col items-center justify-center text-center">
          {active ? (
            <>
              <span className="line-clamp-2 font-inter text-[13px] font-semibold leading-[16px] text-[#1e1e24]">
                {active.label}
              </span>
              <span className="font-inter text-[20px] font-bold leading-[24px] text-[#0077c0]">
                {fmtCenter(active.value)}
              </span>
              <span className="font-inter text-[12px] leading-[16px] text-[#727783]">{pct(active.frac)}%</span>
            </>
          ) : (
            <>
              <span className="font-inter text-[24px] font-bold leading-[28px] text-[#1e1e24]">{fmtCenter(total)}</span>
              <span className="font-inter text-[12px] font-semibold uppercase tracking-[0.5px] text-[#727783]">
                {totalLabel}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Legend / indication — colour-coded rows on the right; scrolls when tall. */}
      <ul className="flex w-full flex-1 flex-col gap-[10px] overflow-y-auto pr-[4px]" style={{ maxHeight: size }}>
        {slices.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              onClick={() => onSelect(s.key)}
              onMouseEnter={() => setHover(s.i)}
              onMouseLeave={() => setHover((h) => (h === s.i ? null : h))}
              aria-label={`${s.label}: ${formatValue(s.value)} (${pct(s.frac)}%)`}
              aria-pressed={selectedKey === s.key}
              className="group relative flex w-full items-center gap-[10px] rounded-[10px] px-[14px] py-[9px] text-left font-inter text-white outline-none transition-transform hover:scale-[1.02] focus:outline-none focus-visible:outline-none"
              style={{ backgroundColor: s.color, opacity: activeKey === null || activeKey === s.key ? 1 : 0.5 }}
            >
              <span className="flex-1 truncate text-[13px] font-semibold">{s.label}</span>
              <span className="shrink-0 rounded-full bg-white/25 px-[8px] py-[1px] text-[12px] font-bold">
                {formatValue(s.value)}
              </span>
              <span className="w-[38px] shrink-0 text-right text-[12px] opacity-90">{pct(s.frac)}%</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
