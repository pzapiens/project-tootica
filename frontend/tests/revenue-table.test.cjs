const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = path.resolve(__dirname, "../src");

function load(file, mocks = {}, environment = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "document", "URL", "Blob", code)(
    name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), loaded, loaded.exports,
    environment.document, environment.URL ?? URL, Blob,
  );
  return loaded.exports;
}
const nodes = tree => !tree || typeof tree !== "object" ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
const find = (tree, predicate) => nodes(tree).find(predicate);
const settle = () => new Promise(resolve => setImmediate(resolve));
const Pagination = () => null;
const TimeFilter = () => null;
const FilterPanel = () => null;
const Donut = () => null;
const emptyFilters = { idSort: null, paymentStatuses: [], consultationTypes: [] };
const records = (count = 45) => Array.from({ length: count }, (_, index) => ({
  id: String(index + 1),
  code: `TX${String(index + 1).padStart(3, "0")}`,
  patientName: `Patient ${String(index + 1).padStart(2, "0")}`,
  consultationType: index % 2 ? "ORTHODONTICS" : "CONSULTATION",
  amount: (index + 1) * 100,
  paid: index % 2 === 0,
  date: new Date(2026, 10, 13, 9, index).toISOString(),
}));

function harness(initial = records()) {
  const state = [], effectDependencies = [];
  let cursor = 0, effectCursor = 0, effects = [], revision = 0, data = initial, csvBlob;
  const hooks = {
    ...React,
    useState(initialValue) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initialValue === "function" ? initialValue() : initialValue;
      return [state[index], next => { state[index] = typeof next === "function" ? next(state[index]) : next; }];
    },
    useMemo: calculate => calculate(),
    useEffect(callback, dependencies) {
      const index = effectCursor++;
      if (!effectDependencies[index] || dependencies.some((value, offset) => value !== effectDependencies[index][offset])) {
        effectDependencies[index] = dependencies;
        effects.push(callback);
      }
    },
  };
  const Component = load("app/clinic-selection/[code]/revenue/RevenueClient.tsx", {
    react: hooks,
    "next/image": () => null,
    "@/components/TablePagination": Pagination,
    "@/components/loading/PageSkeletons": { RevenueSkeleton: () => null },
    "@/lib/api": { apiFetch: async () => data },
    "@/lib/analytics": { frameRange: timeframe => timeframe.kind === "all" ? null : { from: new Date(timeframe.from), to: new Date(timeframe.to) } },
    "@/lib/appointmentsBus": { useAppointmentsRevision: () => revision },
    "@/lib/statusColors": load("lib/statusColors.ts"),
    "@/components/HoverTip": { Tip: () => null },
    "@/components/DonutChart": Donut,
    "../dashboard/TimeframeFilter": TimeFilter,
    "../dashboard/AppointmentFormStep": { CONSULTATION_TYPES: ["CONSULTATION", "ORTHODONTICS"] },
    "./RevenueFilterPanel": { default: FilterPanel, __esModule: true, EMPTY_REVENUE_FILTERS: emptyFilters, revenueFilterCount: filters => Number(Boolean(filters.idSort)) + filters.paymentStatuses.length + filters.consultationTypes.length },
    "./RevenueTrendChart": () => null,
    "./revenue.module.css": { __esModule: true, default: { tableAndPagination: "tableAndPagination", tableFrame: "tableFrame", table: "table" } },
  }, {
    document: { createElement: () => ({ click() {} }) },
    URL: { createObjectURL(blob) { csvBlob = blob; return "blob:test"; }, revokeObjectURL() {} },
  }).default;
  function render() {
    cursor = 0; effectCursor = 0; effects = [];
    const tree = Component();
    effects.forEach(effect => effect());
    return tree;
  }
  return {
    render,
    async ready() { render(); await settle(); return render(); },
    async refresh(next) { data = next; revision++; render(); await settle(); return render(); },
    csv: () => csvBlob.text(),
  };
}
const footer = tree => find(tree, node => node.type === Pagination).props;
const codes = tree => nodes(tree).filter(node => node.props?.["data-label"] === "Transaction ID").map(node => node.props.children);
const search = tree => find(tree, node => node.props?.["aria-label"] === "Search transactions").props;

test("Revenue paginates sorted transactions and keeps its footer directly after the table", async () => {
  const app = harness();
  let tree = await app.ready();
  const first = codes(tree);
  assert.equal(first.length, 20);
  assert.equal(first[0], "TX045");
  assert.equal(footer(tree).totalRecords, 45);
  const tableBlock = find(tree, node => node.props?.className === "tableAndPagination");
  const [frame, pagination] = React.Children.toArray(tableBlock.props.children);
  assert.ok(find(frame, node => node.type === "table"));
  assert.equal(pagination.type, Pagination);
  assert.ok(nodes(frame).every(node => !/overflow-[xy]-(auto|scroll)|max-h-/.test(node.props?.className ?? "")));
  footer(tree).onPageChange(2);
  tree = app.render();
  assert.equal(codes(tree).length, 20);
  assert.ok(codes(tree).every(code => !first.includes(code)));
  footer(tree).onPageChange(3);
  tree = app.render();
  assert.equal(codes(tree).length, 5);
  assert.equal(footer(tree).currentPage, 3);
  const headers = nodes(tree).filter(node => node.type === "th");
  assert.equal(headers.length, 6);
  assert.ok(headers.every(node => node.props.scope === "col"));
});

