const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.resolve(__dirname, "../src");
function load(relative, imports = {}, browserWindow, clockPerformance = performance) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", "window", "performance", code)(
    (name) => Object.hasOwn(imports, name) ? imports[name] : require(name), module, module.exports, browserWindow, clockPerformance,
  );
  return module.exports;
}

const loadingActivity = load("components/loading/LoadingActivity.tsx");
const skeletons = load("components/loading/PageSkeletons.tsx", { "./LoadingActivity": loadingActivity });
const DonutChart = load("components/DonutChart.tsx", { "./loading/LoadingActivity": loadingActivity }).default;
const destinations = {
  dashboard: "DashboardSkeleton", appointments: "AppointmentsSkeleton", patients: "PatientsSkeleton",
  doctors: "DoctorsSkeleton", analytics: "AnalyticsSkeleton", revenue: "RevenueSkeleton",
  calendar: "CalendarSkeleton", profile: "ProfileSkeleton", accounts: "AccountsSkeleton",
  "patients/patient-123/history": "PatientHistorySkeleton", "doctors/doctor-123/shift": "ShiftSkeleton",
  "settings/whatsapp": "ProfileSkeleton",
};

test("every destination selects its own wireframe, including nested detail pages", () => {
  let pathname;
  const Route = load("components/loading/RouteSkeleton.tsx", {
    "next/navigation": { usePathname: () => pathname }, "./PageSkeletons": skeletons,
  }).default;
  for (const [route, name] of Object.entries(destinations)) {
    pathname = `/clinic-selection/branch-123/${route}`;
    const expected = renderToStaticMarkup(React.createElement(skeletons[name]));
    const actual = renderToStaticMarkup(React.createElement(Route));
    assert.equal(actual, expected, route);
    const framed = renderToStaticMarkup(React.createElement(Route, { withShell: true }));
    assert.ok(framed.includes("<aside"), route);
    assert.ok(framed.includes(expected), route);
  }
  pathname = "/clinic-selection/branch-123/unknown";
  assert.equal(renderToStaticMarkup(React.createElement(Route)), "");
});

test("each leaf has its own Next loading boundary and accessible reduced-motion skeleton", () => {
  const output = new Set();
  for (const [route, name] of Object.entries(destinations)) {
    const folder = route.replace("patient-123", "[id]").replace("doctor-123", "[id]");
    const boundary = fs.readFileSync(path.join(root, "app/clinic-selection/[code]", folder, "loading.tsx"), "utf8");
    assert.ok(boundary.includes(name), route);
    const markup = renderToStaticMarkup(React.createElement(skeletons[name]));
    assert.ok(markup.includes('role="status"'), route);
    assert.ok(markup.includes('aria-busy="true"'), route);
    assert.ok(markup.includes('aria-hidden="true"'), route);
    assert.ok(markup.includes("motion-reduce:animate-none"), route);
    assert.ok(!/<(input|button|a)\b/.test(markup), "loading placeholders must not be interactive");
    if (route !== "settings/whatsapp") {
      assert.ok(!output.has(markup), `${route} must have a distinct layout`);
      output.add(markup);
    }
  }
});

test("authentication and clinic selection have layouts matching their own screens", () => {
  assert.notEqual(
    renderToStaticMarkup(React.createElement(skeletons.AuthSkeleton)),
    renderToStaticMarkup(React.createElement(skeletons.AuthSkeleton, { reset: true })),
  );
  assert.notEqual(
    renderToStaticMarkup(React.createElement(skeletons.ClinicSelectionSkeleton, { variant: "clinic" })),
    renderToStaticMarkup(React.createElement(skeletons.ClinicSelectionSkeleton, { variant: "super" })),
  );
});

test("revenue loading previews seven vertical bars with chart axes instead of a trend line", () => {
  const chart = renderToStaticMarkup(React.createElement(skeletons.RevenueBarChartSkeleton));
  const page = renderToStaticMarkup(React.createElement(skeletons.RevenueSkeleton));
  assert.equal((chart.match(/width="9"/g) ?? []).length, 7);
  assert.equal((chart.match(/<line /g) ?? []).length, 5);
  assert.ok(!chart.includes("<path"));
  assert.ok(page.includes(chart));
});

