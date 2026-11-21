/**
 * Tests for copying HUD changes to every selected token.
 * Run with: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import { affectedActors, affectedTokens, hasStatusLevel, statusChange, stepStatusLevel } from "./multi-select.js";

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

test("statusChange takes a level off on a Ctrl (Cmd) click", () => {
  assert.deepEqual(statusChange({ statusId: "exhaustion", rightClick: false, reduce: true, wasActive: true, hasLevels: true }), {
    options: { levels: -1 },
    onlyIfHas: true,
  });
});

test("statusChange ignores Ctrl on a status without levels", () => {
  assert.deepEqual(statusChange({ statusId: "prone", rightClick: false, reduce: true, wasActive: false, hasLevels: false }).options, {
    active: true,
    overlay: false,
  });
});

function fakeActor({ statuses = [], contamination } = {}) {
  const calls = [];
  const actor = {
    calls,
    statuses: new Set(statuses),
    toggleStatusEffect: (id, options) => calls.push(["toggle", id, options]),
  };
  if (contamination !== undefined) {
    actor.currentContamination = contamination;
    actor.adjustContamination = (delta) => calls.push(["contamination", delta]);
  }
  return actor;
}

// Drakkenheim's contamination is a number on the actor; dnd5e's level code would add a stray effect.
test("stepStatusLevel changes Drakkenheim contamination through its own method", () => {
  const actor = fakeActor({ contamination: 2 });
  stepStatusLevel(actor, "contamination", -1);
  assert.deepEqual(actor.calls, [["contamination", -1]]);
});

test("stepStatusLevel uses dnd5e levels for other stacked statuses", () => {
  const actor = fakeActor({ statuses: ["exhaustion"], contamination: 0 });
  stepStatusLevel(actor, "exhaustion", 1);
  assert.deepEqual(actor.calls, [["toggle", "exhaustion", { levels: 1 }]]);
});

test("hasStatusLevel reads the contamination count, not the actor's statuses", () => {
  assert.equal(hasStatusLevel(fakeActor({ contamination: 0 }), "contamination"), false);
  assert.equal(hasStatusLevel(fakeActor({ contamination: 3 }), "contamination"), true);
  assert.equal(hasStatusLevel(fakeActor({ statuses: ["exhaustion"] }), "exhaustion"), true);
});
