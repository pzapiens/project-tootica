const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const directory = path.resolve(
  __dirname,
  "../src/app/clinic-selection/[code]/dashboard",
);
function load(file, imports = {}) {
  const source = ts.transpileModule(
    fs.readFileSync(path.join(directory, file), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", source)(
    (name) => (Object.hasOwn(imports, name) ? imports[name] : require(name)),
    module,
    module.exports,
  );
  return module.exports;
}

const helpers = load("notification-items.ts");
const item = (id, receivedAt) => ({ id, text: id, time: "now", receivedAt });

function find(node, predicate) {
  if (!React.isValidElement(node)) return null;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props.children)) {
    const match = find(child, predicate);
    if (match) return match;
  }
  return null;
}
function harness() {
  const state = [];
  let cursor = 0;
  const hooks = {
    ...React,
    useRef: () => ({ current: null }),
    useState(initial) {
      const index = cursor++;
      if (!(index in state))
        state[index] = typeof initial === "function" ? initial() : initial;
      return [
        state[index],
        (value) => {
          state[index] =
            typeof value === "function" ? value(state[index]) : value;
        },
      ];
    },
  };
  const now = Date.now();
  const entries = [
    item("first", now),
    item("second", now),
    item("older", new Date(new Date().getFullYear() - 1, 0, 1).getTime()),
  ];
  const Component = load("NotificationBell.tsx", {
    react: hooks,
    "./notification-items": {
      ...helpers,
      createInitialNotifications: () => entries,
    },
    "@/components/FloatingPanel": () => null,
    "@/components/HoverTip": { Tip: () => null },
    "./notifications.module.css": {},
  }).default;
  const render = () => {
    cursor = 0;
    return Component();
  };
  const trigger = (tree) =>
    find(tree, (n) => n.props["aria-haspopup"] === "dialog");
  return { render, trigger };
}

test("all notification ages appear together with only the bulk clear control", () => {
  const app = harness();
  let tree = app.render();
  app.trigger(tree).props.onClick();
  tree = app.render();
  assert.equal(find(tree, (node) => node.props.role === "tablist"), null);
  assert.equal(find(tree, (node) => node.type === "ul").props.children.length, 3);
  assert.equal(app.trigger(tree).props["aria-label"], "Notifications (3)");
  assert.equal(find(tree, (node) => node.type === "button" && /Mark.*read/i.test(node.props["aria-label"] ?? "")), null);
  assert.equal(find(tree, (node) => node.type === "li" && find(node, (child) => child.type === "button") !== null), null);
  assert.ok(find(tree, (node) => node.type === "p" && node.props.title === "older"));
  assert.ok(find(tree, (node) => node.props["aria-label"] === "Clear all notifications"));
});

test("Clear all empties the feed and stays cleared when reopened", () => {
  const app = harness();
  let tree = app.render();
  app.trigger(tree).props.onClick();
  tree = app.render();
  const clearAll = (value) => find(value, (node) => node.props["aria-label"] === "Clear all notifications");
  assert.equal(clearAll(tree).props.disabled, false);
  clearAll(tree).props.onClick();
  tree = app.render();
  assert.ok(find(tree, (node) => node.props.role === "status"));
  assert.equal(app.trigger(tree).props["aria-label"], "Notifications");
  assert.equal(clearAll(tree).props.disabled, true);
  app.trigger(tree).props.onClick();
  tree = app.render();
  app.trigger(tree).props.onClick();
  tree = app.render();
  assert.ok(find(tree, (node) => node.props.role === "status"));
  assert.equal(find(tree, (node) => node.type === "ul"), null);
});
