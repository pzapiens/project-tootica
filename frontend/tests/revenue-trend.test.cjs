const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function load(relative, mocks = {}) {
  const filename = path.resolve(__dirname, "../src", relative);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)(
    (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}

const { buildRevenueAxis, buildRevenueTrend } = load("lib/revenueTrend.ts");
const now = new Date(2026, 9, 31, 12);
const payment = (date, amount, paid = true) => ({ date: date.toISOString(), amount, paid });

test("revenue axes have a minimum ₹5K ceiling and scale higher with revenue", () => {
  for (const [amount, maximum, labels] of [
    [0.3, 5000, ["₹0", "₹1K", "₹2K", "₹3K", "₹4K", "₹5K"]],
    [50, 5000, ["₹0", "₹1K", "₹2K", "₹3K", "₹4K", "₹5K"]],
    [600, 5000, ["₹0", "₹1K", "₹2K", "₹3K", "₹4K", "₹5K"]],
    [4500, 5000, ["₹0", "₹1K", "₹2K", "₹3K", "₹4K", "₹5K"]],
    [5000, 6000, ["₹0", "₹2K", "₹4K", "₹6K"]],
    [9000, 10000, ["₹0", "₹2.5K", "₹5K", "₹7.5K", "₹10K"]],
    [10000, 15000, ["₹0", "₹5K", "₹10K", "₹15K"]],
    [42000, 60000, ["₹0", "₹20K", "₹40K", "₹60K"]],
    [720000, 800000, ["₹0", "₹2L", "₹4L", "₹6L", "₹8L"]],
    [30000000, 40000000, ["₹0", "₹1Cr", "₹2Cr", "₹3Cr", "₹4Cr"]],
  ]) {
    const axis = buildRevenueAxis([0, amount / 2, amount]);
    assert.equal(axis.maximum, maximum);
    assert.ok(axis.maximum > amount);
    assert.deepEqual(axis.ticks.map((tick) => tick.label), labels);
    assert.equal(axis.ticks[0].value, 0);
    assert.equal(axis.ticks.at(-1).value, maximum);
  }
  for (const amounts of [[], [0, 0], [NaN, Infinity, -20]]) {
    const axis = buildRevenueAxis(amounts);
    assert.equal(axis.maximum, 5000);
    assert.ok(Number.isFinite(axis.maximum) && axis.maximum > 0);
    assert.ok(axis.ticks.every((tick) => Number.isFinite(tick.value)));
  }
});

test("weekly revenue runs Monday to Sunday and compares today with yesterday", () => {
  const result = buildRevenueTrend([
    payment(new Date(2026, 9, 31, 0), 0.1),
    payment(new Date(2026, 9, 31, 23, 59), 0.2),
    payment(new Date(2026, 9, 30), 0.2),
    payment(new Date(2026, 9, 25), 50),
    payment(new Date(2026, 9, 24), 1000),
    payment(new Date(2026, 9, 31), 500, false),
    payment(new Date(2026, 10, 1), 800),
  ], "week", now);
  assert.equal(result.buckets.length, 7);
  assert.equal(result.buckets[0].key, "2026-10-26");
  assert.equal(result.buckets[6].key, "2026-11-01");
  assert.deepEqual(result.buckets.map((bucket) => bucket.label), ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  assert.equal(result.currentBucketKey, "2026-10-31");
  assert.equal(result.buckets[6].amount, 0);
  assert.equal(result.buckets[1].amount, 0);
  assert.equal(result.current, 0.3);
  assert.equal(result.previous, 0.2);
  assert.equal(result.direction, "up");
  assert.ok(Math.abs(result.percentage - 50) < 1e-8);
});

test("received advance payments appear by payment entry date in every chart period", () => {
  const today = new Date(2026, 10, 1, 12);
  const appointment = new Date(2026, 10, 3, 5);
  const transactions = [
    { ...payment(appointment, 3000), recordedAt: new Date(2026, 9, 31, 18).toISOString() },
    { ...payment(appointment, 200), recordedAt: new Date(2026, 10, 1, 0, 4).toISOString() },
    { ...payment(appointment, 900, false), recordedAt: today.toISOString() },
    { ...payment(today, 500), recordedAt: new Date(2026, 10, 2).toISOString() },
  ];
  for (const period of ["week", "month", "year"]) {
    const result = buildRevenueTrend(transactions, period, today);
    assert.equal(result.buckets.reduce((sum, bucket) => sum + bucket.amount, 0), period === "month" ? 200 : 3200);
    assert.equal(result.buckets.find((bucket) => bucket.key === result.currentBucketKey).amount, 200);
    if (period !== "year") {
      assert.equal(result.current, 200);
      assert.equal(result.previous, 3000);
      assert.equal(result.difference, -2800);
      assert.equal(result.direction, "down");
    }
  }

  // Rescheduling the appointment cannot move already-recorded revenue.
  const rescheduled = transactions.map((transaction) => ({
    ...transaction,
    date: new Date(2027, 0, 1).toISOString(),
  }));
  assert.deepEqual(
    buildRevenueTrend(rescheduled, "week", today),
    buildRevenueTrend(transactions, "week", today),
  );
});

test("month view covers the full selected month and compares it with the previous month", () => {
  const result = buildRevenueTrend([
    payment(new Date(2026, 9, 31), 100),
    payment(new Date(2026, 9, 25), 200),
    payment(new Date(2026, 9, 24), 400),
    payment(new Date(2026, 9, 18), 600),
    payment(new Date(2026, 9, 17), 2000),
    payment(new Date(2026, 8, 30), 10000),
  ], "month", now);
  assert.equal(result.buckets.length, 31);
  assert.equal(result.buckets[0].key, "2026-10-01");
  assert.equal(result.buckets.at(-1).key, "2026-10-31");
  assert.equal(result.current, 3300);
  assert.equal(result.previous, 10000);
  assert.equal(result.percentage, -67);
  assert.equal(result.direction, "down");
  assert.equal(result.comparisonLabel, "last month");
});

test("year view runs January to December and compares calendar years", () => {
  const result = buildRevenueTrend([
    payment(new Date(2026, 0, 31), 250),
    payment(new Date(2025, 11, 1), 50),
    payment(new Date(2025, 11, 31), 150),
    payment(new Date(2024, 11, 31), 3000),
    payment(new Date(2026, 1, 1), 4000),
  ], "year", new Date(2026, 0, 31));
  assert.equal(result.buckets.length, 12);
  assert.equal(result.buckets[0].key, "2026-01");
  assert.equal(result.buckets[11].key, "2026-12");
  assert.deepEqual(result.buckets.map((bucket) => bucket.label), ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"]);
  assert.equal(result.buckets[0].amount, 250);
  assert.ok(result.buckets.slice(1).every((bucket) => bucket.amount === 0));
  assert.equal(result.current, 250);
  assert.equal(result.previous, 200);
  assert.equal(result.percentage, 25);
  assert.equal(result.metricLabel, "This year's revenue");
  assert.equal(result.comparisonLabel, "last year");
});

test("leap days and short months produce the exact number of calendar buckets", () => {
  const result = buildRevenueTrend([], "month", new Date(2024, 1, 29));
  assert.equal(result.buckets.length, 29);
  assert.equal(result.buckets[0].key, "2024-02-01");
  assert.equal(result.buckets.at(-1).key, "2024-02-29");
  assert.equal(new Set(result.buckets.map((bucket) => bucket.key)).size, 29);
  for (const [year, month, days] of [[2025, 1, 28], [2026, 3, 30], [2026, 0, 31]]) {
    const monthTrend = buildRevenueTrend([], "month", new Date(year, month, 15));
    assert.equal(monthTrend.buckets.length, days);
    assert.equal(monthTrend.buckets.at(-1).key.slice(-2), String(days));
  }
  const year = buildRevenueTrend([], "year", new Date(2024, 1, 29));
  assert.equal(year.buckets[0].key, "2024-01");
  assert.equal(year.buckets.at(-1).key, "2024-12");
});

test("calendar navigation handles Mondays, Sundays and year boundaries", () => {
  const monday = buildRevenueTrend([], "week", new Date(2026, 10, 2));
  assert.equal(monday.buckets[0].key, "2026-11-02");
  assert.equal(monday.buckets.at(-1).key, "2026-11-08");
  const sunday = buildRevenueTrend([], "week", new Date(2026, 10, 8));
  assert.deepEqual(sunday.buckets, monday.buckets);
  const newYear = buildRevenueTrend([], "week", new Date(2027, 0, 1));
  assert.equal(newYear.buckets[0].key, "2026-12-28");
  assert.equal(newYear.buckets.at(-1).key, "2027-01-03");
  assert.match(newYear.rangeLabel, /2026/);
  assert.match(newYear.rangeLabel, /2027/);
  const december = buildRevenueTrend([], "month", new Date(2027, 0, 31), 1);
  assert.equal(december.buckets[0].key, "2026-12-01");
  assert.equal(december.buckets.at(-1).key, "2026-12-31");
  const february = buildRevenueTrend([], "month", new Date(2024, 2, 31), 1);
  assert.equal(february.buckets[0].key, "2024-02-01");
  assert.equal(february.buckets.at(-1).key, "2024-02-29");
});

test("empty and zero-baseline data never produce NaN or infinite percentages", () => {
  const empty = buildRevenueTrend([], "week", now);
  assert.equal(empty.current, 0);
  assert.equal(empty.direction, "flat");
  assert.equal(empty.percentage, null);
  const first = buildRevenueTrend([
    payment(now, 100),
    { date: "invalid", amount: 99, paid: true },
    payment(now, NaN),
  ], "week", now);
  assert.equal(first.current, 100);
  assert.equal(first.percentage, null);
  assert.equal(first.direction, "up");
});

test("previous weeks exclude later payments from historical totals and comparisons", () => {
  const result = buildRevenueTrend([
    payment(new Date(2026, 9, 25), 100),
    payment(new Date(2026, 9, 24), 50),
    payment(new Date(2026, 9, 31), 9000),
  ], "week", now, 1);
  assert.equal(result.buckets[0].key, "2026-10-19");
  assert.equal(result.buckets.at(-1).key, "2026-10-25");
  assert.equal(result.current, 100);
  assert.equal(result.previous, 50);
  assert.equal(result.isCurrentPeriod, false);
  assert.match(result.metricLabel, /25 Oct 2026/);
  assert.match(result.comparisonLabel, /24 Oct 2026/);
  const earlier = buildRevenueTrend([], "week", now, 2);
  assert.equal(earlier.buckets[0].key, "2026-10-12");
  assert.equal(earlier.buckets.at(-1).key, "2026-10-18");
});

test("month navigation selects complete months and compares the preceding month", () => {
  const result = buildRevenueTrend([
    payment(new Date(2026, 8, 30), 100),
    payment(new Date(2026, 8, 25), 200),
    payment(new Date(2026, 7, 24), 400),
    payment(new Date(2026, 7, 18), 600),
    payment(new Date(2026, 9, 1), 9000),
  ], "month", now, 1);
  assert.equal(result.buckets.length, 30);
  assert.equal(result.buckets[0].key, "2026-09-01");
  assert.equal(result.buckets.at(-1).key, "2026-09-30");
  assert.equal(result.current, 300);
  assert.equal(result.previous, 1000);
  assert.equal(result.percentage, -70);
  assert.equal(result.metricLabel, "September 2026 revenue");
  assert.equal(result.comparisonLabel, "August 2026");
});

test("year navigation preserves twelve full months and handles leap-day anchors", () => {
  const result = buildRevenueTrend([
    payment(new Date(2025, 9, 1), 100),
    payment(new Date(2025, 9, 31, 23, 59), 200),
    payment(new Date(2024, 8, 30), 500),
    payment(new Date(2025, 10, 1), 9000),
  ], "year", now, 1);
  assert.equal(result.buckets[0].key, "2025-01");
  assert.equal(result.buckets.at(-1).key, "2025-12");
  assert.equal(result.current, 9300);
  assert.equal(result.previous, 500);
  assert.ok(Math.abs(result.percentage - 1760) < 1e-8);
  assert.equal(result.metricLabel, "2025 revenue");
  assert.equal(result.comparisonLabel, "2024");
  const leap = buildRevenueTrend([], "year", new Date(2024, 1, 29), 1);
  assert.equal(leap.buckets.length, 12);
  assert.equal(leap.buckets[0].key, "2023-01");
  assert.equal(leap.buckets.at(-1).key, "2023-12");
});

function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

test("period controls highlight today's bucket while keeping revenue blue and axis labels neutral", () => {
  const cells = [];
  let cursor = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in cells)) cells[index] = typeof initial === "function" ? initial() : initial;
      return [cells[index], (next) => {
        cells[index] = typeof next === "function" ? next(cells[index]) : next;
      }];
    },
    useEffect() {},
    useMemo: (calculate) => calculate(),
  };
  const Chart = load("app/clinic-selection/[code]/revenue/RevenueTrendChart.tsx", {
    react,
    "@/lib/revenueTrend": {
      buildRevenueAxis,
      buildRevenueTrend: (items, period, _now, offset) => buildRevenueTrend(items, period, now, offset),
    },
  }).default;
  const transactions = [
    payment(new Date(2026, 9, 31), 200),
    payment(new Date(2026, 9, 30), 100),
    payment(new Date(2026, 9, 25), 20000),
    payment(new Date(2026, 8, 30), 30000),
  ];
  const render = (loading = false) => {
    cursor = 0;
    return Chart({ transactions, loading });
  };
  const bars = (tree) => nodes(tree).filter((node) =>
    node.type === "rect" && ["#0077c0", "#16a34a", "#dc2626"].includes(node.props.fill),
  );
  const yLabels = () => nodes(render())
    .filter((node) => node.type === "text" && node.props.textAnchor === "end")
    .map((node) => node.props.children);
  let weekStep;
  for (const [period, count, highlightedIndex, color] of [
    ["week", 7, 5, "#16a34a"],
    ["month", 31, 30, "#dc2626"],
    ["year", 12, 9, "#16a34a"],
  ]) {
    nodes(render()).find((node) => node.type === "select").props.onChange({ target: { value: period } });
    const tree = render();
    const columns = bars(tree);
    assert.equal(columns.length, count);
    assert.ok(columns.every((node, index) => index === highlightedIndex || node.props.fill === "#0077c0"));
    assert.equal(columns[highlightedIndex].props.fill, color);
    const summary = nodes(tree).find((node) => node.type === "p" && node.props.style?.color);
    assert.equal(summary.props.style.color, "#0077c0");
    const xLabels = nodes(tree).filter((node) => node.type === "text" && node.props.textAnchor === "middle");
    assert.ok(xLabels.every((node) => node.props.fill === "#9298a4"));
    const step = columns[1].props.x - columns[0].props.x;
    if (period === "week") weekStep = step;
    if (period === "month") assert.ok(step < weekStep);
    if (period === "week") assert.deepEqual(yLabels(), ["₹0", "₹1K", "₹2K", "₹3K", "₹4K", "₹5K"]);
    if (period === "month") assert.deepEqual(yLabels(), ["₹0", "₹10K", "₹20K", "₹30K"]);
    assert.ok(columns.every((node) => node.props.x + node.props.width <= 548));
  }
  assert.equal(nodes(render(true)).some((node) => node.type === "svg" && node.props.role === "group"), false);

  const control = (label) => nodes(render()).find((node) => node.props?.["aria-label"] === label).props;
  const barKeys = () => nodes(render()).filter((node) => node.type === "g" && node.props.role === "img").map((node) => node.key);
  for (const period of ["week", "month", "year"]) {
    nodes(render()).find((node) => node.type === "select").props.onChange({ target: { value: period } });
    const currentKeys = barKeys();
    const currentAxis = yLabels();
    assert.equal(control(`Next ${period}`).disabled, true);
    control(`Previous ${period}`).onClick();
    const historicalKeys = barKeys();
    assert.equal(control(`Next ${period}`).disabled, false);
    assert.notDeepEqual(historicalKeys, currentKeys);
    if (period === "week") assert.notDeepEqual(yLabels(), currentAxis);
    assert.ok(bars(render()).every((node) => node.props.fill === "#0077c0"));
    control(`Next ${period}`).onClick();
    assert.deepEqual(barKeys(), currentKeys);
    assert.deepEqual(yLabels(), currentAxis);
    assert.equal(control(`Next ${period}`).disabled, true);
    control(`Previous ${period}`).onClick();
    control(`Previous ${period}`).onClick();
    nodes(render()).find((node) => node.type === "button" && node.props.children === "Current").props.onClick();
    assert.deepEqual(barKeys(), currentKeys);
  }
  control("Previous year").onClick();
  nodes(render()).find((node) => node.type === "select").props.onChange({ target: { value: "week" } });
  assert.equal(control("Next week").disabled, true);
});