test("search, timeframe, facet, and pie filters return Revenue to the first page", async () => {
  const app = harness();
  let tree = await app.ready();
  footer(tree).onPageChange(3);
  search(tree).onChange({ target: { value: "Patient 01" } });
  tree = app.render();
  assert.deepEqual(codes(tree), ["TX001"]);
  assert.equal(footer(tree).currentPage, 1);
  search(tree).onChange({ target: { value: "" } });
  tree = app.render();
  footer(tree).onPageChange(3);
  const transactionFilter = nodes(tree).filter(node => node.type === TimeFilter)[1];
  transactionFilter.props.onChange({ kind: "range", from: new Date(2026, 10, 13, 9, 0).toISOString(), to: new Date(2026, 10, 13, 9, 9).toISOString() });
  tree = app.render();
  assert.equal(footer(tree).currentPage, 1);
  assert.equal(footer(tree).totalRecords, 10);
  nodes(tree).filter(node => node.type === TimeFilter)[1].props.onChange({ kind: "all" });
  tree = app.render();
  footer(tree).onPageChange(3);
  find(tree, node => node.props?.label === "Filter transactions").props.onClick();
  const panel = app.render();
  assert.equal(panel.type, FilterPanel);
  panel.props.onApply({ ...emptyFilters, paymentStatuses: ["Received"] });
  panel.props.onClose();
  tree = app.render();
  assert.equal(footer(tree).currentPage, 1);
  assert.equal(footer(tree).totalRecords, 23);
  footer(tree).onPageChange(2);
  find(tree, node => node.type === Donut).props.onSelect("Received");
  tree = app.render();
  assert.equal(footer(tree).currentPage, 1);
});

test("page-size changes reset the page and refreshed data clamps an out-of-range page", async () => {
  const app = harness();
  let tree = await app.ready();
  footer(tree).onPageChange(3);
  footer(tree).onPageSizeChange(10);
  tree = app.render();
  assert.equal(footer(tree).currentPage, 1);
  assert.equal(codes(tree).length, 10);
  footer(tree).onPageChange(5);
  tree = await app.refresh(records(12));
  assert.equal(footer(tree).currentPage, 2);
  assert.equal(codes(tree).length, 2);
});

test("Revenue CSV exports the entire filtered result rather than just the visible page", async () => {
  const app = harness();
  let tree = await app.ready();
  footer(tree).onPageChange(2);
  tree = app.render();
  find(tree, node => node.props?.label === "Export revenue to CSV").props.onClick();
  let lines = (await app.csv()).split("\n");
  assert.equal(lines.length, 46);
  assert.ok(lines[1].startsWith("TX045,"));
  search(tree).onChange({ target: { value: "Patient 01" } });
  tree = app.render();
  find(tree, node => node.props?.label === "Export revenue to CSV").props.onClick();
  lines = (await app.csv()).split("\n");
  assert.equal(lines.length, 2);
  assert.ok(lines[1].startsWith("TX001,"));
});

test("the standard footer changes pages and offers the same page sizes as the other pages", () => {
  let selectedPage, selectedSize;
  const Panel = () => null;
  const Footer = load("components/TablePagination.tsx", {
    react: { ...React, useRef: () => ({ current: null }) },
    "next/image": () => null,
    "./FloatingPanel": Panel,
    "@/lib/useExclusiveDropdown": { useExclusiveDropdown: () => [true, () => {}] },
  }).default;
  const props = { totalRecords: 45, currentPage: 1, pageSize: 20, onPageChange: page => { selectedPage = page; }, onPageSizeChange: size => { selectedSize = size; } };
  let tree = Footer(props);
  assert.match(renderToStaticMarkup(tree), /Showing 1-20 of 45 records/);
  find(tree, node => node.props?.["aria-label"] === "Page 2").props.onClick();
  assert.equal(selectedPage, 2);
  const pageSizes = nodes(tree).filter(node => node.props?.role === "menuitemradio");
  assert.deepEqual(pageSizes.map(node => node.props.children[0]), [10, 20, 50, 100]);
  pageSizes[2].props.onClick();
  assert.equal(selectedSize, 50);
  const previous = find(tree, node => node.props?.label === "Previous page");
  assert.equal(previous.type(previous.props).props.disabled, true);
  tree = Footer({ ...props, currentPage: 3 });
  assert.match(renderToStaticMarkup(tree), /Showing 41-45 of 45 records/);
  const next = find(tree, node => node.props?.label === "Next page");
  assert.equal(next.type(next.props).props.disabled, true);
  assert.equal(Footer({ ...props, totalRecords: 0 }), null);
});
