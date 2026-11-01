const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "../src");

// Exercise the components' event handlers without a browser or live API writes.
function load(relative, mocks = {}) {
  const filename = path.join(root, relative);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(
    (name) => (Object.hasOwn(mocks, name) ? mocks[name] : require(name)),
    module,
    module.exports,
  );
  return module.exports;
}

function hooks() {
  const cells = [];
  const layoutEffects = [];
  let cursor = 0;
  return {
    layoutEffects,
    reset: () => {
      cursor = 0;
    },
    react: {
      useState(initial) {
        const index = cursor++;
        if (!(index in cells))
          cells[index] = typeof initial === "function" ? initial() : initial;
        return [
          cells[index],
          (next) => {
            cells[index] =
              typeof next === "function" ? next(cells[index]) : next;
          },
        ];
      },
      useRef(initial) {
        const index = cursor++;
        if (!(index in cells)) cells[index] = { current: initial };
        return cells[index];
      },
      useEffect() {},
      useLayoutEffect(effect) {
        layoutEffects.push(effect);
      },
      useMemo: (calculate) => calculate(),
    },
  };
}

function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

function button(tree, text) {
  const found = nodes(tree).find(
    (node) => node.type === "button" && node.props.children === text,
  );
  assert.ok(found, `Missing button: ${text}`);
  return found.props;
}

const noOp = () => null;
const common = {
  "next/image": noOp,
  "@/lib/useExclusiveDropdown": { useExclusiveDropdown: () => [false, noOp] },
  "@/components/PhoneNumberInput": noOp,
  "@/components/HoverTip": { Tip: noOp },
};
const validation = load("lib/validation.ts");

function doctorHarness({ shifts = [], failFirstSave = false } = {}) {
  const state = hooks();
  const calls = [];
  let created = 0;
  let closed = 0;
  let failed = false;
  class ApiError extends Error {}
  const api = {
    ApiError,
    async apiFetch(url, options) {
      calls.push({
        url,
        method: options.method,
        body: JSON.parse(options.body),
      });
      if (options.method === "POST") return { id: "doctor-new" };
      if (failFirstSave && !failed) {
        failed = true;
        throw new ApiError("Temporary failure");
      }
    },
  };
  const ShiftBuilder = () => null;
  const Modal = load("app/clinic-selection/[code]/doctors/NewDoctorModal.tsx", {
    ...common,
    react: state.react,
    "@/lib/api": api,
    "@/lib/validation": validation,
    "@/lib/shifts": load("lib/shifts.ts", { "./api": api }),
    "./constants": { SPECIALIZATIONS: ["General Dentistry"] },
    "./ShiftBuilder": ShiftBuilder,
  }).default;
  function render() {
    state.reset();
    return Modal({
      onCreated: () => {
        created++;
      },
      onClose: () => {
        closed++;
      },
    });
  }
  let tree = render();
  nodes(tree)
    .find((node) => node.props?.["aria-label"] === "Doctor name")
    .props.onChange({ target: { value: "Dr. Test" } });
  nodes(tree)
    .find(
      (node) =>
        node.props?.["aria-label"] === "Phone number" ||
        node.props?.placeholder === "0000000000",
    )
    .props.onChange("9876543210");
  nodes(tree)
    .find((node) => node.props?.options?.includes("General Dentistry"))
    .props.onChange("General Dentistry");
  nodes(tree)
    .find((node) => node.type === ShiftBuilder)
    .props.onChange(shifts);
  return {
    render,
    calls,
    layoutEffects: state.layoutEffects,
    created: () => created,
    closed: () => closed,
  };
}

const shift = {
  id: "draft-1",
  groupId: "group-1",
  frequency: "Weekly",
  date: "02/11/2026",
  timing: "09:00 AM - 06:00 PM",
};

test("doctor creation requires no shift and makes no shift request", async () => {
  const h = doctorHarness();
  const create = button(h.render(), "Create Profile");
  assert.equal(create.disabled, false);
  await create.onClick();
  assert.deepEqual(
    h.calls.map((call) => call.method),
    ["POST"],
  );
  assert.equal(h.calls[0].body.phone, "+919876543210");
  assert.equal(h.created(), 1);
});

