const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const root = path.resolve(__dirname, "../src");
const formFile = "app/clinic-selection/[code]/dashboard/AppointmentFormStep.tsx";
const dateFile = "app/clinic-selection/[code]/dashboard/DateInput.tsx";
function load(file, imports = {}, environment = {}) {
  const filename = path.join(root, file);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", "window", "document", "ResizeObserver", "setTimeout", "clearTimeout", code)(
    name => Object.hasOwn(imports, name) ? imports[name] : name.startsWith(".") ? require(path.resolve(path.dirname(filename), name)) : require(name),
    module, module.exports, environment.window, environment.document, environment.ResizeObserver,
    environment.setTimeout ?? setTimeout, environment.clearTimeout ?? clearTimeout,
  );
  return module.exports;
}
function clock() {
  const timers = new Map();
  let next = 0;
  return {
    timers,
    setTimeout(fn) { timers.set(++next, fn); return next; },
    clearTimeout(id) { timers.delete(id); },
    run() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); },
  };
}
function harness(file, imports = {}, environment = {}) {
  const cells = [];
  let cursor = 0, effects = [], layouts = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const hooks = {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!cells[index]) cells[index] = { value: typeof initial === "function" ? initial() : initial };
      return [cells[index].value, next => { cells[index].value = typeof next === "function" ? next(cells[index].value) : next; }];
    },
    useRef(value) { const index = cursor++; return cells[index] ??= { current: value }; },
    useId() { const index = cursor++; return "test-" + index; },
    useMemo(fn) { cursor++; return fn(); },
    useEffect(fn, deps) { register(effects, fn, deps); },
    useLayoutEffect(fn, deps) { register(layouts, fn, deps); },
  };
  function register(queue, fn, deps) {
    const index = cursor++;
    if (!same(cells[index]?.deps, deps)) queue.push(() => {
      cells[index]?.cleanup?.();
      cells[index] = { deps, cleanup: fn() };
    });
  }
  const exports = load(file, { ...imports, react: hooks }, environment);
  return {
    exports,
    render(props, component = exports.default ?? exports.DateInput) {
      cursor = 0; effects = []; layouts = [];
      const tree = component(props);
      effects.forEach(fn => fn());
      return tree;
    },
    layout() { layouts.forEach(fn => fn()); layouts = []; },
  };
}
function elements(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  const result = predicate(tree) ? [tree] : [];
  return result.concat(React.Children.toArray(tree.props?.children).flatMap(child => elements(child, predicate)));
}
const find = (tree, predicate) => elements(tree, predicate)[0];
const button = (tree, text) => find(tree, node => node.type === "button" && node.props.children === text);
const settle = () => new Promise(resolve => setImmediate(resolve));
const Panel = () => null;
const treatments = load("lib/treatments.ts");
const dates = load(dateFile, { "@/components/FloatingPanel": Panel });
const validation = load("lib/appointment-validation.ts");
const exclusive = { useExclusiveDropdown: () => [true, () => {}] };

test("treatments stop at five, keep selected options removable, and allow a replacement", () => {
  const picker = harness("components/TreatmentPicker.tsx", {
    "./FloatingPanel": Panel,
    "next/navigation": { usePathname: () => "/clinic-selection/demo/dashboard" },
    "@/lib/api": { apiFetch: () => new Promise(() => {}) },
    "@/lib/useExclusiveDropdown": exclusive,
    "@/lib/treatments": treatments,
  });
  let values = [];
  const props = () => ({ values, onChange: next => { values = next; } });
  const options = () => elements(picker.render(props()), node => node.type === "input" && node.props.type === "checkbox");
  for (let i = 0; i < 5; i++) options().find(node => !node.props.checked).props.onChange();
  assert.equal(values.length, 5);
  const full = options();
  assert.ok(full.filter(node => !node.props.checked).every(node => node.props.disabled));
  assert.ok(full.filter(node => node.props.checked).every(node => !node.props.disabled));
  full.find(node => !node.props.checked).props.onChange();
  assert.equal(values.length, 5, "the event handler also enforces the limit");
  full.find(node => node.props.checked).props.onChange();
  assert.equal(values.length, 4);
  options().find(node => !node.props.checked).props.onChange();
  assert.equal(values.length, 5);
});

