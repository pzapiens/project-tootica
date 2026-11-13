const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const Pagination = () => null;
const nodes = tree => !tree || typeof tree !== "object" ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
const find = (tree, name) => nodes(tree).find(node => node.type?.name === name);
const rows = tree => nodes(tree).filter(node => node.type?.name === "AccountRow");
const footer = tree => nodes(tree).find(node => node.type === Pagination)?.props;
const roles = { CLIENT_ADMIN: "Admin", DOCTOR: "Doctor", RECEPTIONIST: "Receptionist", GUEST_DOCTOR: "Guest Doctor" };

function harness(count = 45) {
  const state = new Map(), dependencies = new Map();
  let current, cursor, effectCursor, effects;
  const hooks = {
    ...React,
    useState(initial) {
      const values = state.get(current), index = cursor++;
      if (!(index in values)) values[index] = initial;
      return [values[index], next => { values[index] = typeof next === "function" ? next(values[index]) : next; }];
    },
    useRef: () => ({ current: null }),
    useEffect(effect, deps) {
      const previous = dependencies.get(current), index = effectCursor++;
      if (!previous[index] || deps.some((value, offset) => value !== previous[index][offset])) {
        previous[index] = deps;
        effects.push(effect);
      }
    },
  };
  const me = { user: { id: "self", role: "CLIENT_ADMIN" } };
  const accounts = Array.from({ length: count }, (_, index) => ({
    id: String(index + 1), firstName: "Account " + (index + 1), lastName: "", email: index + "@example.test",
    role: Object.keys(roles)[index % 3], status: "ACTIVE", createdAt: "2026-11-13T09:00:00Z",
  }));
  const mocks = {
    react: hooks,
    "next/image": () => null,
    "@/components/FloatingPanel": () => null,
    "@/components/TableViewport": () => null,
    "@/components/TablePagination": Pagination,
    "@/lib/useExclusiveDropdown": { useExclusiveDropdown: () => hooks.useState(false) },
    "@/lib/api": { apiFetch: async () => [me.user, ...accounts], ApiError: Error, displayName: account => account.firstName, roleAvatar: () => "", ROLE_LABELS: roles },
    "@/lib/password": { passwordPolicyError: () => null },
    "@/components/loading/PageSkeletons": { AccountsSkeleton: () => null },
    "../session": { useMe: () => me },
  };
  const source = fs.readFileSync(path.join(__dirname, "../src/app/clinic-selection/[code]/accounts/AccountsClient.tsx"), "utf8");
  const code = ts.transpileModule(source + "\nexport { RoleFilter, UnderlineInput };", {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), loaded, loaded.exports);
  function render(Component = loaded.exports.default, props = {}) {
    current = Component; cursor = 0; effectCursor = 0; effects = [];
    if (!state.has(current)) state.set(current, []);
    if (!dependencies.has(current)) dependencies.set(current, []);
    const tree = Component(props);
    effects.forEach(effect => effect());
    return tree;
  }
  return { render, exports: loaded.exports, async ready() { render(); await new Promise(resolve => setImmediate(resolve)); return render(); } };
}

test("Accounts pagination excludes the current user and changes page size", async () => {
  const app = harness();
  let tree = await app.ready();
  assert.equal(rows(tree).length, 20);
  assert.equal(footer(tree).totalRecords, 45);
  assert.equal(footer(tree).paginationLabel, "Account pages");
  footer(tree).onPageChange(3);
  tree = app.render();
  assert.equal(rows(tree).length, 5);
  assert.equal(rows(tree)[0].props.account.id, "41");
  footer(tree).onPageSizeChange(10);
  tree = app.render();
  assert.equal(footer(tree).currentPage, 1);
  assert.equal(rows(tree).length, 10);
});

test("role filtering resets the page, counts matching accounts, and handles no matches", async () => {
  const app = harness();
  let tree = await app.ready();
  assert.equal(find(tree, "RoleFilter").props.value, "all");
  footer(tree).onPageChange(3);
  find(tree, "RoleFilter").props.onChange("DOCTOR");
  tree = app.render();
  assert.equal(footer(tree).currentPage, 1);
  assert.equal(footer(tree).totalRecords, 15);
  assert.ok(rows(tree).every(row => row.props.account.role === "DOCTOR"));
  find(tree, "RoleFilter").props.onChange("GUEST_DOCTOR");
  tree = app.render();
  assert.equal(rows(tree).length, 0);
  assert.equal(footer(tree), undefined);
  assert.ok(nodes(tree).some(node => node.props?.children === "No accounts match this role."));
  find(tree, "RoleFilter").props.onChange("all");
  assert.equal(footer(app.render()).totalRecords, 45);
});

test("deleting the only account on the last page returns to a populated page", async () => {
  const app = harness(41);
  let tree = await app.ready();
  footer(tree).onPageChange(3);
  tree = app.render();
  rows(tree)[0].props.onDelete();
  find(app.render(), "ConfirmAccountActionDialog").props.onDone(null);
  tree = app.render();
  assert.equal(footer(tree).currentPage, 2);
  assert.equal(footer(tree).totalRecords, 40);
  assert.equal(rows(tree).length, 20);
});

test("role dropdown defaults to All Role and selects accessible role options", () => {
  const app = harness();
  let selected;
  const props = { value: "all", onChange: value => { selected = value; } };
  let tree = app.render(app.exports.RoleFilter, props);
  const trigger = nodes(tree).find(node => node.props?.["aria-label"] === "Filter accounts by role");
  assert.equal(trigger.props.children[0], "All Role");
  trigger.props.onClick();
  tree = app.render(app.exports.RoleFilter, props);
  const options = nodes(tree).filter(node => node.props?.role === "menuitemradio");
  assert.deepEqual(options.map(option => option.props.children), ["All Role", "Admin", "Doctor", "Receptionist", "Guest Doctor"]);
  options[2].props.onClick();
  assert.equal(selected, "DOCTOR");
  assert.equal(nodes(app.render(app.exports.RoleFilter, props)).filter(node => node.props?.role === "menuitemradio").length, 0);
});