test("added shifts save against the new doctor's id using existing API formats", async () => {
  const h = doctorHarness({ shifts: [shift] });
  await button(h.render(), "Create Profile").onClick();
  assert.deepEqual(
    h.calls.map((call) => [call.method, call.url]),
    [
      ["POST", "/doctors"],
      ["PUT", "/doctors/doctor-new/shifts"],
    ],
  );
  assert.deepEqual(h.calls[1].body.shifts, [
    {
      groupId: "group-1",
      frequency: "Weekly",
      date: "2026-11-02",
      startTime: "09:00",
      endTime: "18:00",
    },
  ]);
  assert.equal(h.created(), 1);
});

test("retrying a failed shift save never creates a duplicate doctor", async () => {
  const h = doctorHarness({ shifts: [shift], failFirstSave: true });
  await button(h.render(), "Create Profile").onClick();
  assert.equal(h.created(), 0);
  assert.ok(nodes(h.render()).find((node) => node.props?.role === "alert"));
  await button(h.render(), "Save Shifts").onClick();
  assert.deepEqual(
    h.calls.map((call) => call.method),
    ["POST", "PUT", "PUT"],
  );
  assert.equal(h.created(), 1);
});

function shiftHarness(initialShifts = []) {
  const state = hooks();
  let shifts = initialShifts;
  const Builder = load("app/clinic-selection/[code]/doctors/ShiftBuilder.tsx", {
    ...common,
    react: state.react,
  }).default;
  return {
    render(disabled = false, compact = true) {
      state.reset();
      return Builder({
        compact,
        disabled,
        shifts,
        onChange: (next) => {
          shifts = typeof next === "function" ? next(shifts) : next;
        },
      });
    },
    shifts: () => shifts,
  };
}

test("weekday and time shortcuts add weekly shifts which can be edited and removed", () => {
  const h = shiftHarness();
  button(h.render(), "Mon to Sat").onClick();
  button(h.render(), "9AM to 6PM").onClick();
  assert.equal(button(h.render(), "Add Shift").disabled, false);
  button(h.render(), "Add Shift").onClick();
  assert.equal(h.shifts().length, 6);
  assert.ok(
    h
      .shifts()
      .every(
        (row) =>
          row.frequency === "Weekly" && row.timing === "09:00 AM - 06:00 PM",
      ),
  );
  const edit = nodes(h.render()).find((node) =>
    node.props?.["aria-label"]?.startsWith("Edit shift on"),
  );
  edit.props.onClick();
  button(h.render(), "2PM to 6PM").onClick();
  button(h.render(), "Update Shift").onClick();
  assert.equal(h.shifts().length, 6);
  assert.equal(
    h.shifts().filter((row) => row.timing === "02:00 PM - 06:00 PM").length,
    6,
  );
  nodes(h.render())
    .find((node) => node.props?.["aria-label"]?.startsWith("Remove shift on"))
    .props.onClick();
  assert.equal(h.shifts().length, 0);
});

test("invalid ranges and disabled controls cannot add shifts", () => {
  const h = shiftHarness();
  button(h.render(), "Sun").onClick();
  let tree = h.render();
  nodes(tree)
    .find((node) => node.props?.label === "From")
    .props.onChange({ hh: "06", mm: "00", period: "PM" });
  nodes(tree)
    .find((node) => node.props?.label === "To")
    .props.onChange({ hh: "09", mm: "00", period: "AM" });
  assert.equal(button(h.render(), "Add Shift").disabled, true);
  assert.ok(nodes(h.render()).find((node) => node.props?.role === "alert"));
  button(h.render(), "9AM to 6PM").onClick();
  assert.equal(button(h.render(true), "Add Shift").disabled, true);
  button(h.render(true), "Add Shift").onClick();
  assert.equal(h.shifts().length, 0);
});

test("the existing Add Shift page retains manual date, recurrence, and time entry", () => {
  const h = shiftHarness();
  const render = () => h.render(false, false);
  const calendar = () =>
    nodes(render()).find((node) => typeof node.props?.onToggle === "function")
      .props;
  const recurrence = () =>
    nodes(render()).find((node) => node.props?.options?.includes("Biweekly"))
      .props;
  calendar().onToggle("2026-11-02");
  assert.equal(recurrence().value, "Day");
  calendar().onToggle("2026-11-02");
  assert.equal(recurrence().value, "");
  calendar().onToggle("2026-11-02");
  calendar().onToggle("2026-11-03");
  recurrence().onChange("Biweekly");
  nodes(render())
    .find((node) => node.props?.label === "From")
    .props.onChange({ hh: "09", mm: "30", period: "AM" });
  nodes(render())
    .find((node) => node.props?.label === "To")
    .props.onChange({ hh: "12", mm: "00", period: "PM" });
  button(render(), "Add Shift").onClick();
  assert.equal(h.shifts().length, 2);
  assert.ok(
    h
      .shifts()
      .every(
        (row) =>
          row.frequency === "Biweekly" && row.timing === "09:30 AM - 12:00 PM",
      ),
  );
});

