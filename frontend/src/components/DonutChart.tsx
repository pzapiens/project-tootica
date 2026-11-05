"use client";

import { useContext, useLayoutEffect, useRef, useState } from "react";
import { PageRevealContext } from "./loading/LoadingActivity";

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

const CX = 110;
const CY = 110;
const R_OUTER = 100;
const R_INNER = 62;
const DRAW_DELAY_MS = 240;
const DRAW_DURATION_MS = 1400;

/** Point on a circle for `angle` degrees, measured clockwise from the top. */
function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  const a = ((angle - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/** SVG path for a donut segment between two angles (clockwise). */
function donutSlice(cx: number, cy: number, rOuter: number, rInner: number, start: number, end: number): string {
  if (end <= start) return "";
  // SVG needs two arcs for a complete circle, including a single-category chart.
  if (end - start >= 360 - 1e-7) {
    return `M ${cx} ${cy - rOuter} A ${rOuter} ${rOuter} 0 1 1 ${cx} ${cy + rOuter} A ${rOuter} ${rOuter} 0 1 1 ${cx} ${cy - rOuter} Z M ${cx} ${cy - rInner} A ${rInner} ${rInner} 0 1 0 ${cx} ${cy + rInner} A ${rInner} ${rInner} 0 1 0 ${cx} ${cy - rInner} Z`;
  }
  const large = end - start > 180 ? 1 : 0;
  const [ox1, oy1] = polar(cx, cy, rOuter, start);
  const [ox2, oy2] = polar(cx, cy, rOuter, end);
  const [ix2, iy2] = polar(cx, cy, rInner, end);
  const [ix1, iy1] = polar(cx, cy, rInner, start);
  return `M ${ox1} ${oy1} A ${rOuter} ${rOuter} 0 ${large} 1 ${ox2} ${oy2} L ${ix2} ${iy2} A ${rInner} ${rInner} 0 ${large} 0 ${ix1} ${iy1} Z`;
}

/**
 * A clickable donut chart: the donut sits on the left, with colour-coded legend
 * rows on the right that scroll within the card. The centre shows the total, swapping
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
  formatLegend = formatValue,
  formatCenter,
  totalLabel = "Total",
  selectedKey = null,
  emptyLabel = "No data to chart yet.",
  size = 300,
  compact = true,
}: {
  data: DonutDatum[];
  onSelect: (key: string) => void;
  /** Legend / slice value formatter (defaults to the plain number). */
  formatValue?: (n: number) => string;
  /** Optional shorter legend values; accessible labels retain the full value. */
  formatLegend?: (n: number) => string;
  /** Centre-readout formatter (defaults to `formatValue`). */
  formatCenter?: (n: number) => string;
  totalLabel?: string;
  /** Key of the currently-applied selection, highlighted persistently. */
  selectedKey?: string | null;
  emptyLabel?: string;
  /** Donut diameter in px (max width), shared across pages by default. */
  size?: number;
  /** Small legend that leaves more of a short card's width for the donut. */
  compact?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const revealed = useContext(PageRevealContext);
  const segmentsRef = useRef<SVGGElement>(null);
  const animationKey = JSON.stringify(data.map(({ key, label, value }) => [key, label, value]));
  const total = data.reduce((s, d) => s + d.value, 0);
  const fmtCenter = formatCenter ?? formatValue;
  const pct = (f: number) => Math.round(f * 100);

  useLayoutEffect(() => {
    const group = segmentsRef.current;
    if (!group) return;
    const segments = Array.from(group.querySelectorAll<SVGPathElement>("path")).map((element) => ({
      element,
      start: Number(element.dataset.start),
      end: Number(element.dataset.end),
    }));
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;

    function draw(progress: number) {
      for (const { element, start, end } of segments) {
        // Match the reference: every slice grows together, opening from 3 o'clock.
        element.setAttribute("d", donutSlice(CX, CY, R_OUTER, R_INNER, 90 - end * progress, 90 - start * progress));
      }
    }

    function finish() {
      window.cancelAnimationFrame(frame);
      draw(1);
    }

    draw(motion.matches ? 1 : 0);
    if (!revealed || motion.matches) return;

    const startTime = performance.now() + DRAW_DELAY_MS;
    function tick(now: number) {
      const elapsed = Math.max(0, Math.min(1, (now - startTime) / DRAW_DURATION_MS));
      draw(1 - (1 - elapsed) ** 3);
      if (elapsed < 1) frame = window.requestAnimationFrame(tick);
    }
    frame = window.requestAnimationFrame(tick);
    motion.addEventListener("change", finish);
    return () => {
      window.cancelAnimationFrame(frame);
      motion.removeEventListener("change", finish);
    };
  }, [animationKey, revealed]);

  if (data.length === 0 || total === 0) {
    return <p className="py-6 font-inter text-[15px] text-[#94a3b8]">{emptyLabel}</p>;
  }

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

  const hovered = hover !== null ? slices[hover] : null;
  const selected = selectedKey != null ? slices.find((s) => s.key === selectedKey) ?? null : null;
  const active = hovered ?? selected;
  const activeKey = active?.key ?? null;

  return (
    <div key={animationKey} data-chart-ready={revealed} className={compact
      ? "flex min-h-0 w-full min-w-0 flex-1 items-center gap-4"
      : "flex flex-col items-center gap-[24px] sm:flex-row sm:items-center sm:gap-[32px]"}>
      {/* Donut — left */}
      <div className={`relative aspect-square w-full ${compact ? "max-h-full min-w-0 flex-[1.4]" : "shrink-0"}`} style={{ maxWidth: size }}>
        <svg viewBox="0 0 220 220" className="absolute inset-0 h-full w-full" role="img" aria-label="Distribution chart">
          <g ref={segmentsRef}>
            {slices.map((s) => (
              <path
                key={s.key}
                d=""
                data-start={s.start}
                data-end={s.end}
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
            ))}
          </g>
        </svg>

        {/* Centre readout: total by default; hovered / selected slice otherwise. */}
        <div className="chart-readout pointer-events-none absolute inset-[24%] flex flex-col items-center justify-center text-center">
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

      {/* Scroll long legends independently, keeping the donut and card in place. */}
      <ul
        aria-label="Chart legend"
        tabIndex={0}
        className={`flex min-h-0 min-w-0 flex-1 flex-col gap-[10px] overflow-y-auto overscroll-contain p-1 pr-2 [scrollbar-gutter:stable] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0077c0] ${compact ? "max-h-full" : "w-full"}`}
        style={compact ? undefined : { maxHeight: size }}
      >
        {slices.map((s) => (
          <li key={s.key} className="chart-legend-item shrink-0" style={{ animationDelay: `${120 + Math.min(s.i, 10) * 45}ms` }}>
            <button
              type="button"
              onClick={() => onSelect(s.key)}
              onMouseEnter={() => setHover(s.i)}
              onMouseLeave={() => setHover((h) => (h === s.i ? null : h))}
              aria-label={`${s.label}: ${formatValue(s.value)} (${pct(s.frac)}%)`}
              title={`${s.label}: ${formatValue(s.value)} (${pct(s.frac)}%)`}
              aria-pressed={selectedKey === s.key}
              className={`group relative flex w-full items-center rounded-[10px] text-left font-inter text-white outline-none transition-transform hover:scale-[1.02] focus:outline-none focus-visible:outline-none ${compact ? "flex-wrap gap-x-2 gap-y-1 px-3 py-2.5" : "gap-[10px] px-[14px] py-[9px]"}`}
              style={{ backgroundColor: s.color, opacity: activeKey === null || activeKey === s.key ? 1 : 0.5 }}
            >
              {compact ? (
                <>
                  <span className="w-full break-words text-[12px] font-semibold">{s.label}</span>
                  <span className="min-w-0 break-all rounded-full bg-white/25 px-2 py-0.5 text-[12px] font-bold">{formatLegend(s.value)}</span>
                  <span className="ml-auto text-[12px] opacity-90">{pct(s.frac)}%</span>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 break-words text-[13px] font-semibold">{s.label}</span>
                  <span className="shrink-0 rounded-full bg-white/25 px-[8px] py-[1px] text-[12px] font-bold">
                    {formatLegend(s.value)}
                  </span>
                  <span className="w-[38px] shrink-0 text-right text-[12px] opacity-90">{pct(s.frac)}%</span>
                </>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