// Exercise transitions with deterministic timers, including data that takes
// longer than the minimum and cancellation during a rapid second navigation.
function transitionHarness() {
  let now = 0;
  let nextTimer = 0;
  const timers = new Map();
  const clock = {
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  const cells = [];
  let cursor = 0;
  let effects = [];
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const hooks = {
    useState(initial) {
      const slot = cursor++;
      if (!cells[slot]) cells[slot] = { value: initial };
      return [cells[slot].value, (next) => { cells[slot].value = typeof next === "function" ? next(cells[slot].value) : next; }];
    },
    useCallback(fn, deps) {
      const slot = cursor++;
      if (!sameDeps(cells[slot]?.deps, deps)) cells[slot] = { value: fn, deps };
      return cells[slot].value;
    },
    useEffect(effect, deps) {
      const slot = cursor++;
      if (!sameDeps(cells[slot]?.deps, deps)) effects.push(() => {
        cells[slot]?.cleanup?.();
        cells[slot] = { deps, cleanup: effect() };
      });
    },
  };
  const module = load("components/loading/PageTransition.tsx", {
    react: hooks, "./LoadingActivity": loadingActivity,
  }, clock);
  return {
    minimum: module.MINIMUM_PRELOADER_MS,
    fade: module.PRELOADER_FADE_MS,
    render(props = {}) {
      cursor = 0;
      effects = [];
      const tree = module.default({ children: React.createElement("p", null, "Loaded page"), fallback: React.createElement("p", null, "Page wireframe"), ...props });
      effects.forEach((effect) => effect());
      return tree;
    },
    advance(ms) {
      const until = now + ms;
      while (true) {
        const first = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!first) break;
        timers.delete(first[0]);
        now = first[1].at;
        first[1].callback();
      }
      now = until;
    },
    unmount() { cells.forEach((cell) => cell.cleanup?.()); },
    timerCount: () => timers.size,
  };
}

test("fast pages retain the wireframe for 800ms and then crossfade for 240ms", () => {
  const transition = transitionHarness();
  let tree = transition.render();
  assert.equal(tree.props["aria-busy"], true);
  assert.equal(tree.props.children[0].props.children.props.inert, true);
  transition.advance(799);
  assert.equal(transition.render().props["aria-busy"], true);
  transition.advance(1);
  transition.render();
  transition.advance(0);
  tree = transition.render();
  assert.equal(tree.props["aria-busy"], false);
  assert.equal(tree.props.children[0].props.children.props.inert, false);
  assert.ok(tree.props.children[1].props.className.includes("opacity-0"));
  transition.advance(239);
  assert.ok(transition.render().props.children[1]);
  transition.advance(1);
  assert.equal(transition.render().props.children[1], false);
  assert.equal(transition.timerCount(), 0);
});

test("chart entrances wait for page reveal, including when data is slower than the overlay", () => {
  const transition = transitionHarness();
  const revealProvider = (tree) => tree.props.children[0].props.children.props.children;
  let tree = transition.render({ loading: true });
  assert.equal(revealProvider(tree).type, loadingActivity.PageRevealContext.Provider);
  assert.equal(revealProvider(tree).props.value, false);
  transition.advance(1500);
  assert.equal(revealProvider(transition.render({ loading: true })).props.value, false);
  transition.render({ loading: false });
  transition.advance(0);
  tree = transition.render();
  assert.equal(revealProvider(tree).props.value, true);
  transition.unmount();
});

