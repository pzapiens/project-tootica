const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), loaded, loaded.exports);
  return loaded.exports;
}
const calendar = load("app/clinic-selection/[code]/calendar/calendar-mock.ts");
const preview = calendar.previewAppointmentsForDay;
const today = new Date(2026, 10, 13);
const appointments = (count, ongoing = -1) => Array.from({ length: count }, (_, index) => ({ id: String(index + 1), status: index === ongoing ? "Ongoing" : "Upcoming" }));
const ids = entries => entries.map(entry => entry?.id ?? null);

test("future dates show the first three and past dates show the last three in chronological order", () => {
  const items = appointments(7);
  assert.deepEqual(ids(preview(items, new Date(2026, 10, 14), today)), ["1", "2", "3"]);
  assert.deepEqual(ids(preview(items, new Date(2026, 10, 12), today)), ["5", "6", "7"]);
  assert.deepEqual(items.map(item => item.id), ["1", "2", "3", "4", "5", "6", "7"]);
  assert.deepEqual(ids(preview(items, new Date(2027, 0, 1), today)), ["1", "2", "3"]);
  assert.deepEqual(ids(preview(items, new Date(2025, 11, 31), today)), ["5", "6", "7"]);
});

test("today centers an ongoing appointment between its immediate neighbors", () => {
  const items = appointments(7, 4);
  assert.deepEqual(ids(preview(items, today, today)), ["4", "5", "6"]);
  assert.deepEqual(ids(preview(items, new Date(2026, 10, 13, 23, 59), today)), ["4", "5", "6"]);
});

test("ongoing appointments stay centered at the start or end of a sparse day without duplicates", () => {
  assert.deepEqual(ids(preview(appointments(4, 0), today, today)), [null, "1", "2"]);
  assert.deepEqual(ids(preview(appointments(4, 3), today, today)), ["3", "4", null]);
  assert.deepEqual(ids(preview(appointments(1, 0), today, today)), [null, "1", null]);
  assert.deepEqual(ids(preview(appointments(2, 1), today, today)), ["1", "2", null]);
});

test("days without ongoing appointments retain real statuses and handle empty days", () => {
  const items = appointments(5);
  items[0].status = "Completed";
  items[1].status = "Cancelled";
  assert.deepEqual(ids(preview(items, today, today)), ["1", "2", "3"]);
  assert.deepEqual(items.map(item => item.status), ["Completed", "Cancelled", "Upcoming", "Upcoming", "Upcoming"]);
  assert.deepEqual(preview([], today, today), []);
  assert.equal(preview(appointments(2), new Date(2026, 10, 14), today).length, 2);
});

const nodes = tree => !tree || typeof tree !== "object" ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
test("calendar renders three-entry previews in equal-height cells and preserves hidden appointments in the day drawer", () => {
  const actualToday = new Date();
  const groups = {};
  for (const day of [1, actualToday.getDate(), new Date(actualToday.getFullYear(), actualToday.getMonth() + 1, 0).getDate()]) groups[day] = appointments(7, day === actualToday.getDate() ? 4 : -1);
  const state = [{ year: actualToday.getFullYear(), month: actualToday.getMonth() }, null, null, groups, false];
  let cursor = 0;
  const Calendar = load("app/clinic-selection/[code]/calendar/FullCalendarView.tsx", {
    react: { ...React, useState: () => { const index = cursor++; return [state[index], next => { state[index] = next; }]; }, useMemo: fn => fn(), useEffect() {} },
    "react-dom": { createPortal() {} },
    "next/image": () => null,
    "next/navigation": { useParams: () => ({ code: "fixture" }), useSearchParams: () => ({ get: () => null }), useRouter: () => ({ push() {} }) },
    "@/components/TableViewport": () => null,
    "@/components/loading/PageSkeletons": { CalendarSkeleton: () => null },
    "@/lib/api": {}, "@/components/BackButton": () => null, "@/lib/statusColors": {}, "@/lib/useExclusiveDropdown": {},
    "./calendar-mock": calendar,
  }).default;
  const render = () => { cursor = 0; return Calendar(); };
  const tree = render();
  const cells = nodes(tree).filter(node => node.type === "button" && node.props.className?.includes("h-[160px]"));
  assert.ok(cells.length >= 28);
  const populated = cells.filter(cell => nodes(cell).some(node => node.type?.name === "ApptChip"));
  assert.ok(populated.length >= 1);
  for (const cell of populated) {
    assert.equal(nodes(cell).filter(node => node.type?.name === "ApptChip").length, 3);
    const more = nodes(cell).find(node => Array.isArray(node.props?.children) && node.props.children[0] === "+");
    assert.equal(more.props.children[1], 4);
  }
  const todayCell = populated.find(cell => nodes(cell).some(node => node.type?.name === "ApptChip" && node.props.appt.status === "Ongoing"));
  const chips = nodes(todayCell).filter(node => node.type?.name === "ApptChip");
  assert.deepEqual(chips.map(chip => chip.props.appt.id), ["4", "5", "6"]);
  todayCell.props.onClick();
  const drawer = nodes(render()).find(node => node.type?.name === "SlideOver");
  assert.equal(drawer.props.appts.length, 7);
});
test("explicit ongoing statuses from the API remain ongoing in the calendar", () => {
  assert.equal(calendar.computeCalStatus({ status: "ONGOING" }), "Ongoing");
  assert.equal(calendar.computeCalStatus({ status: "COMPLETED" }), "Completed");
  assert.equal(calendar.computeCalStatus({ status: "CANCELLED" }), "Cancelled");
});