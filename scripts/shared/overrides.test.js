import test from "node:test";
import assert from "node:assert/strict";

import { resolveValues } from "./overrides.js";

const world = { scale: 1, floor: 70 };

test("a GM always gets the world values", () => {
  assert.deepEqual(resolveValues({ isGM: true, world, mine: { scale: 2 } }), world);
});

test("a player with no overrides gets the world values", () => {
  assert.deepEqual(resolveValues({ isGM: false, world, mine: {} }), world);
});

test("a player's override wins, other keys fall back", () => {
  assert.deepEqual(resolveValues({ isGM: false, world, mine: { scale: 1.5 } }), { scale: 1.5, floor: 70 });
});

test("an override of 0 or an empty list is kept", () => {
  const w = { scale: 1, hidden: ["chat"] };
  assert.deepEqual(resolveValues({ isGM: false, world: w, mine: { scale: 0, hidden: [] } }), { scale: 0, hidden: [] });
});

test("keys the world doesn't define are ignored", () => {
  assert.deepEqual(resolveValues({ isGM: false, world, mine: { stray: 5 } }), world);
});
