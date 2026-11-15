/**
 * Tests for picking the HP bar among Bar Brawl bars.
 * Run with: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import { pickHpBarId } from "./hp-bar.js";

const HP = "attributes.hp";

test("pickHpBarId finds HP on a bar that isn't bar1", () => {
  const bars = [
    { id: "bar1", attribute: "attributes.ac" },
    { id: "barX9kQ", attribute: HP },
  ];
  assert.equal(pickHpBarId(bars, HP), "barX9kQ");
});

test("pickHpBarId prefers an HP bar that has a HUD input", () => {
  const bars = [
    { id: "bar2", attribute: HP, hideHud: true },
    { id: "bar3", attribute: HP },
  ];
  assert.equal(pickHpBarId(bars, HP), "bar3");
});

test("pickHpBarId falls back to bar1 with no HP bar or no system attribute", () => {
  const bars = [{ id: "bar2", attribute: "resources.primary" }];
  assert.equal(pickHpBarId(bars, HP), "bar1");
  assert.equal(pickHpBarId([{ id: "bar4", attribute: HP }], undefined), "bar1");
});
