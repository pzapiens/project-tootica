const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = path.resolve(__dirname, "../src");
function load(file, imports = {}, environment = {}) {
  const code = ts.transpileModule(
    fs.readFileSync(path.join(root, file), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const module = { exports: {} };
  new Function(
    "require",
    "module",
    "exports",
    "window",
    "document",
    "ResizeObserver",
    code,
  )(
    (name) => (Object.hasOwn(imports, name) ? imports[name] : require(name)),
    module,
    module.exports,
    environment.window,
    environment.document,
    environment.ResizeObserver,
  );
  return module.exports;
}
const geometry = load("lib/floating-panel.ts");

test("popovers stay inside laptop, tablet, phone, and zoomed CSS viewports", () => {
  for (const physicalWidth of [320, 375, 768, 1024, 1366, 1536, 1920]) {
    for (const zoom of [0.8, 1, 1.25, 1.5, 2]) {
      const viewport = { width: physicalWidth / zoom, height: 600 / zoom };
      for (const requestedWidth of [216, 256, 288, 360, 420]) {
        for (const requestedHeight of [90, 340, 900]) {
          for (const bottom of [60, viewport.height - 20]) {
            const position = geometry.floatingPanelPosition(
              { left: 8, right: 60, top: bottom - 40, bottom },
              viewport,
              requestedWidth,
              requestedHeight,
            );
            assert.ok(position.left >= 12);
            assert.ok(position.top >= 12);
            assert.ok(
              position.left + position.width <= viewport.width - 12 + 0.001,
            );
            assert.ok(
              position.top + Math.min(requestedHeight, position.maxHeight) <=
                viewport.height - 12 + 0.001,
            );
          }
        }
      }
    }
  }
});

test("time filters expand right from the trigger while other popovers keep their alignment", () => {
  const anchor = { left: 250, right: 350, top: 50, bottom: 90 };
  const viewport = { width: 1024, height: 700 };
  const start = geometry.floatingPanelPosition(anchor, viewport, 288, 340, 12, "start");
  assert.equal(start.left, anchor.left);
  assert.equal(start.top, anchor.bottom + 12);
  const defaultPosition = geometry.floatingPanelPosition(anchor, viewport, 288, 340, 12);
  assert.equal(defaultPosition.left + defaultPosition.width, anchor.right);
  const nearEdge = geometry.floatingPanelPosition({ ...anchor, left: 900, right: 1000 }, viewport, 288, 340, 12, "start");
  assert.equal(nearEdge.left + nearEdge.width, viewport.width - 12);
});

test("tall popovers stay inside the white content frame on every page size", () => {
  for (const [width, contentInset] of [[320, 8], [768, 9.984], [1536, 19.968], [1920, 20]]) {
    for (const height of [200, 480, 900]) {
      for (const bottom of [42, height - 2]) {
        const position = geometry.floatingPanelPosition(
          { left: 20, right: 100, top: bottom - 40, bottom },
          { width, height }, 360, 900,
        );
        assert.ok(position.top >= contentInset + 8 - 0.001);
        assert.ok(position.top + position.maxHeight <= height - contentInset - 8 + 0.001);
      }
    }
  }
});

test("a menu flips above its trigger when the bottom of the screen has no room", () => {
  const anchor = { left: 900, right: 944, top: 600, bottom: 644 };
  const position = geometry.floatingPanelPosition(
    anchor,
    { width: 1024, height: 680 },
    216,
    240,
  );
  assert.ok(position.top + 240 < anchor.top);
  assert.equal(position.width, 216);
});

test("floating filters stay open for their panel and date picker, close outside, and follow resizing", () => {
  const effects = [],
    layouts = [],
    positions = [];
  const windowEvents = new Map(),
    documentEvents = new Map();
  let focused = 0,
    closed = 0;
  const anchor = {
    current: {
      getBoundingClientRect: () => ({
        left: 250,
        right: 298,
        top: 50,
        bottom: 98,
      }),
      contains: (target) => target.kind === "anchor",
      focus: () => focused++,
    },
  };
  const environment = {
    window: {
      innerWidth: 1024,
      innerHeight: 600,
      addEventListener: (name, fn) => windowEvents.set(name, fn),
      removeEventListener: (name) => windowEvents.delete(name),
    },
    document: {
      body: {},
      addEventListener: (name, fn) => documentEvents.set(name, fn),
      removeEventListener: (name) => documentEvents.delete(name),
    },
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
  };
  const Panel = load(
    "components/FloatingPanel.tsx",
    {
      react: {
        useRef: () => ({ current: null }),
        useState: () => [null, (position) => positions.push(position)],
        useEffect: (fn) => effects.push(fn),
        useLayoutEffect: (fn) => layouts.push(fn),
      },
      "react-dom": { createPortal: (node) => node },
      "@/lib/floating-panel": geometry,
    },
    environment,
  ).default;
  const tree = Panel({
    anchor,
    width: 420,
    align: "start",
    onClose: () => closed++,
    children: null,
  });
  tree.props.ref.current = {
    style: {},
    scrollHeight: 340,
    contains: (target) => target.kind === "panel",
  };
  const cleanupLayout = layouts[0](),
    cleanup = effects[0]();
  assert.equal(positions.at(-1).left, 250, "the panel expands right from its trigger");
  for (const kind of ["anchor", "panel", "date"])
    documentEvents.get("mousedown")({
      target: { kind, closest: () => kind === "date" },
    });
  assert.equal(closed, 0);
  environment.window.innerWidth = 320;
  windowEvents.get("resize")();
  assert.equal(positions.at(-1).width, 296);
  assert.equal(positions.at(-1).left, 12, "narrow screens retain their edge clearance");
  documentEvents.get("mousedown")({
    target: { kind: "outside", closest: () => null },
  });
  assert.equal(closed, 1);
  documentEvents.get("keydown")({ key: "Escape", preventDefault() {}, stopPropagation() {} });
  assert.equal(focused, 1);
  cleanup();
  cleanupLayout();
  assert.equal(windowEvents.size, 0);
  assert.equal(documentEvents.size, 0);
});

test("dense tables expose a keyboard-accessible local scroll region", () => {
  const Table = load("components/TableViewport.tsx").default;
  const markup = renderToStaticMarkup(
    React.createElement(
      Table,
      { label: "Patients", minWidth: "1200px" },
      React.createElement("p", null, "Patient rows"),
    ),
  );
  assert.ok(markup.includes('role="region"'));
  assert.ok(markup.includes('aria-label="Patients"'));
  assert.ok(markup.includes('tabindex="0"'));
  assert.ok(markup.includes("overflow-x-auto"));
  assert.ok(markup.includes("overflow-y-hidden"));
  assert.ok(markup.includes('aria-label="Patients rows"'));
  assert.ok(markup.includes("min-width:1200px"));
});

test("table headers stay outside the vertical row scroll region", () => {
  const Table = load("components/TableViewport.tsx").default;
  const header = React.createElement("div", { className: "app-table-header grid" }, "Patient Name");
  const row = React.createElement("p", null, "Patient row");
  const tree = Table({ label: "Patients", children: [header, row] });
  const frame = tree.props.children;
  const [heading, body] = React.Children.toArray(frame.props.children);
  assert.equal(heading.props.className, "app-table-heading");
  assert.equal(heading.props.children.props.children, "Patient Name");
  assert.equal(body.props["aria-label"], "Patients rows");
  assert.ok(body.props.className.includes("app-table-body"));
  assert.equal(body.props.children.length, 1);
  assert.equal(body.props.children[0].props.children, "Patient row");
});

test("the calendar day drawer portals into the white frame instead of the viewport", () => {
  const date = new Date(2026, 10, 13);
  const state = [{ year: 2026, month: 10 }, date, null, {}, false];
  let cursor = 0, frame = {};
  const Calendar = load("app/clinic-selection/[code]/calendar/FullCalendarView.tsx", {
    react: { ...React, useState: () => [state[cursor++], () => {}], useMemo: fn => fn(), useEffect() {} },
    "react-dom": { createPortal: (node, target) => ({ node, target }) },
    "next/image": () => null,
    "next/navigation": { useParams: () => ({ code: "fixture" }), useSearchParams: () => ({ get: () => null }), useRouter: () => ({ push() {} }) },
    "@/components/TableViewport": () => null,
    "@/components/loading/PageSkeletons": { CalendarSkeleton: () => null },
    "@/lib/api": {},
    "@/components/BackButton": () => null,
    "@/lib/statusColors": {},
    "@/lib/useExclusiveDropdown": {},
    "./calendar-mock": load("app/clinic-selection/[code]/calendar/calendar-mock.ts"),
  }, { document: { querySelector(selector) { assert.equal(selector, "[data-app-content-frame]"); return frame; } } }).default;
  const tree = Calendar();
  const slide = React.Children.toArray(tree.props.children).find(child => child.type?.name === "SlideOver");
  const portal = slide.type(slide.props);
  assert.equal(portal.target, frame);
  assert.equal(portal.node.props.role, "dialog");
  assert.ok(portal.node.props.className.includes("absolute inset-y-0 right-0"));
  assert.ok(portal.node.props.className.includes("max-w-full"));
  assert.ok(!portal.node.props.className.includes("fixed"));
  assert.ok(!portal.node.props.className.includes("app-drawer"));
  frame = null;
  assert.equal(slide.type(slide.props), null);
});

test("authentication keeps natural text size and permits vertical page scrolling", () => {
  const Auth = load("app/login/FitToViewport.tsx").default;
  const markup = renderToStaticMarkup(
    React.createElement(Auth, null, "Sign in form"),
  );
  assert.ok(markup.includes("min-h-dvh"));
  assert.ok(!markup.includes("transform:"));
  assert.ok(!markup.includes("overflow-hidden"));
  assert.ok(markup.includes("Sign in form"));
});