test("date picker mounts its measured portal on the first click and can reopen", () => {
  const field = harness(dateFile, { "@/components/FloatingPanel": Panel });
  const props = { value: "", onChange() {} };
  const toggle = tree => find(tree, node => node.props?.["aria-label"] === "Open calendar");
  let tree = field.render(props);
  assert.equal(toggle(tree).props["aria-expanded"], false);
  toggle(tree).props.onClick();
  tree = field.render(props);
  const popup = find(tree, node => node.type === Panel);
  assert.ok(popup);
  assert.equal(popup.props.datePopover, true);
  assert.equal(popup.props.width, 256);
  popup.props.onClose();
  tree = field.render(props);
  assert.equal(find(tree, node => node.type === Panel), undefined);
  toggle(tree).props.onClick();
  assert.ok(find(field.render(props), node => node.type === Panel));
});

test("first popup position uses measured calendar height, and resize remeasures it", () => {
  const geometry = load("lib/floating-panel.ts");
  const observed = [], events = new Map();
  let resize, closed = 0, focused = 0;
  const documentEvents = new Map();
  const anchor = { current: { style: {}, getBoundingClientRect: () => ({ left: 300, right: 320, top: 340, bottom: 370, width: 20 }), contains: () => false, focus: () => focused++ } };
  const popup = harness("components/FloatingPanel.tsx", {
    "react-dom": { createPortal: node => node },
    "@/lib/floating-panel": geometry,
  }, {
    window: { innerWidth: 1024, innerHeight: 700, addEventListener: (name, fn) => events.set(name, fn), removeEventListener() {} },
    document: { body: {}, addEventListener: (name, fn, capture) => documentEvents.set(name, { fn, capture }), removeEventListener() {} },
    ResizeObserver: class { constructor(fn) { resize = fn; } observe(node) { observed.push(node); } disconnect() {} },
  });
  const props = { anchor, width: 256, datePopover: true, onClose: () => closed++, children: "Calendar" };
  let tree = popup.render(props);
  assert.equal(tree.props.style.visibility, "hidden");
  const panel = { style: {}, scrollHeight: 260, contains: () => false };
  tree.props.ref.current = panel;
  popup.layout();
  tree = popup.render(props);
  assert.equal(tree.props.style.top, 378, "a 260px calendar fits below; the old 340px estimate flipped it above");
  assert.equal(tree.props.style.visibility, "visible");
  assert.equal(panel.style.width, "256px");
  assert.deepEqual(observed, [panel, anchor.current]);
  panel.scrollHeight = 288;
  resize();
  assert.equal(popup.render(props).props.style.top, 378);
  const escape = documentEvents.get("keydown");
  assert.equal(escape.capture, true, "calendar Escape runs before its parent popup");
  escape.fn({ key: "Escape", preventDefault() {}, stopPropagation() {} });
  assert.equal(closed, 1);
  assert.equal(focused, 1);
});

test("date calendar bounds block past bookings and future dates of birth", () => {
  const today = new Date();
  const props = { value: today, onSelect() {}, disableFuture: true };
  const calendar = harness(dateFile, { "@/components/FloatingPanel": Panel });
  let tree = calendar.render(props, calendar.exports.DateCalendar);
  find(tree, node => node.props?.["aria-label"] === "Next month").props.onClick();
  tree = calendar.render(props, calendar.exports.DateCalendar);
  const days = elements(tree, node => node.type === "button" && typeof node.props.children === "number");
  assert.ok(days.length >= 28);
  assert.ok(days.every(node => node.props.disabled));
  const bookings = harness(dateFile, { "@/components/FloatingPanel": Panel });
  tree = bookings.render({ value: today, onSelect() {}, disablePast: true }, bookings.exports.DateCalendar);
  find(tree, node => node.props?.["aria-label"] === "Previous month").props.onClick();
  tree = bookings.render({ value: today, onSelect() {}, disablePast: true }, bookings.exports.DateCalendar);
  assert.ok(elements(tree, node => node.type === "button" && typeof node.props.children === "number").every(node => node.props.disabled));
});

