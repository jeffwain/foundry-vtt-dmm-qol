/**
 * Tests for the Sidebar Tabs ordering helpers.
 * Run with: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import { applyOrder } from "./order.js";

test("applyOrder follows the saved order", () => {
  assert.deepEqual(applyOrder(["chat", "combat", "scenes"], ["scenes", "chat", "combat"]), ["scenes", "chat", "combat"]);
});

test("applyOrder leaves tabs missing from the saved order where they are", () => {
  // "settings" and the new "extra" tab stay in their slots; the rest swap around them.
  const current = ["chat", "extra", "scenes", "settings"];
  assert.deepEqual(applyOrder(current, ["scenes", "chat"]), ["scenes", "extra", "chat", "settings"]);
});

test("applyOrder ignores saved tabs that no longer exist and tolerates no saved order", () => {
  assert.deepEqual(applyOrder(["chat", "scenes"], ["gone", "scenes", "chat"]), ["scenes", "chat"]);
  assert.deepEqual(applyOrder(["chat", "scenes"], undefined), ["chat", "scenes"]);
});
