const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const directory = path.resolve(__dirname, "../src/app/clinic-selection/[code]/dashboard");
function load(file, imports = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(directory, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", source)(
    (name) => Object.hasOwn(imports, name) ? imports[name] : require(name), module, module.exports,
  );
  return module.exports;
}
const demo = load("demo-appointments.ts");
const metadata = load("mock.ts");
function findAll(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [ ...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => findAll(child, predicate)) ];
}
function renderTable({ code = "SFD001-B001", status = "All status", query = "", items = [] } = {}) {
  let cursor = 0;
  const state = [query, items, false, null, 1, {}];
  const calls = [];
  const hooks = {
    ...React,
    useState: () => { const i = cursor++; return [state[i], value => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; },
    useMemo: fn => fn(),
    useEffect: () => {},
  };
  const Component = load("AppointmentsTable.tsx", {
    react: hooks,
    "next/image": () => null,
    "next/navigation": { useParams: () => ({ code }) },
    "@/lib/api": { apiFetch: (...args) => { calls.push(args); return Promise.resolve([]); } },
    "@/lib/appointmentsBus": { useAppointmentsRevision: () => 0 },
    "@/lib/whatsapp": { bookingChannelLabel: value => value },
    "@/lib/statusColors": { statusDropdownColor: () => ({ bg: "", text: "" }), statusDropdownBadgeClass: () => "", statusColor: () => ({ accent: "blue" }) },
    "@/lib/useExclusiveDropdown": {},
    "@/components/HoverTip": { Tip: () => null },
    "@/components/loading/PageSkeletons": { DashboardTableSkeleton: () => null },
    "./dashboard.module.css": {},
    "./NewAppointmentModal": () => null,
    "./mock": metadata,
    "./demo-appointments": demo,
  }).default;
  const render = () => {
    cursor = 0;
    return Component({ heading: "Today's Appointments", status, onStatusChange: () => {} });
  };
  return { rows: findAll(render(), n => typeof n.type === "function" && n.type.name === "Row"), calls, render };
}

test("ten unique demo visits use the supplied current day and remain in Kozhikode only", () => {
  const rows = demo.createTodayDemoAppointments("SFD001-B001", new Date(2026, 10, 12));
  assert.equal(rows.length, 10);
  assert.equal(new Set(rows.map(row => row.id)).size, 10);
  assert.ok(rows.every(row => row.date === "12/11/2026" && row.patientName.endsWith("(Demo)") && demo.isDemoAppointment(row.id)));
  assert.deepEqual(demo.createTodayDemoAppointments("SFD001-B002", new Date()), []);
  assert.deepEqual(demo.createTodayDemoAppointments("OTHER-B001", new Date()), []);
  assert.ok(demo.createTodayDemoAppointments("SFD001-B001", new Date(2027, 0, 2)).every(row => row.date === "02/01/2027"));
});

test("today's table displays all ten samples only in the requested branch", () => {
  assert.equal(renderTable().rows.length, 10);
  assert.equal(renderTable({ code: "SFD001-B002" }).rows.length, 0);
});

test("demo visits respect the table's status filter and patient/doctor/treatment search", () => {
  const filtered = renderTable({ status: "Upcoming" }).rows;
  assert.equal(filtered.length, 5);
  assert.ok(filtered.every(row => row.props.appt.status === "Upcoming"));
  assert.equal(renderTable({ query: "meera" }).rows.length, 1);
  assert.equal(renderTable({ query: "root canal" }).rows.length, 1);
  assert.equal(renderTable({ query: "rahul menon" }).rows.length, 5);
  assert.equal(renderTable({ query: "missing name" }).rows.length, 0);
});

test("demo actions open the prefilled editor and save changes locally", () => {
  const { rows, calls, render } = renderTable();
  for (const row of rows) {
    const button = findAll(row.type(row.props), n => n.type === "button")[0];
    assert.ok(!button.props.disabled);
    button.props.onClick();
    const modal = findAll(render(), n => n.props.edit)[0];
    assert.equal(modal.props.edit.id, row.props.appt.id);
    assert.equal(modal.props.edit.patient.name, row.props.appt.patientName);
    assert.equal(modal.props.edit.initial.date, row.props.appt.date);
    assert.deepEqual(modal.props.edit.initial.consultation, [row.props.appt.consultationType]);
    assert.equal(typeof modal.props.onPreviewSave, "function");
  }
  const modal = findAll(render(), n => n.props.edit)[0];
  const original = rows.at(-1).props.appt;
  modal.props.onPreviewSave({ consultationType: "Root Canal", leadSource: "WEBSITE", message: "Preview change", scheduleMode: "datetime", date: original.date, startTime: "03:00 PM", endTime: "03:30 PM", doctor: "Anjali Nair", status: "Upcoming", nonMandatory: true });
  modal.props.onClose();
  const updated = findAll(render(), n => n.props.appt?.id === original.id)[0].props.appt;
  assert.equal(updated.consultationType, "Root Canal");
  assert.equal(updated.message, "Preview change");
  assert.equal(updated.startTime, "03:00 PM");
  assert.equal(updated.doctor, "Dr. Anjali Nair");
  assert.equal(updated.status, "Upcoming");
  assert.equal(findAll(render(), n => n.props.edit).length, 0);
  assert.deepEqual(calls, []);
});

test("real API appointments remain in the table with edit enabled", () => {
  const now = new Date().toISOString();
  const item = { id: "real-appointment", code: "AP0001", startTime: now, endTime: now, nonMandatory: true, status: "CONFIRMED", bookingChannel: "WEB", consultationType: "Checkup", patient: { name: "Existing Patient", dob: null }, doctor: { name: "Existing Doctor" } };
  const rows = renderTable({ items: [item] }).rows;
  assert.equal(rows.length, 11);
  const real = rows.find(row => row.props.appt.id === item.id);
  assert.equal(typeof real.props.onEdit, "function");
  const button = findAll(real.type(real.props), n => n.type === "button")[0];
  assert.ok(!button.props.disabled);
  real.props.onEdit();
});
