/**
 * Tests for the settings menu order.
 * Run with: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import { orderMenus } from "./menu-order.js";

const menu = (key) => [key, { key }];

test("orderMenus puts our listed menus first, in list order, and leaves other modules alone", () => {
  const menus = new Map([
    menu("core.permissions"),
    menu("qol.fonts-menu"),
    menu("qol.landing-menu"),
    menu("other.menu"),
    menu("qol.token-images-menu"),
    menu("qol.player-folders-menu"),
  ]);
  orderMenus(menus, "qol", ["player-folders-menu", "token-images-menu", "fonts-menu", "missing-menu"]);
  const keys = [...menus.keys()];
  assert.deepEqual(
    keys.filter((k) => k.startsWith("qol.")),
    ["qol.player-folders-menu", "qol.token-images-menu", "qol.fonts-menu", "qol.landing-menu"],
  );
  assert.deepEqual(
    keys.filter((k) => !k.startsWith("qol.")),
    ["core.permissions", "other.menu"],
  );
  assert.equal(menus.get("qol.fonts-menu").key, "qol.fonts-menu");
});