test("appointment treatment filters use the create form catalogue, labels and search aliases", () => {
  const filter = harness("app/clinic-selection/[code]/appointments/AppointmentFilterPanel.tsx", {
    "@/lib/treatments": treatments,
  }, { document: { addEventListener() {}, removeEventListener() {} } });
  let applied;
  const props = {
    applied: { ...filter.exports.EMPTY_FILTERS, statuses: ["Upcoming"], sourcesOfEnquiry: ["WEBSITE"] },
    doctorOptions: [], channelOptions: [], sourceOptions: [],
    onApply(value) { applied = value; }, onClose() {},
  };
  const card = tree => find(tree, node => node.props?.title === "Reason for visit / Treatment");
  const options = tree => elements(card(tree), node => node.type?.name === "BoxedCheckboxRow");
  const search = tree => find(tree, node => node.props?.["aria-label"] === "Search reasons for visit or treatments");
  let tree = filter.render(props);
  assert.ok(card(tree));
  assert.equal(find(tree, node => node.props?.title === "Consultation Type"), undefined);
  assert.deepEqual(options(tree).map(node => node.props.label), treatments.searchTreatments("").map(item => item.label));
  const undecided = options(tree).find(node => node.props.label === treatments.treatmentLabel(treatments.UNDECIDED_TREATMENT));
  assert.ok(undecided);
  undecided.props.onClick();
  search(tree).props.onChange({ target: { value: "RCT" } });
  tree = filter.render(props);
  assert.deepEqual(options(tree).map(node => node.props.label), treatments.searchTreatments("RCT").map(item => item.label));
  assert.ok(options(tree).length > 0);
  options(tree)[0].props.onClick();
  tree = filter.render(props);
  search(tree).props.onChange({ target: { value: "nonexistent fixture treatment" } });
  tree = filter.render(props);
  assert.equal(options(tree).length, 0);
  assert.ok(find(tree, node => node.props?.role === "status"));
  const apply = find(tree, node => node.type === "button" && React.Children.toArray(node.props.children).some(child => typeof child === "string" && child.startsWith("Apply Filters")));
  apply.props.onClick();
  assert.ok(applied.consultationTypes.includes(treatments.UNDECIDED_TREATMENT));
  assert.ok(applied.consultationTypes.includes(treatments.searchTreatments("RCT")[0].value));
  assert.deepEqual(applied.statuses, ["Upcoming"]);
  assert.deepEqual(applied.sourcesOfEnquiry, ["WEBSITE"]);
});

test("source filter search preserves selections and all filter searches have rounded corners", () => {
  const filter = harness("app/clinic-selection/[code]/appointments/AppointmentFilterPanel.tsx", {
    "@/lib/treatments": treatments,
  }, { document: { addEventListener() {}, removeEventListener() {} } });
  let applied;
  const props = {
    applied: { ...filter.exports.EMPTY_FILTERS, sourcesOfEnquiry: ["INSTAGRAM"] },
    doctorOptions: [], channelOptions: [],
    sourceOptions: [{ value: "INSTAGRAM", label: "Instagram" }, { value: "WEBSITE", label: "Website" }, { value: "GOOGLE SEARCH", label: "Google Search" }],
    onApply(value) { applied = value; }, onClose() {},
  };
  const card = tree => find(tree, node => node.props?.title === "Source of Enquiry");
  const options = tree => elements(card(tree), node => node.type?.name === "BoxedCheckboxRow");
  const search = tree => find(tree, node => node.props?.["aria-label"] === "Search sources of enquiry");
  let tree = filter.render(props);
  const searches = elements(tree, node => node.type === "input" && node.props.type === "search");
  assert.equal(searches.length, 3);
  assert.ok(searches.every(node => node.props.className.includes("rounded-full")));
  search(tree).props.onChange({ target: { value: "  wEb  " } });
  tree = filter.render(props);
  assert.deepEqual(options(tree).map(node => node.props.label), ["Website"]);
  options(tree)[0].props.onClick();
  search(tree).props.onChange({ target: { value: "not a source" } });
  tree = filter.render(props);
  assert.equal(options(tree).length, 0);
  assert.equal(find(card(tree), node => node.props?.role === "status").props.children, "No sources match your search.");
  search(tree).props.onChange({ target: { value: "" } });
  tree = filter.render(props);
  assert.equal(options(tree).length, 3);
  assert.ok(options(tree).find(node => node.props.label === "Instagram").props.selected);
  assert.ok(options(tree).find(node => node.props.label === "Website").props.selected);
  find(tree, node => node.type === "button" && React.Children.toArray(node.props.children).some(child => typeof child === "string" && child.startsWith("Apply Filters"))).props.onClick();
  assert.deepEqual(applied.sourcesOfEnquiry, ["INSTAGRAM", "WEBSITE"]);
});