test("the popup table appears after adding shifts and disappears after removing all of them", () => {
  const h = shiftHarness();
  const table = () =>
    nodes(h.render()).find(
      (node) => node.props?.["aria-label"] === "Doctor shifts",
    );
  assert.equal(table(), undefined);
  button(h.render(), "Mon to Sat").onClick();
  button(h.render(), "9AM to 6PM").onClick();
  button(h.render(), "Add Shift").onClick();
  assert.ok(table());
  const scrollArea = nodes(table()).find(
    (node) => node.props?.["aria-label"] === "Added shifts",
  );
  assert.equal(scrollArea.props.tabIndex, undefined);
  assert.equal(
    nodes(scrollArea).filter((node) => node.props?.["aria-label"]?.startsWith("Edit shift on")).length,
    1,
  );
  assert.equal(h.shifts().length, 6);
  while (h.shifts().length) {
    nodes(h.render())
      .find((node) => node.props?.["aria-label"]?.startsWith("Remove shift on"))
      .props.onClick();
  }
  assert.equal(table(), undefined);
});

test("added shifts scroll inside the popup without shrinking it and page scrolling is restored", () => {
  const h = doctorHarness();
  const dialog = () =>
    nodes(h.render()).find((node) => node.props?.role === "dialog");
  const popup = { offsetWidth: 880, offsetHeight: 900 };
  dialog().props.ref.current = popup;
  const previous = {
    window: global.window,
    document: global.document,
  };
  let onResize;
  global.window = {
    innerWidth: 1024,
    innerHeight: 768,
    addEventListener(event, callback) {
      if (event === "resize") onResize = callback;
    },
    removeEventListener() {},
  };
  global.document = { body: { style: { overflow: "auto" } } };
  try {
    const cleanup = h.layoutEffects.at(-1)();
    assert.equal(dialog().props.style.transform, "scale(0.9)");
    assert.equal(dialog().props.style.maxHeight, 736 / 0.9);
    assert.equal(document.body.style.overflow, "hidden");
    const content = dialog().props.children[1];
    assert.ok(content.props.className.includes("overflow-y-auto"));
    assert.ok(content.props.className.includes("min-h-0"));
    assert.ok(dialog().props.children[0].props.className.includes("shrink-0"));
    assert.ok(dialog().props.children[2].props.className.includes("shrink-0"));
    assert.equal(button(dialog().props.children[2], "Create Profile").disabled, false);
    nodes(content).find((node) => Array.isArray(node.props?.shifts)).props.onChange([
      shift,
      { ...shift, id: "second-shift", groupId: "second-group" },
    ]);
    popup.offsetHeight = 1100;
    onResize();
    assert.equal(dialog().props.style.transform, "scale(0.9)");
    global.window.innerHeight = 600;
    onResize();
    assert.equal(dialog().props.style.transform, "scale(0.9)");
    assert.equal(dialog().props.style.maxHeight, 568 / 0.9);
    window.innerWidth = 600;
    onResize();
    assert.equal(dialog().props.style.transform, `scale(${568 / 880})`);
    assert.equal(dialog().props.style.maxHeight, 568 / (568 / 880));
    cleanup();
    assert.equal(document.body.style.overflow, "auto");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete global[key];
      else global[key] = value;
    }
  }
});

