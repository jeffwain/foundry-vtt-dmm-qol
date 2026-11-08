/**
 * Tests for the Settings pane module-toggle helpers.
 * Run with: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import { moduleSummary, effectiveState, stageToggle, configurationAfter, disabledRows } from "./modules.js";

const make = (list) => new Map(list.map((m) => [m.id, { title: m.id.toUpperCase(), requires: [], ...m }]));

test("moduleSummary keeps only required modules, not systems", () => {
  const summary = moduleSummary({
    id: "a",
    title: "A",
    active: 1,
    relationships: { requires: new Set([{ id: "lib" }, { id: "dnd5e", type: "system" }, { id: "b", type: "module" }]) },
  });
  assert.deepEqual(summary, { id: "a", title: "A", active: true, requires: ["lib", "b"] });
  assert.deepEqual(moduleSummary({ id: "x" }), { id: "x", title: "x", active: false, requires: [] });
});

test("effectiveState prefers the staged value", () => {
  const mod = { id: "a", active: true };
  assert.equal(effectiveState(mod, new Map()), true);
  assert.equal(effectiveState(mod, new Map([["a", false]])), false);
});

test("enabling a module also enables what it requires, through a chain", () => {
  const modules = make([
    { id: "a", active: false, requires: ["b"] },
    { id: "b", active: false, requires: ["c"] },
    { id: "c", active: false },
    { id: "d", active: false },
  ]);
  const result = stageToggle(modules, new Map(), "a", true);
  assert.deepEqual([...result.pending].sort(), [["a", true], ["b", true], ["c", true]]);
  assert.deepEqual(result.changed.sort(), ["b", "c"]);
});

test("enabling skips requirements that are already on", () => {
  const modules = make([
    { id: "a", active: false, requires: ["lib"] },
    { id: "lib", active: true },
  ]);
  const result = stageToggle(modules, new Map(), "a", true);
  assert.deepEqual([...result.pending], [["a", true]]);
  assert.deepEqual(result.changed, []);
});

test("enabling with a missing requirement changes nothing", () => {
  const modules = make([{ id: "a", active: false, requires: ["gone"] }]);
  const before = new Map([["x", true]]);
  const result = stageToggle(modules, before, "a", true);
  assert.deepEqual([...result.pending], [["x", true]]);
  assert.deepEqual(result.missing, ["gone"]);
});

test("disabling a module also disables the modules that require it", () => {
  const modules = make([
    { id: "lib", active: true },
    { id: "a", active: true, requires: ["lib"] },
    { id: "b", active: true, requires: ["a"] },
    { id: "off", active: false, requires: ["lib"] },
    { id: "other", active: true },
  ]);
  const result = stageToggle(modules, new Map(), "lib", false);
  assert.deepEqual([...result.pending].sort(), [["a", false], ["b", false], ["lib", false]]);
  assert.deepEqual(result.changed.sort(), ["a", "b"]);
});

test("toggling a module back to its real state clears the staged change", () => {
  const modules = make([{ id: "a", active: true }]);
  const off = stageToggle(modules, new Map(), "a", false).pending;
  assert.equal(off.size, 1);
  assert.equal(stageToggle(modules, off, "a", true).pending.size, 0);
});

test("circular requirements don't loop", () => {
  const modules = make([
    { id: "a", active: false, requires: ["b"] },
    { id: "b", active: false, requires: ["a"] },
  ]);
  assert.equal(stageToggle(modules, new Map(), "a", true).pending.size, 2);
});

test("configurationAfter lists every module with its final state", () => {
  const modules = make([
    { id: "a", active: true },
    { id: "b", active: false },
    { id: "c", active: false },
  ]);
  assert.deepEqual(configurationAfter(modules, new Map([["a", false], ["b", true]])), { a: false, b: true, c: false });
});

test("disabledRows lists only disabled modules, by title", () => {
  const rows = disabledRows([
    { id: "z", title: "Zed", active: false },
    { id: "on", title: "On", active: true },
    { id: "a", title: "Alpha", active: false },
  ]);
  assert.deepEqual(
    rows.map((row) => [row.id, row.label, row.disabled]),
    [["a", "Alpha", true], ["z", "Zed", true]],
  );
});