test("strict date and time validation rejects rollover hours, partial and reversed ranges", () => {
  const time = (h, m = "00", p = "AM") => ({ h, m, p });
  assert.equal(validation.timeToMinutes(time("12")), 0);
  assert.equal(validation.timeToMinutes(time("12", "00", "PM")), 720);
  for (const invalid of [time("00"), time("13"), time("9", "60"), time("x"), time("9", "")]) assert.equal(validation.timeToMinutes(invalid), null);
  assert.ok(validation.appointmentTimeError(time("10"), time("9")));
  assert.ok(validation.appointmentTimeError(time("9"), time("9")));
  assert.ok(validation.appointmentTimeError(time("8"), time("9")));
  assert.equal(validation.appointmentTimeError(time("9"), time("10")), null);
  const empty = time("", "");
  assert.equal(validation.appointmentTimeError(empty, empty, true), null);
  assert.ok(validation.appointmentTimeError(time("9"), empty, true));
  assert.ok(validation.appointmentTimeError(time("10"), time("9"), true));
  const now = new Date(2026, 10, 13, 12);
  assert.equal(validation.isAppointmentDateValid(null, false, now), false);
  assert.equal(validation.isAppointmentDateValid(new Date(2026, 10, 12), false, now), false);
  assert.equal(validation.isAppointmentDateValid(new Date(2026, 10, 13), false, now), true);
  assert.equal(validation.isAppointmentDateValid(new Date(2026, 10, 12), true, now), true);
});

const Treatment = () => null;
function formHarness(apiFetch = () => new Promise(() => {})) {
  const timers = clock();
  return { timers, form: harness(formFile, {
    "next/image": () => null,
    "@/components/TreatmentPicker": Treatment,
    "@/components/FloatingPanel": Panel,
    "@/lib/treatments": treatments,
    "@/lib/appointment-validation": validation,
    "@/lib/api": { apiFetch },
    "@/lib/useExclusiveDropdown": exclusive,
    "@/lib/shifts": { fetchShifts: async () => [], fetchBlocks: async () => [], isSlotOnShift: () => true, isSlotBlocked: () => false },
    "@/lib/statusColors": { statusDropdownColor: () => ({}) },
    "./DateInput": dates,
    "./DoctorAvailabilityModal": () => null,
  }, { window: timers }) };
}
const patient = { name: "Fixture Patient", dob: "", gender: "Female", phone: "9000000000", email: "" };
const future = dates.formatDmy(new Date(new Date().getFullYear() + 1, 0, 15));
const time = h => ({ h, m: "00", p: "AM" });

