import type { RevenueTransaction } from "./api";

export type RevenuePeriod = "week" | "month" | "year";

export interface RevenueBucket {
  key: string;
  label: string;
  fullLabel: string;
  amount: number;
}

/** Readable INR intervals, starting with a ₹5K ceiling and scaling up as needed. */
export function buildRevenueAxis(amounts: number[]) {
  const highest = amounts.reduce(
    (max, amount) => Number.isFinite(amount) ? Math.max(max, amount) : max,
    0,
  );
  const padded = Math.max(5_000, highest * 1.1);
  const roughStep = padded / (padded === 5_000 ? 5 : 4);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const multiplier = [1, 2, 2.5, 5, 10].find(
    (candidate) => candidate >= roughStep / magnitude,
  ) ?? 10;
  // Monetary ticks must not use fractions smaller than one paise.
  const step = Math.max(1, Math.ceil(multiplier * magnitude * 100)) / 100;
  const intervals = Math.ceil(padded / step);
  const maximum = Number((intervals * step).toFixed(2));
  const unit = maximum >= 1e7
    ? { divisor: 1e7, suffix: "Cr" }
    : maximum >= 1e5
      ? { divisor: 1e5, suffix: "L" }
      : maximum >= 1e3
        ? { divisor: 1e3, suffix: "K" }
        : { divisor: 1, suffix: "" };
  const formatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

  return {
    maximum,
    ticks: Array.from({ length: intervals + 1 }, (_, index) => {
      const value = Number((index * step).toFixed(2));
      return {
        value,
        label: value === 0 ? "₹0" : `₹${formatter.format(value / unit.divisor)}${unit.suffix}`,
      };
    }),
  };
}

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const monthKey = (date: Date) => dayKey(date).slice(0, 7);

/** Calendar days, rather than elapsed 24-hour windows, also work across DST. */
function dayOffset(date: Date, offset: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
}

/** Received revenue is grouped by payment entry date, independently of the
 * appointment schedule. Older API responses fall back to the appointment date. */
export function buildRevenueTrend(
  transactions: Pick<RevenueTransaction, "amount" | "paid" | "date" | "recordedAt">[],
  period: RevenuePeriod,
  now = new Date(),
  periodOffset = 0,
) {
  const today = dayOffset(now, 0);
  const monthly = period === "year";
  const offset = Math.max(0, Math.trunc(periodOffset));
  const rangeStart = monthly
    ? new Date(today.getFullYear() - offset, 0, 1)
    : period === "month"
      ? new Date(today.getFullYear(), today.getMonth() - offset, 1)
      : dayOffset(today, -((today.getDay() + 6) % 7) - offset * 7);
  const endExclusive = monthly
    ? new Date(rangeStart.getFullYear() + 1, 0, 1)
    : period === "month"
      ? new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 1, 1)
      : dayOffset(rangeStart, 7);
  const endDay = dayOffset(endExclusive, -1);
  // Draw the complete calendar period, with future buckets left empty.
  const cutoff = Math.min(endExclusive.getTime(), dayOffset(today, 1).getTime());
  const count = monthly ? 12 : period === "month" ? endDay.getDate() : 7;
  const starts = Array.from({ length: count }, (_, index) =>
    monthly
      ? new Date(rangeStart.getFullYear(), index, 1)
      : dayOffset(rangeStart, index),
  );
  const currentStart = rangeStart;
  const previousStart = monthly
    ? new Date(rangeStart.getFullYear() - 1, 0, 1)
    : period === "month"
      ? new Date(rangeStart.getFullYear(), rangeStart.getMonth() - 1, 1)
      : dayOffset(rangeStart, -7);
  const keyFor = monthly ? monthKey : dayKey;
  const totals = new Map(starts.map((start) => [keyFor(start), 0]));
  let currentCents = 0;
  let previousCents = 0;

  for (const transaction of transactions) {
    if (!transaction.paid || !Number.isFinite(transaction.amount)) continue;
    const date = new Date(transaction.recordedAt ?? transaction.date);
    if (!Number.isFinite(date.getTime()) || date.getTime() >= cutoff) continue;
    const cents = Math.round(transaction.amount * 100);
    const key = keyFor(date);
    if (totals.has(key)) totals.set(key, totals.get(key)! + cents);
    if (date >= currentStart) currentCents += cents;
    else if (date >= previousStart) previousCents += cents;
  }

  const buckets: RevenueBucket[] = starts.map((start) => ({
    key: keyFor(start),
    label: start.toLocaleDateString("en-GB", monthly
      ? { month: "short" }
      : period === "week" ? { weekday: "short" } : { day: "numeric", month: "short" }),
    fullLabel: start.toLocaleDateString("en-GB", monthly
      ? { month: "long", year: "numeric" }
      : { day: "numeric", month: "long", year: "numeric" }),
    amount: (totals.get(keyFor(start)) ?? 0) / 100,
  }));
  const difference = (currentCents - previousCents) / 100;
  return {
    buckets,
    current: currentCents / 100,
    previous: previousCents / 100,
    difference,
    // A zero baseline has no meaningful percentage increase.
    percentage: previousCents === 0 ? null : (difference / (Math.abs(previousCents) / 100)) * 100,
    direction: difference > 0 ? "up" as const : difference < 0 ? "down" as const : "flat" as const,
    isCurrentPeriod: offset === 0,
    currentBucketKey: offset === 0 ? keyFor(today) : null,
    metricLabel: monthly
      ? offset === 0 ? "This year's revenue" : `${rangeStart.getFullYear()} revenue`
      : period === "month"
        ? offset === 0 ? "This month's revenue" : `${rangeStart.toLocaleDateString("en-GB", { month: "long", year: "numeric" })} revenue`
        : offset === 0 ? "This week's revenue" : "Selected week's revenue",
    comparisonLabel: monthly
      ? offset === 0 ? "last year" : String(previousStart.getFullYear())
      : period === "month"
        ? offset === 0 ? "last month" : previousStart.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
        : offset === 0 ? "last week" : "previous week",
    rangeLabel: `${starts[0].toLocaleDateString("en-GB", monthly
      ? { month: "short", year: "numeric" }
      : { day: "numeric", month: "short", ...(starts[0].getFullYear() !== endDay.getFullYear() ? { year: "numeric" as const } : {}) })} – ${endDay.toLocaleDateString("en-GB", monthly
      ? { month: "short", year: "numeric" }
      : { day: "numeric", month: "short", year: "numeric" })}`,
  };
}
