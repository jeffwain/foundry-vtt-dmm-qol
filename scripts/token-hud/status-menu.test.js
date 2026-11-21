/**
 * Tests for picking which effects a status clear removes.
 * Run with: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import { clearableEffectIds } from "./status-menu.js";

const shown = new Set(["prone", "poisoned", "exhaustion", "contamination", "concentrating"]);
const levelled = new Set(["exhaustion", "contamination"]);
const keep = (id) => levelled.has(id) || id === "concentrating";
const effect = (id, ...statuses) => ({ id, statuses: new Set(statuses) });

test("clearableEffectIds removes plain statuses and keeps stacked ones", () => {
  const effects = [
    effect("a", "prone"),
    effect("b", "exhaustion"),
    effect("c", "poisoned"),
    effect("d", "contamination"),
  ];
  assert.deepEqual(clearableEffectIds(effects, shown, keep), ["a", "c"]);
});

test("clearableEffectIds keeps concentration", () => {
  assert.deepEqual(clearableEffectIds([effect("a", "concentrating")], shown, keep), []);
});

test("clearableEffectIds leaves effects with no HUD status alone", () => {
  // A spell or feature effect with no status, or one the HUD doesn't list.
  assert.deepEqual(clearableEffectIds([effect("a"), effect("b", "homebrew-mark")], shown, keep), []);
});

test("clearableEffectIds keeps a whole effect if any of its statuses is kept", () => {
  assert.deepEqual(clearableEffectIds([effect("a", "prone", "exhaustion")], shown, keep), []);
});