test("the actual appointment form blocks sixth treatments, invalid dates and reversed optional times", () => {
  const { form } = formHarness();
  const props = { patient, onCancel() {}, onConfirm() {} };
  let tree = form.render(props);
  find(tree, node => node.type === Treatment).props.onChange(["A", "B", "C", "D", "E", "F"]);
  find(tree, node => node.type === dates.DateInput).props.onChange(future);
  find(tree, node => node.type?.name === "NonMandatory").props.onChange(true);
  tree = form.render(props);
  assert.equal(button(tree, "Confirm Appointment").props.disabled, true);
  find(tree, node => node.type === Treatment).props.onChange(["A"]);
  tree = form.render(props);
  assert.equal(button(tree, "Confirm Appointment").props.disabled, false);
  find(tree, node => node.type === dates.DateInput).props.onChange("31/02/2027");
  assert.equal(button(form.render(props), "Confirm Appointment").props.disabled, true);
  tree = form.render(props);
  find(tree, node => node.type === dates.DateInput).props.onChange(future);
  let range = find(form.render(props), node => node.type?.name === "TimeRange");
  range.props.onFrom(time("10"));
  range.props.onTo(time("9"));
  assert.equal(button(form.render(props), "Confirm Appointment").props.disabled, true);
  range = find(form.render(props), node => node.type?.name === "TimeRange");
  range.props.onTo(time("11"));
  assert.equal(button(form.render(props), "Confirm Appointment").props.disabled, false);
});

test("source of enquiry keeps all choices in a five-row scrolling list", () => {
  const { form } = formHarness();
  const tree = form.render({ patient, onCancel() {}, onConfirm() {} });
  const dropdown = find(tree, node => node.type?.name === "BoxedDropdown" && node.props.label === "Source of Enquiry");
  const open = dropdown.type(dropdown.props);
  const panel = find(open, node => node.type === Panel);
  const options = panel.props.children;
  assert.ok(options.props.className.includes("max-h-[220px]"));
  assert.ok(options.props.className.includes("overflow-y-auto"));
  const rows = elements(options, node => node.type === "button");
  assert.equal(rows.length, form.exports.LEAD_SOURCES.length);
  assert.ok(rows.length > 5);
  assert.ok(rows.every(row => row.props.className.includes("h-[40px]") && row.props.className.includes("shrink-0")));
  let selected;
  const custom = dropdown.type({ ...dropdown.props, onChange(value) { selected = value; } });
  elements(custom, node => node.type === "button").at(-1).props.onClick();
  assert.equal(selected, form.exports.LEAD_SOURCES.at(-1));
});

test("older availability responses cannot replace the results for the current time range", async () => {
  const requests = [];
  const { form, timers } = formHarness(url => new Promise(resolve => requests.push({ url, resolve })));
  const props = { patient, onCancel() {}, onConfirm() {}, doctors: [{ id: "new", name: "New Doctor" }, { id: "old", name: "Old Doctor" }] };
  let tree = form.render(props);
  find(tree, node => node.type === dates.DateInput).props.onChange(future);
  let range = find(tree, node => node.type?.name === "TimeRange");
  range.props.onFrom(time("9")); range.props.onTo(time("10"));
  form.render(props); timers.run();
  assert.equal(requests.length, 1);
  range = find(form.render(props), node => node.type?.name === "TimeRange");
  range.props.onFrom(time("10")); range.props.onTo(time("11"));
  form.render(props); timers.run();
  assert.equal(requests.length, 2);
  requests[1].resolve({ doctors: [{ id: "new", name: "New Doctor", available: true }] });
  await settle();
  tree = form.render(props);
  assert.deepEqual(find(tree, node => node.type?.name === "BoxedDropdown" && node.props.label === "Doctor").props.options, ["New Doctor"]);
  requests[0].resolve({ doctors: [{ id: "old", name: "Old Doctor", available: true }] });
  await settle();
  tree = form.render(props);
  assert.deepEqual(find(tree, node => node.type?.name === "BoxedDropdown" && node.props.label === "Doctor").props.options, ["New Doctor"]);
});