test("day presets mark every matching date in the displayed month and select Weekly recurrence", () => {
  const h = shiftHarness();
  const calendar = () =>
    nodes(h.render()).find(
      (node) => typeof node.props?.onToggle === "function",
    );
  calendar().props.onView(new Date(2026, 10, 1));
  for (const [label, weekdays] of [
    ["Mon to Sat", [1, 2, 3, 4, 5, 6]],
    ["Sat to Sun", [6, 0]],
    ["Sun", [0]],
  ]) {
    button(h.render(), label).onClick();
    assert.equal(button(h.render(), label)["aria-pressed"], true);
    const recurrence = nodes(h.render()).find((node) =>
      node.props?.options?.includes("Biweekly"),
    );
    assert.equal(recurrence.props.value, "Weekly");
    const current = calendar();
    const dates = nodes(current.type(current.props));
    for (let day = 1; day <= 30; day++) {
      const cell = dates.find(
        (node) => node.props?.["aria-label"] === `November ${day}, 2026`,
      );
      assert.ok(cell);
      assert.equal(
        cell.props["aria-pressed"],
        weekdays.includes(new Date(2026, 10, day).getDay()),
        `Incorrect ${label} selection for November ${day}`,
      );
    }
    for (const other of ["Mon to Sat", "Sat to Sun", "Sun"].filter(
      (item) => item !== label,
    )) {
      assert.equal(button(h.render(), other)["aria-pressed"], false);
    }
  }
});

test("selected presets remain active until shifts are added and the saved pattern matches the calendar", () => {
  const h = shiftHarness();
  nodes(h.render())
    .find((node) => typeof node.props?.onToggle === "function")
    .props.onView(new Date(2026, 10, 1));
  button(h.render(), "Mon to Sat").onClick();
  button(h.render(), "9AM to 6PM").onClick();
  assert.equal(button(h.render(), "Mon to Sat")["aria-pressed"], true);
  assert.equal(button(h.render(), "9AM to 6PM")["aria-pressed"], true);
  button(h.render(), "Add Shift").onClick();
  assert.equal(button(h.render(), "Mon to Sat")["aria-pressed"], false);
  assert.equal(button(h.render(), "9AM to 6PM")["aria-pressed"], false);
  const availability = load("lib/shifts.ts", { "./api": {} });
  for (let day = 1; day <= 30; day++) {
    const date = new Date(2026, 10, day);
    assert.equal(
      availability.isSlotOnShift(h.shifts(), date, 9 * 60, 18 * 60),
      date.getDay() !== 0,
    );
  }
});

function editButtons(tree) {
  return nodes(tree).filter((node) =>
    node.props?.["aria-label"]?.startsWith("Edit shift on"),
  );
}

test("a weekly Monday-Friday marking stays one table row after saving and loading", async () => {
  const h = shiftHarness();
  for (const day of [2, 3, 4, 5, 6]) {
    nodes(h.render())
      .find((node) => typeof node.props?.onToggle === "function")
      .props.onToggle(`2026-11-0${day}`);
  }
  nodes(h.render())
    .find((node) => node.props?.options?.includes("Weekly"))
    .props.onChange("Weekly");
  button(h.render(), "9AM to 6PM").onClick();
  button(h.render(), "Add Shift").onClick();
  assert.deepEqual(
    editButtons(h.render()).map((node) => node.props["aria-label"]),
    ["Edit shift on Mon to Fri"],
  );

  let saved;
  const availability = load("lib/shifts.ts", {
    "./api": {
      async apiFetch(url, options) {
        if (options?.method === "PUT") saved = JSON.parse(options.body).shifts;
        else return saved.map((row, i) => ({ ...row, id: `saved-${i}` }));
      },
    },
  });
  await availability.saveShifts("doctor-new", h.shifts());
  const loaded = await availability.fetchShifts("doctor-new");
  const editor = shiftHarness(loaded);
  assert.equal(editButtons(editor.render()).length, 1);
  assert.equal(editButtons(editor.render())[0].props["aria-label"], "Edit shift on Mon to Fri");
  for (let day = 2; day <= 30; day++) {
    const date = new Date(2026, 10, day);
    assert.equal(
      availability.isSlotOnShift(loaded, date, 9 * 60, 18 * 60),
      date.getDay() >= 1 && date.getDay() <= 5,
    );
  }
});

