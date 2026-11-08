/**
 * Tests for the X-Card font cycle helpers.
 * Run with: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import { cardFamilies, nextFamily, pickStart } from "./cycle.js";

test("cardFamilies keeps ticked fonts that are still enabled, in order", () => {
  const enabled = new Set(["Alpha", "Beta", "Gamma"]);
  assert.deepEqual(cardFamilies(["Gamma", "Off", "Alpha"], enabled), ["Gamma", "Alpha"]);
});

test("cardFamilies drops repeats and tolerates a missing setting", () => {
  const enabled = new Set(["Alpha"]);
  assert.deepEqual(cardFamilies(["Alpha", "Alpha"], enabled), ["Alpha"]);
  assert.deepEqual(cardFamilies(undefined, enabled), []);
});

test("nextFamily steps forward and wraps around", () => {
  const list = ["Alpha", "Beta", "Gamma"];
  assert.equal(nextFamily(list, "Alpha"), "Beta");
  assert.equal(nextFamily(list, "Gamma"), "Alpha");
});

test("nextFamily starts over when the current font left the list", () => {
  assert.equal(nextFamily(["Alpha", "Beta"], "Gone"), "Alpha");
  assert.equal(nextFamily([], "Alpha"), "");
});

test("pickStart never repeats the previous start when there is a choice", () => {
  const list = ["Alpha", "Beta", "Gamma"];
  // Random values at both ends of the range still skip the previous font.
  assert.equal(pickStart(list, "Alpha", () => 0), "Beta");
  assert.equal(pickStart(list, "Alpha", () => 0.999), "Gamma");
  assert.equal(pickStart(list, "Gamma", () => 0.999), "Beta");
});

test("pickStart handles one font or none", () => {
  assert.equal(pickStart(["Alpha"], "Alpha"), "Alpha");
  assert.equal(pickStart([], "Alpha"), "");
});