test("donut charts inherit reveal timing and include every category in the drawing", () => {
  const data = [{ key: "received", label: "Received", value: 20 }, { key: "pending", label: "Pending", value: 10 }];
  const markup = renderToStaticMarkup(React.createElement(loadingActivity.PageRevealContext.Provider, { value: false },
    React.createElement(DonutChart, { data, onSelect() {} }),
    React.createElement(DonutChart, { data: data.slice(0, 1), onSelect() {} }),
  ));
  assert.equal((markup.match(/data-chart-ready="false"/g) ?? []).length, 2);
  assert.equal((markup.match(/data-start=/g) ?? []).length, 3);
  assert.equal((markup.match(/aria-label="Received: 20/g) ?? []).length, 4);
  const standalone = renderToStaticMarkup(React.createElement(DonutChart, { data, onSelect() {} }));
  assert.ok(standalone.includes('data-chart-ready="true"'));
  const empty = renderToStaticMarkup(React.createElement(DonutChart, { data: [], onSelect() {} }));
  assert.ok(empty.includes("No data to chart yet."));
  assert.ok(!empty.includes("<svg"));
});

function donutDrawing({ revealed = true, reduced = false, single = false } = {}) {
  const segments = (single ? [[0, 360]] : [[0, 240], [240, 360]]).map(([start, end]) => ({
    dataset: { start, end }, d: "",
    setAttribute(name, value) { this[name] = value; },
  }));
  const frames = new Map();
  let sequence = 0;
  let effect;
  let motionChange;
  const Chart = load("components/DonutChart.tsx", {
    "./loading/LoadingActivity": loadingActivity,
    react: {
      useState: (initial) => [initial, () => {}],
      useContext: () => revealed,
      useRef: () => ({ current: { querySelectorAll: () => segments } }),
      useLayoutEffect: (callback) => { effect = callback; },
    },
  }, {
    matchMedia: () => ({
      matches: reduced,
      addEventListener: (_name, callback) => { motionChange = callback; },
      removeEventListener: () => { motionChange = undefined; },
    }),
    requestAnimationFrame(callback) { frames.set(++sequence, callback); return sequence; },
    cancelAnimationFrame(id) { frames.delete(id); },
  }, { now: () => 0 }).default;
  Chart({ data: single ? [{ key: "a", label: "A", value: 30 }] : [{ key: "a", label: "A", value: 20 }, { key: "b", label: "B", value: 10 }], onSelect() {} });
  const cleanup = effect();
  return {
    segments, frames, cleanup,
    reduceMotion() { motionChange(); },
    advance(now) {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(now));
    },
  };
}

test("all pie slices expand together from an empty ring and finish without a seam", () => {
  const drawing = donutDrawing();
  assert.ok(drawing.segments.every(({ d }) => d === ""));
  drawing.advance(239);
  assert.ok(drawing.segments.every(({ d }) => d === ""), "wait for the page crossfade");
  drawing.advance(600);
  const partial = drawing.segments.map(({ d }) => d);
  assert.ok(partial.every((d) => d.startsWith("M ")), "every category participates during the sweep");
  drawing.advance(1640);
  drawing.segments.forEach(({ d }, index) => assert.notEqual(d, partial[index], "slice angles expand, rather than revealing finished slices"));
  assert.equal(drawing.frames.size, 0);
  drawing.cleanup();

  const single = donutDrawing({ single: true });
  single.advance(1640);
  assert.equal((single.segments[0].d.match(/ A /g) ?? []).length, 4, "full rings use two outer and two inner arcs");
  assert.ok(single.segments[0].d.endsWith(" Z"));
  single.cleanup();
});

test("pie drawing waits for reveal, cancels on navigation, and respects reduced motion", () => {
  const hidden = donutDrawing({ revealed: false });
  assert.equal(hidden.frames.size, 0);
  assert.ok(hidden.segments.every(({ d }) => d === ""));
  const reduced = donutDrawing({ reduced: true });
  assert.equal(reduced.frames.size, 0);
  assert.ok(reduced.segments.every(({ d }) => d !== ""));
  const interrupted = donutDrawing();
  interrupted.advance(500);
  interrupted.cleanup();
  assert.equal(interrupted.frames.size, 0);
  const changed = donutDrawing();
  changed.advance(500);
  changed.reduceMotion();
  assert.equal(changed.frames.size, 0);
  assert.deepEqual(changed.segments.map(({ d }) => d), reduced.segments.map(({ d }) => d));
  changed.cleanup();
});

test("slow pages wait for all sections; later refreshes do not replay the preloader", () => {
  const transition = transitionHarness();
  let tree = transition.render();
  const register = tree.props.children[0].props.value;
  const finishTable = register();
  const finishChart = register();
  transition.render();
  transition.advance(1500);
  assert.equal(transition.render().props["aria-busy"], true);
  finishTable();
  assert.equal(transition.render().props["aria-busy"], true);
  finishChart();
  transition.render();
  transition.advance(0);
  assert.equal(transition.render().props["aria-busy"], false);
  const finishRefresh = register();
  assert.equal(transition.render().props["aria-busy"], false);
  finishRefresh();
  transition.unmount();
});

test("interrupting navigation clears its transition timers", () => {
  const transition = transitionHarness();
  transition.render();
  assert.equal(transition.timerCount(), 1);
  transition.advance(300);
  transition.unmount();
  assert.equal(transition.timerCount(), 0);
});

test("initial navigation waits for its account details even after the minimum display time", () => {
  const transition = transitionHarness();
  transition.render({ loading: true });
  transition.advance(1600);
  assert.equal(transition.render({ loading: true }).props["aria-busy"], true);
  transition.render({ loading: false });
  transition.advance(0);
  assert.equal(transition.render({ loading: false }).props["aria-busy"], false);
  // The same persistent navbar remains usable during subsequent navigation.
  assert.equal(transition.render({ loading: true }).props["aria-busy"], false);
  transition.unmount();
});

test("navigation wireframe matches sidebar dimensions and adapts to role-specific menu length", () => {
  for (const itemCount of [4, 6]) {
    const markup = renderToStaticMarkup(React.createElement(skeletons.SidebarSkeleton, { itemCount }));
    assert.ok(markup.includes('aria-label="Loading navigation"'));
    assert.ok(markup.includes("motion-reduce:animate-none"));
    assert.ok(markup.includes("w-[271px]"));
    assert.ok(markup.includes("[zoom:0.9]"));
    assert.equal((markup.match(/size-6 shrink-0 opacity-20/g) ?? []).length, itemCount);
    assert.ok(markup.includes("size-[37px]"), "account avatar has its own placeholder");
    assert.ok(!/<(button|a)\b/.test(markup));
  }
});

test("standalone navigations reset timing by destination; clinic transitions stay inside the shell", () => {
  let pathname = "/login";
  const PageTransition = () => null;
  const DocumentTransition = load("components/loading/DocumentTransition.tsx", {
    "next/navigation": { usePathname: () => pathname },
    "./PageTransition": PageTransition,
    "./RouteSkeleton": () => null,
  }).default;
  const children = React.createElement("p", null, "Page content");
  const login = DocumentTransition({ children });
  assert.equal(login.type, PageTransition);
  pathname = "/forgot-password";
  assert.notEqual(DocumentTransition({ children }).key, login.key);
  pathname = "/clinic-selection/branch-123/revenue";
  assert.equal(DocumentTransition({ children }), children);
  pathname = "/missing-page";
  assert.equal(DocumentTransition({ children }), children);
});

// Run the real page component and effects with controlled pending API promises.
// Inspect its returned element without mounting unrelated dialogs or writing data.
function pageHarness(file, extraImports = {}) {
  const cells = [];
  const effects = [];
  const requests = [];
  let cursor = 0;
  let firstRender = true;
  const hooks = {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in cells)) cells[index] = typeof initial === "function" ? initial() : initial;
      return [cells[index], (next) => { cells[index] = typeof next === "function" ? next(cells[index]) : next; }];
    },
    useEffect(effect) { if (firstRender) effects.push(effect); },
    useMemo: (fn) => fn(), useCallback: (fn) => fn, useRef: (value) => ({ current: value }),
  };
  const pending = (url) => new Promise((resolve, reject) => requests.push({ url, resolve, reject }));
  const imports = {
    react: hooks,
    "next/image": () => null,
    "next/navigation": {
      useParams: () => ({ code: "branch-123", id: "person-123" }),
      useSearchParams: () => new URLSearchParams(),
      usePathname: () => "/clinic-selection/branch-123/dashboard",
      useRouter: () => ({ push() {}, replace() {}, back() {} }),
    },
    "@/lib/api": { apiFetch: pending, ApiError: class extends Error {} },
    "@/components/loading/PageSkeletons": skeletons,
    "@/lib/appointmentsBus": { useAppointmentsRevision: () => 0 },
    "@/lib/useExclusiveDropdown": { useExclusiveDropdown: () => [false, () => {}] },
    "@/lib/analytics": { analyticsRangeQuery: () => "", frameRange: () => null },
    "../dashboard/AppointmentFormStep": { CONSULTATION_TYPES: [], LEAD_SOURCES: [] },
    "./DoctorFilterPanel": load("app/clinic-selection/[code]/doctors/DoctorFilterPanel.tsx", {
      "./constants": load("app/clinic-selection/[code]/doctors/constants.ts"),
    }),
    "./AppointmentFilterPanel": load("app/clinic-selection/[code]/appointments/AppointmentFilterPanel.tsx"),
    "./RevenueFilterPanel": load("app/clinic-selection/[code]/revenue/RevenueFilterPanel.tsx"),
    "./calendar-mock": load("app/clinic-selection/[code]/calendar/calendar-mock.ts"),
    "../session": { useMe: () => ({ user: { id: "me", role: "CLIENT_ADMIN" } }) },
    ...extraImports,
  };
  // Load pure constants normally; unrelated child components are never mounted.
  const source = fs.readFileSync(path.join(root, file), "utf8");
  for (const [, name] of source.matchAll(/from "([^"]+)"/g)) {
    if (name in imports) continue;
    if (name.endsWith("/mock")) {
      imports[name] = load(path.relative(root, path.resolve(root, path.dirname(file), name + ".ts")));
    } else {
      imports[name] = new Proxy({ __esModule: true, default: () => null }, { get: (object, key) => object[key] ?? (() => null) });
    }
  }
  const Page = load(file, imports).default;
  return {
    requests,
    render() {
      cursor = 0;
      const tree = Page({ code: "branch-123", children: null });
      if (firstRender) { firstRender = false; effects.forEach((effect) => effect()); }
      return tree;
    },
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

function findElement(tree, matches) {
  if (!tree || typeof tree !== "object") return null;
  if (matches(tree)) return tree;
  const children = React.Children.toArray(tree.props?.children);
  for (const child of children) {
    const match = findElement(child, matches);
    if (match) return match;
  }
  return null;
}

for (const branchFailure of [false, true]) test(`navbar transition persists through session loading and branch ${branchFailure ? "failure" : "success"}`, async () => {
  const PageTransition = () => null;
  let pathname = "/clinic-selection/branch-123/dashboard";
  const shell = pageHarness("app/clinic-selection/[code]/DashboardShell.tsx", {
    "@/components/loading/PageTransition": PageTransition,
    "next/navigation": {
      useRouter: () => ({ replace() {} }), usePathname: () => pathname,
    },
    "./session": { useLocalAvatar: () => ({ url: null }), DashboardSessionProvider: () => null },
  });
  const navbar = (tree) => findElement(tree, (element) => element.type === PageTransition && element.props.fallback.type === skeletons.SidebarSkeleton);
  let transition = navbar(shell.render());
  assert.ok(transition, "navbar transition mounts before the session resolves");
  assert.equal(transition.props.loading, true);
  const initialKey = transition.key;
  shell.requests.find((request) => request.url === "/auth/me").resolve({ user: { id: "me", role: "DOCTOR", mustResetPassword: false } });
  await settle();
  transition = navbar(shell.render());
  assert.equal(transition.key, initialKey);
  assert.equal(transition.props.loading, true, "branch details are still pending");
  assert.equal(transition.props.fallback.props.itemCount, 4, "doctor navigation has four items");
  const branches = shell.requests.find((request) => request.url === "/branches");
  if (branchFailure) branches.reject(new Error("Offline"));
  else branches.resolve([{ code: "branch-123", name: "Main", clinicName: "Clinic" }]);
  await settle();
  transition = navbar(shell.render());
  assert.equal(transition.props.loading, false);
  assert.equal(transition.key, initialKey);
  pathname = "/clinic-selection/branch-123/patients";
  assert.equal(navbar(shell.render()).key, initialKey, "page navigation does not remount the navbar transition");
});

for (const [role, count] of [["CLIENT_ADMIN", 6], ["DOCTOR", 4]]) test(`sidebar collapses and stays compact across navigation for ${role}`, async () => {
  const PageTransition = () => null;
  let pathname = "/clinic-selection/branch-123/dashboard";
  const shell = pageHarness("app/clinic-selection/[code]/DashboardShell.tsx", {
    "@/components/loading/PageTransition": PageTransition,
    "next/navigation": { useRouter: () => ({ replace() {} }), usePathname: () => pathname },
    "./session": { useLocalAvatar: () => ({ url: null }), DashboardSessionProvider: () => null },
  });
  shell.render();
  shell.requests.find(({ url }) => url === "/auth/me").resolve({ user: { id: "me", role, mustResetPassword: false } });
  shell.requests.find(({ url }) => url === "/branches").resolve([]);
  await settle();
  const sidebar = (tree) => findElement(tree, (element) => element.type === PageTransition && element.props.fallback.type === skeletons.SidebarSkeleton).props.children;
  const toggle = (tree) => findElement(tree, (element) => element.props?.["aria-controls"] === "clinic-sidebar");
  let tree = shell.render();
  assert.equal(toggle(tree).props["aria-expanded"], true);
  assert.equal(sidebar(tree).props.collapsed, false);
  toggle(tree).props.onClick();
  tree = shell.render();
  assert.equal(toggle(tree).props["aria-label"], "Expand sidebar");
  assert.equal(toggle(tree).props["aria-expanded"], false);
  const compact = sidebar(tree);
  assert.equal(compact.props.collapsed, true);
  assert.equal(compact.props.items.length, count, "role-based visibility stays intact");
  const aside = compact.type(compact.props);
  assert.equal(aside.props.id, "clinic-sidebar");
  assert.ok(aside.props.className.includes("w-[80px]"));
  const nav = findElement(aside, (element) => element.type === "nav");
  const links = React.Children.toArray(nav.props.children);
  assert.equal(links.length, count);
  for (const link of links) {
    assert.ok(link.props.href.startsWith("/clinic-selection/branch-123/"));
    assert.equal(link.props.title, link.props["aria-label"]);
    assert.ok(React.Children.toArray(link.props.children)[1].props.className.includes("sr-only"));
  }
  assert.equal(links[0].props["aria-current"], "page");
  const userChip = findElement(aside, (element) => element.props?.me && element.props?.collapsed === true);
  assert.ok(userChip, "account controls remain available in the compact rail");
  pathname = "/clinic-selection/branch-123/patients";
  tree = shell.render();
  assert.equal(sidebar(tree).props.collapsed, true);
  const changed = sidebar(tree);
  const changedNav = findElement(changed.type(changed.props), (element) => element.type === "nav");
  assert.equal(React.Children.toArray(changedNav.props.children)[2].props["aria-current"], "page");
  toggle(tree).props.onClick();
  tree = shell.render();
  assert.equal(toggle(tree).props["aria-label"], "Collapse sidebar");
  assert.equal(sidebar(tree).props.collapsed, false);
});

for (const [file, skeleton] of [
  ["patients/PatientsClient.tsx", "PatientsSkeleton"], ["doctors/DoctorsClient.tsx", "DoctorsSkeleton"],
  ["appointments/AppointmentsClient.tsx", "AppointmentsSkeleton"], ["analytics/AnalyticsClient.tsx", "AnalyticsSkeleton"],
  ["revenue/RevenueClient.tsx", "RevenueSkeleton"], ["calendar/FullCalendarView.tsx", "CalendarSkeleton"],
  ["accounts/AccountsClient.tsx", "AccountsSkeleton"],
]) {
  for (const failure of [false, true]) test(`${file}: skeleton waits for initial data and clears on ${failure ? "failure" : "success"}`, async () => {
    const page = pageHarness("app/clinic-selection/[code]/" + file);
    assert.equal(page.render().type, skeletons[skeleton]);
    assert.ok(page.requests.length > 0);
    assert.equal(page.render().type, skeletons[skeleton]);
    for (const request of page.requests) failure ? request.reject(new Error("Offline")) : request.resolve([]);
    await settle();
    assert.notEqual(page.render().type, skeletons[skeleton]);
  });
}