test("day labels preserve gaps, weekends and date-specific markings", () => {
  for (const [frequency, dates, label] of [
    ["Weekly", ["02/11/2026", "04/11/2026", "06/11/2026"], "Mon, Wed, Fri"],
    ["Weekly", ["07/11/2026", "01/11/2026"], "Sat to Sun"],
    ["Weekly", ["01/11/2026"], "Sun"],
    ["Biweekly", ["02/11/2026", "03/11/2026"], "Mon to Tue"],
    ["Every day", ["02/11/2026"], "Mon to Sun"],
    ["Day", ["02/11/2026", "03/11/2026", "05/11/2026"], "02/11/2026 to 03/11/2026, 05/11/2026"],
    ["Monthly", ["02/11/2026"], "02/11/2026"],
    ["Yearly", ["02/11/2026"], "02/11/2026"],
  ]) {
    const h = shiftHarness(dates.map((date, i) => ({ ...shift, id: `${i}`, frequency, date })));
    assert.deepEqual(
      editButtons(h.render()).map((node) => node.props["aria-label"]),
      [`Edit shift on ${label}`],
    );
  }
  const h = shiftHarness([
    shift,
    { ...shift, id: "different-time", timing: "02:00 PM - 06:00 PM" },
    { ...shift, id: "different-frequency", frequency: "Day" },
    { ...shift, id: "ungrouped", groupId: undefined },
  ]);
  assert.equal(editButtons(h.render()).length, 4);
});

test("editing and confirmed deletion affect the entire group and preserve other shifts", () => {
  const h = shiftHarness([
    shift,
    { ...shift, id: "tuesday", date: "03/11/2026" },
    { ...shift, id: "other", groupId: "other-group", date: "01/11/2026" },
  ]);
  const render = () => h.render(false, false);
  editButtons(render()).find((node) => node.props["aria-label"] === "Edit shift on Mon to Tue").props.onClick();
  button(render(), "2PM to 6PM").onClick();
  button(render(), "Update Shift").onClick();
  assert.equal(h.shifts().length, 3);
  assert.equal(h.shifts().filter((row) => row.timing === "02:00 PM - 06:00 PM").length, 2);
  assert.equal(h.shifts().find((row) => row.id === "other").timing, shift.timing);
  nodes(render()).find((node) => node.props?.["aria-label"] === "Remove shift on Mon to Tue").props.onClick();
  assert.equal(h.shifts().length, 3);
  const dialog = nodes(render()).find((node) => typeof node.props?.onConfirm === "function");
  assert.equal(dialog.props.shift.dayDateLabel, "Mon to Tue");
  dialog.props.onConfirm();
  assert.deepEqual(h.shifts().map((row) => row.id), ["other"]);
});

test("create and edit share toggleable presets and calendar markings", () => {
  for (const compact of [true, false]) {
    const h = shiftHarness();
    const render = () => h.render(false, compact);
    const calendar = () => nodes(render()).find((node) => typeof node.props?.onToggle === "function");
    calendar().props.onView(new Date(2026, 10, 1));
    for (const label of ["Mon to Sat", "Sat to Sun", "Sun"]) {
      button(render(), label).onClick();
      assert.equal(button(render(), label)["aria-pressed"], true);
      button(render(), label).onClick();
      assert.equal(calendar().props.selected.size, 0);
      assert.equal(calendar().props.recurrence, "");
    }
    for (const label of ["9AM to 6PM", "2PM to 6PM", "6PM to 10PM"]) {
      button(render(), label).onClick();
      assert.equal(button(render(), label)["aria-pressed"], true);
      button(render(), label).onClick();
      for (const field of ["From", "To"]) {
        assert.equal(nodes(render()).find((node) => node.props?.label === field).props.value.hh, "");
      }
    }
    button(render(), "Mon to Sat").onClick();
    button(render(), "9AM to 6PM").onClick();
    button(render(), "Add Shift").onClick();
    const current = calendar();
    const cells = nodes(current.type(current.props));
    assert.ok(cells.some((node) => node.props?.children === "Selected"));
    assert.ok(cells.some((node) => node.props?.children === "Added shift"));
    for (let day = 1; day <= 30; day++) {
      const cell = cells.find((node) => node.props?.["aria-label"] === `November ${day}, 2026`);
      assert.equal(cell.props.className.includes("bg-[#16a34a]"), new Date(2026, 10, day).getDay() !== 0);
    }
    editButtons(render())[0].props.onClick();
    assert.equal(calendar().props.selected.size, 6);
    assert.equal(button(render(), "Mon to Sat")["aria-pressed"], true);
    assert.equal(button(render(), "9AM to 6PM")["aria-pressed"], true);
  }
});
