/**
 * Tests for copying HUD changes to every selected token.
 * Run with: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import { affectedActors, affectedTokens, statusChange } from "./multi-select.js";

const goblin = { name: "goblin" };
const orc = { name: "orc" };
const wolf = { name: "wolf" };
const token = (id, actor) => ({ id, actor });

test("affectedActors lists the other actors and counts the HUD token's too", () => {
  const hud = token("a", goblin);
  const result = affectedActors([hud, token("b", orc), token("c", wolf)], hud);
  assert.deepEqual(result.others, [orc, wolf]);
  assert.equal(result.count, 3);
});

test("affectedActors changes an actor with several tokens once", () => {
  const hud = token("a", goblin);
  const result = affectedActors([hud, token("b", goblin), token("c", orc), token("d", orc)], hud);
  assert.deepEqual(result.others, [orc]);
  assert.equal(result.count, 2);
});

test("affectedActors skips tokens with no actor", () => {
  const hud = token("a", goblin);
  const result = affectedActors([hud, token("b", null)], hud);
  assert.deepEqual(result.others, []);
  assert.equal(result.count, 1);
});

test("affectedActors does nothing when the HUD token isn't selected", () => {
  const result = affectedActors([token("b", orc), token("c", wolf)], token("a", goblin));
  assert.deepEqual(result, { others: [], count: 0 });
});

test("affectedTokens lists the other tokens and counts all selected", () => {
  const hud = token("a", goblin);
  const b = token("b", goblin);
  const result = affectedTokens([hud, b, token("c", null)], hud);
  assert.deepEqual(result.others.map((t) => t.id), ["b", "c"]);
  assert.equal(result.count, 3);
});

test("affectedTokens does nothing when the HUD token isn't selected", () => {
  assert.deepEqual(affectedTokens([token("b", orc)], token("a", goblin)), { others: [], count: 0 });
});

test("statusChange sets others to the clicked token's new state", () => {
  assert.deepEqual(statusChange({ statusId: "prone", rightClick: false, wasActive: false, hasLevels: false }), {
    options: { active: true, overlay: false },
    onlyIfHas: false,
  });
  assert.deepEqual(statusChange({ statusId: "prone", rightClick: false, wasActive: true, hasLevels: false }), {
    options: { active: false, overlay: false },
    onlyIfHas: false,
  });
});

test("statusChange keeps the overlay on a right click", () => {
  assert.deepEqual(statusChange({ statusId: "dead", rightClick: true, wasActive: false, hasLevels: false }).options, {
    active: true,
    overlay: true,
  });
});

// Removing a level must never add one: dnd5e's plain toggle would.
test("statusChange steps levels, and a decrease only touches actors that have it", () => {
  assert.deepEqual(statusChange({ statusId: "exhaustion", rightClick: false, wasActive: true, hasLevels: true }), {
    options: { levels: 1 },
    onlyIfHas: false,
  });
  assert.deepEqual(statusChange({ statusId: "exhaustion", rightClick: true, wasActive: true, hasLevels: true }), {
    options: { levels: -1 },
    onlyIfHas: true,
  });
});

test("statusChange leaves concentration to the clicked token", () => {
  assert.equal(statusChange({ statusId: "concentrating", rightClick: false, wasActive: false, hasLevels: false }), null);
});
