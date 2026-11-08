/**
 * Tests for the group roll card helpers.
 * Run with: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import { rowsToRoll, keptSetIndex, resetTarget, removeTarget } from "./targets.js";

const rows = [
  { uuid: "Actor.pc", completed: false, canRoll: true, playerOwned: true },
  { uuid: "Actor.npc", completed: false, canRoll: true, playerOwned: false },
  { uuid: "Actor.done", completed: true, canRoll: true, playerOwned: false },
  { uuid: "Actor.other", completed: false, canRoll: false, playerOwned: true },
];

test("rowsToRoll takes every pending row the user may roll", () => {
  assert.deepEqual(rowsToRoll(rows), ["Actor.pc", "Actor.npc"]);
});

test("rowsToRoll with npcOnly skips player-owned actors", () => {
  assert.deepEqual(rowsToRoll(rows, { npcOnly: true }), ["Actor.npc"]);
});

test("rowsToRoll returns nothing when every row is done", () => {
  assert.deepEqual(rowsToRoll([{ uuid: "Actor.a", completed: true, canRoll: true, playerOwned: false }]), []);
});

const targets = [
  { actor: "Actor.a", result: "msgA", user: null },
  { actor: "Actor.b", result: "msgB", user: "user1" },
  { actor: "Actor.c", result: null, user: null },
];

test("resetTarget clears only that row's result and reports the old id", () => {
  const { targets: next, resultId } = resetTarget(targets, "Actor.b");
  assert.equal(resultId, "msgB");
  assert.deepEqual(next, [
    { actor: "Actor.a", result: "msgA", user: null },
    { actor: "Actor.b", result: null, user: "user1" },
    { actor: "Actor.c", result: null, user: null },
  ]);
  // The source array is left alone.
  assert.equal(targets[1].result, "msgB");
});

test("resetTarget on a pending row has no result to report", () => {
  assert.equal(resetTarget(targets, "Actor.c").resultId, null);
});

test("removeTarget drops the row and reports its result id", () => {
  const { targets: next, resultId } = removeTarget(targets, "Actor.a");
  assert.equal(resultId, "msgA");
  assert.deepEqual(next.map((t) => t.actor), ["Actor.b", "Actor.c"]);
  assert.equal(targets.length, 3);
});

test("unknown actors return null", () => {
  assert.equal(resetTarget(targets, "Actor.missing"), null);
  assert.equal(removeTarget(targets, "Actor.missing"), null);
});

test("keptSetIndex keeps the higher roll for advantage and the lower for disadvantage", () => {
  assert.equal(keptSetIndex([10, 17], true), 1);
  assert.equal(keptSetIndex([10, 17], false), 0);
  assert.equal(keptSetIndex([10, 4], false), 1);
});

test("keptSetIndex keeps the original roll on a tie", () => {
  assert.equal(keptSetIndex([12, 12], true), 0);
  assert.equal(keptSetIndex([12, 12], false), 0);
});

test("keptSetIndex handles Elven Accuracy's two extra dice and no dice", () => {
  assert.equal(keptSetIndex([8, 15, 19], true), 2);
  assert.equal(keptSetIndex([], true), -1);
});
