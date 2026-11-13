const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function compile(file) {
  return ts.transpileModule(fs.readFileSync(path.resolve(__dirname, "../src", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
}
const moduleObject = { exports: {} };
vm.runInNewContext(compile("lib/viewport-bootstrap.ts"), { exports: moduleObject.exports });
const script = moduleObject.exports.VIEWPORT_BOOTSTRAP;

function browser({ zoom = 1, dpi = 1, width = 1440, height = 820, touch = false } = {}) {
  const values = new Map();
  const listeners = new Map();
  const frames = [];
  const media = [];
  const root = {
    dataset: {},
    style: {
      getPropertyValue: (name) => values.get(name) ?? "",
      setProperty: (name, value) => values.set(name, value),
    },
  };
  const screen = { width: 1920 / dpi, height: 1080 / dpi, availWidth: 1920 / dpi, availHeight: 1040 / dpi };
  const window = {
    innerWidth: Math.round(width / zoom),
    innerHeight: Math.round(height / zoom),
    outerWidth: width + 16,
    devicePixelRatio: dpi * zoom,
    screen,
    matchMedia(query) {
      const entry = { query, matches: query.includes("pointer: coarse") && touch, callback: null,
        addEventListener(type, callback) { this.callback = callback; },
        removeEventListener() { this.callback = null; },
      };
      media.push(entry);
      return entry;
    },
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    },
    dispatchEvent(event) { for (const callback of listeners.get(event.type) ?? []) callback(event); },
  };
  const context = {
    window, screen, document: { documentElement: root },
    CustomEvent: class { constructor(type) { this.type = type; } },
  };
  const run = () => vm.runInNewContext(script, context);
  run();
  const flush = () => { while (frames.length) frames.shift()(); };
  return {
    window, root, media, listeners, context, run, flush,
    number: (name) => parseFloat(values.get(name)),
    change({ nextZoom = zoom, nextDpi = dpi, nextWidth = width, nextHeight = height, resolutionOnly = false } = {}) {
      zoom = nextZoom; dpi = nextDpi; width = nextWidth; height = nextHeight;
      window.innerWidth = Math.round(width / zoom);
      window.innerHeight = Math.round(height / zoom);
      window.outerWidth = width + 16;
      window.devicePixelRatio = dpi * zoom;
      Object.assign(screen, { width: 1920 / dpi, height: 1080 / dpi, availWidth: 1920 / dpi, availHeight: 1040 / dpi });
      if (resolutionOnly) media.findLast((item) => item.query.startsWith("(resolution:") && item.callback)?.callback();
      else window.dispatchEvent({ type: "resize" });
      flush();
    },
  };
}
const close = (actual, expected, tolerance = 0.000001) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);

for (const dpi of [1, 1.25, 1.5, 1.75, 2]) {
  test(`every initial 80-120% zoom matches the 90% view at display scaling ${dpi}`, () => {
    for (const zoom of [0.8, 0.9, 1, 1.1, 1.2]) {
      const app = browser({ zoom, dpi });
      close(app.number("--app-scale") * zoom, 0.9);
      close(app.number("--app-viewport-width"), 1440 / 0.9, 1);
      close(app.number("--app-viewport-height"), 820 / 0.9, 1);
      close(app.number("--app-vh") * 100, app.number("--app-viewport-height"));
    }
  });
}
test("repeated zoom changes retain the same layout and fit both viewport axes", () => {
  const app = browser({ zoom: 0.9, dpi: 1.25 });
  for (const zoom of [1.2, 0.8, 1.1, 1, 0.9, 1.2]) {
    app.change({ nextZoom: zoom });
    const scale = app.number("--app-scale");
    close(app.number("--app-viewport-width"), 1600, 1);
    close(app.number("--app-viewport-height"), 820 / 0.9, 1);
    close(app.number("--app-viewport-width") * scale, app.window.innerWidth);
    close(app.number("--app-viewport-height") * scale, app.window.innerHeight);
  }
});
test("real window resizing changes the layout while zoom compensation remains constant", () => {
  const app = browser({ zoom: 1.2 });
  app.change({ nextWidth: 1080, nextHeight: 600 });
  close(app.number("--app-viewport-width"), 1200);
  close(app.number("--app-viewport-height"), 600 / 0.9);
  close(app.number("--app-scale"), 0.75);
});
test("DPR events update zoom without a resize and displays can change their scaling", () => {
  const app = browser({ zoom: 1, dpi: 1.25 });
  app.change({ nextZoom: 1.2, resolutionOnly: true });
  close(app.number("--app-scale"), 0.75);
  app.change({ nextDpi: 2 });
  close(app.number("--app-scale"), 0.75);
  close(app.number("--app-viewport-width"), 1600, 1);
});
test("opening a side panel after calibration preserves the scale across later zoom changes", () => {
  const app = browser({ zoom: 1 });
  app.window.innerWidth = 1100;
  app.window.dispatchEvent({ type: "resize" });
  app.flush();
  close(app.number("--app-scale"), 0.9);
  const width = app.number("--app-viewport-width");
  app.window.devicePixelRatio = 1.1;
  app.window.innerWidth = 1000;
  app.window.dispatchEvent({ type: "resize" });
  app.flush();
  close(app.number("--app-scale"), 0.9 / 1.1);
  close(app.number("--app-viewport-width"), width);
});

test("touch devices and zoom outside the requested range retain native zoom", () => {
  close(browser({ touch: true, zoom: 1.2 }).number("--app-scale"), 1);
  close(browser({ zoom: 1.5 }).number("--app-scale"), 1);
});
test("head initialization is idempotent", () => {
  const app = browser();
  const subscriptions = app.listeners.get("resize").length;
  app.run();
  assert.equal(app.listeners.get("resize").length, subscriptions);
});
test("body-portal popup coordinates are converted back to the normalized app space", () => {
  const app = browser({ zoom: 1.2 });
  const exports = {};
  vm.runInNewContext(compile("lib/viewport.ts"), { ...app.context, exports });
  const rect = exports.getAppRect({ getBoundingClientRect: () => ({
    x: 150, left: 150, y: 75, top: 75, right: 225, bottom: 105, width: 75, height: 30,
  }) });
  close(rect.left, 200); close(rect.top, 100);
  close(rect.width, 100); close(rect.height, 40);
  close(exports.getAppViewport().width, 1600);
  assert.equal(exports.getAppRect(null), null);
});