test("preview edits save locally without updating a backend appointment", async () => {
  const calls = [], changes = [];
  let closed = 0, notified = 0;
  const Form = () => null;
  const modal = harness("app/clinic-selection/[code]/dashboard/NewAppointmentModal.tsx", {
    "next/image": () => null,
    "react-dom": { createPortal: node => node },
    "@/lib/api": { apiFetch: async (...args) => { calls.push(args); return []; } },
    "@/lib/appointmentsBus": { notifyAppointmentsChanged() { notified++; } },
    "@/lib/useExclusiveDropdown": exclusive,
    "@/lib/validation": load("lib/validation.ts"),
    "@/components/PhoneNumberInput": () => null,
    "@/components/FloatingPanel": Panel,
    "./AppointmentFormStep": Form,
    "./DateInput": dates,
  }, { document: { body: {} } });
  const edit = { id: "demo-sample", patient, initial: { consultation: ["Checkup"], mode: "datetime", date: future, from: time("9"), to: time("10"), doctor: "", status: "Upcoming" } };
  const tree = modal.render({ edit, onClose() { closed++; }, onPreviewSave(result) { changes.push(result); } });
  const form = find(tree, node => node.type === Form);
  assert.deepEqual(form.props.initial, edit.initial);
  assert.equal(form.props.excludeAppointmentId, undefined);
  const result = { message: "Preview changes" };
  await form.props.onConfirm(result);
  assert.deepEqual(changes, [result]);
  assert.equal(closed, 1);
  assert.equal(notified, 0);
  assert.ok(calls.every(([url, options]) => ["/patients", "/doctors"].includes(url) && !options?.method));
});

test("patient search matches the displayed patient code", async () => {
  const timers = clock();
  const modal = harness("app/clinic-selection/[code]/dashboard/NewAppointmentModal.tsx", {
    "next/image": () => null,
    "react-dom": { createPortal: node => node },
    "@/lib/api": { apiFetch: async url => url === "/patients" ? [{ id: "uuid-one", code: "PAT-001234", name: "Fixture", phone: "+919876555555", dob: null }] : [] },
    "@/lib/appointmentsBus": { notifyAppointmentsChanged() {} },
    "@/lib/useExclusiveDropdown": exclusive,
    "@/lib/validation": load("lib/validation.ts"),
    "@/components/PhoneNumberInput": () => null,
    "@/components/FloatingPanel": Panel,
    "./AppointmentFormStep": () => null,
    "./DateInput": dates,
  }, { document: { body: {} }, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout });
  const props = { onClose() {} };
  modal.render(props); await settle();
  let tree = modal.render(props);
  find(tree, node => node.type?.name === "SearchStep").props.setQuery("PAT-001234");
  modal.render(props); timers.run();
  tree = modal.render(props);
  assert.equal(find(tree, node => node.type?.name === "SearchStep").props.results[0].code, "PAT-001234");
});
test("appointment edits and list filters expose only the remaining statuses", () => {
  const expected = ["Upcoming", "On going", "Completed", "Cancelled"];
  const { form } = formHarness();
  const props = { patient, initial: { status: "Cancelled" }, onCancel() {}, onConfirm() {} };
  let tree = form.render(props);
  let dropdown = find(tree, node => node.type?.name === "StatusDropdown");
  assert.deepEqual(dropdown.props.options, expected);
  assert.equal(dropdown.props.value, "Cancelled");
  dropdown.props.onChange("Completed");
  tree = form.render(props);
  dropdown = find(tree, node => node.type?.name === "StatusDropdown");
  assert.equal(dropdown.props.value, "Completed");
  const filter = harness("app/clinic-selection/[code]/appointments/AppointmentFilterPanel.tsx", {
    "@/lib/treatments": treatments,
  }, { document: { addEventListener() {}, removeEventListener() {} } });
  const filterTree = filter.render({ applied: filter.exports.EMPTY_FILTERS, doctorOptions: [], channelOptions: [], sourceOptions: [], onApply() {}, onClose() {} });
  const statuses = find(filterTree, node => node.props?.title === "Status");
  assert.ok(statuses);
  assert.deepEqual(elements(statuses, node => node.type === "button").map(node => node.props.children), expected);
  const metadata = load("app/clinic-selection/[code]/dashboard/mock.ts");
  assert.deepEqual(metadata.STATUS_FILTER_OPTIONS, ["All status", ...expected]);
});
