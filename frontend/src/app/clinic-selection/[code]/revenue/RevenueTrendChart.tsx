"use client";

import { useContext, useEffect, useMemo, useState } from "react";

import { PageRevealContext } from "@/components/loading/LoadingActivity";
import type { RevenueTransaction } from "@/lib/api";
import { buildRevenueAxis, buildRevenueTrend, type RevenuePeriod } from "@/lib/revenueTrend";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});
const compactCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});
const changeCurrency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const BLUE = "#0077c0";
const CHANGE_STYLES = {
  up: "text-green-700",
  down: "text-red-700",
  flat: "text-slate-600",
};

export default function RevenueTrendChart({
  transactions,
  loading,
}: {
  transactions: RevenueTransaction[];
  loading: boolean;
}) {
  const [period, setPeriod] = useState<RevenuePeriod>("week");
  const [now, setNow] = useState(() => new Date());
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [periodOffset, setPeriodOffset] = useState(0);
  const revealed = useContext(PageRevealContext);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const trend = useMemo(
    () => buildRevenueTrend(transactions, period, now, periodOffset),
    [transactions, period, now, periodOffset],
  );
  const active = trend.buckets.find((bucket) => bucket.key === activeKey);
  const axis = buildRevenueAxis(trend.buckets.map((bucket) => bucket.amount));
  const plotWidth = 500;
  const plotHeight = 148;
  const left = 48;
  const step = plotWidth / trend.buckets.length;
  const barWidth = Math.min(9, step * 0.25);
  const periodName = period === "week" ? "week" : period === "month" ? "month" : "year";
  const animationKey = JSON.stringify([period, periodOffset, trend.buckets.map(({ key, amount }) => [key, amount])]);

  function movePeriod(delta: number) {
    setPeriodOffset((offset) => Math.max(0, offset + delta));
    setActiveKey(null);
  }

  const changeSign = trend.direction === "up" ? "+" : trend.direction === "down" ? "-" : "";
  const changeAmount = Math.abs(trend.difference);
  const change = `${changeSign}${changeAmount >= 1_000
    ? compactCurrency.format(changeAmount)
    : changeCurrency.format(changeAmount)}`;

  return (
    <section
      aria-label="Revenue trend"
      aria-busy={loading}
      data-chart-ready={revealed}
      className="flex h-[420px] min-w-0 flex-col rounded-[24px] border-[1.2px] border-[#c2c6d4] bg-white p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-inter text-[16px] font-bold text-[#1e1e24]">Revenue Trend</h2>
        <select
          aria-label="Revenue graph period"
          value={period}
          onChange={(event) => {
            setPeriod(event.target.value as RevenuePeriod);
            setActiveKey(null);
            setPeriodOffset(0);
          }}
          className="rounded-lg border border-[#c2c6d4] bg-white px-2 py-1 font-inter text-[12px] text-[#1e1e24] outline-none focus:border-[#0077c0]"
        >
          <option value="week">Week (Mon–Sun)</option>
          <option value="month">Month</option>
          <option value="year">Year (Jan–Dec)</option>
        </select>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-lg bg-[#f6f8fb] px-1 py-1">
        <button
          type="button"
          aria-label={`Previous ${periodName}`}
          title={`Previous ${periodName}`}
          onClick={() => movePeriod(1)}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-[#1e1e24] hover:bg-[#e7edf4] focus-visible:outline-2 focus-visible:outline-[#0077c0]"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4" aria-hidden="true"><path d="m12 5-5 5 5 5" /></svg>
        </button>
        <span aria-live="polite" className="min-w-0 flex-1 text-center font-inter text-[11px] font-medium text-[#1e1e24]">
          {trend.rangeLabel}
        </span>
        {periodOffset > 0 && (
          <button
            type="button"
            onClick={() => { setPeriodOffset(0); setActiveKey(null); }}
            className="rounded-md px-1.5 py-1 font-inter text-[10px] font-semibold text-[#0077c0] hover:bg-[#e7edf4]"
          >
            Current
          </button>
        )}
        <button
          type="button"
          aria-label={`Next ${periodName}`}
          title={`Next ${periodName}`}
          disabled={periodOffset === 0}
          onClick={() => movePeriod(-1)}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-[#1e1e24] hover:bg-[#e7edf4] focus-visible:outline-2 focus-visible:outline-[#0077c0] disabled:cursor-not-allowed disabled:opacity-30"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4" aria-hidden="true"><path d="m8 5 5 5-5 5" /></svg>
        </button>
      </div>

      {loading ? (
        <p role="status" className="flex flex-1 items-center justify-center font-inter text-[14px] text-[#727783]">
          Loading revenue…
        </p>
      ) : (
        <>
          <div className="mt-3" aria-live="polite">
            <p className="font-inter text-[12px] text-[#727783]">{trend.metricLabel}</p>
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="font-manrope text-[32px] font-extrabold leading-[40px] tracking-[-0.6px]" style={{ color: BLUE }}>
                {currency.format(trend.current)}
              </p>
              <p
                className={`ml-auto text-right font-manrope text-[24px] font-normal leading-8 tabular-nums ${CHANGE_STYLES[trend.direction]}`}
                title={`${changeSign}${currency.format(changeAmount)} vs ${trend.comparisonLabel}`}
              >
                <span className="whitespace-nowrap">{change}</span>{" "}
                <span className="inline-block font-inter text-[14px] font-normal">
                  vs {trend.comparisonLabel}
                </span>
              </p>
            </div>
          </div>

          <div className="relative mt-3 min-h-0 flex-1">
            {active && (
              <div className="pointer-events-none absolute right-0 top-0 z-10 rounded-md border border-[#e2e8f0] bg-white/95 px-2 py-1 font-inter text-[11px] text-[#1e1e24] shadow-sm">
                {active.fullLabel}: <strong>{currency.format(active.amount)}</strong>
              </div>
            )}
            <svg
              key={animationKey}
              viewBox="0 0 560 176"
              preserveAspectRatio="none"
              className="h-full w-full overflow-visible"
              role="group"
              aria-label={`Received revenue ${period === "year" ? "by month" : "by day"}: ${trend.rangeLabel}`}
            >
              {axis.ticks.map((tick) => {
                const y = 8 + plotHeight * (1 - tick.value / axis.maximum);
                return (
                  <g key={tick.value} aria-hidden="true">
                    <line x1={left} x2={left + plotWidth} y1={y} y2={y} stroke="#edf0f4" strokeDasharray={tick.value === 0 ? undefined : "3 4"} />
                    <text x={left - 8} y={y + 3} textAnchor="end" fontSize="10" fill="#9298a4" fontFamily="Arial, sans-serif">
                      {tick.label}
                    </text>
                  </g>
                );
              })}
              {trend.buckets.map((bucket, index) => {
                const x = left + step * (index + 0.5);
                const height = Math.max(1.5, (bucket.amount / axis.maximum) * plotHeight);
                const latest = index === trend.buckets.length - 1;
                const highlighted = bucket.key === trend.currentBucketKey;
                const showLabel = period !== "month" || index % 5 === 0 || latest;
                return (
                  <g
                    key={bucket.key}
                    tabIndex={0}
                    role="img"
                    aria-label={`${bucket.fullLabel}: ${currency.format(bucket.amount)}${highlighted ? ", current period" : ""}`}
                    onMouseEnter={() => setActiveKey(bucket.key)}
                    onMouseLeave={() => setActiveKey(null)}
                    onFocus={() => setActiveKey(bucket.key)}
                    onBlur={() => setActiveKey(null)}
                    className="outline-none"
                  >
                    <title>{bucket.fullLabel}: {currency.format(bucket.amount)}</title>
                    <rect x={x - step / 2} y={8} width={step} height={plotHeight} fill={activeKey === bucket.key ? "#f5f8fb" : "transparent"} rx={3} />
                    <rect
                      x={x - barWidth / 2}
                      y={8 + plotHeight - height}
                      width={barWidth}
                      height={height}
                      rx={barWidth / 2}
                      fill={BLUE}
                      className="chart-bar"
                      style={{ animationDelay: `${Math.min(index * 35, 350)}ms` }}
                    />
                    {showLabel && (
                      <text x={x} y={173} textAnchor="middle" fontSize="10" fill="#9298a4" fontFamily="Arial, sans-serif">
                        {bucket.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </>
      )}
    </section>
  );
}
