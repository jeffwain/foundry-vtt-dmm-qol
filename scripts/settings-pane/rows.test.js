/**
 * Tests for the Settings pane row helpers.
 * Run with: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import { paneRows, matchesQuery } from "./rows.js";

const byLabel = (a, b) => a.label.localeCompare(b.label);

const categories = {
  "token-tools": {
    id: "token-tools",
    label: "Token Tools",
    entries: [
      { menu: false, label: "Speed" },
      { menu: true, key: "token-tools.art", label: "TOKEN.art-menu", icon: "fa-solid fa-image" },
      { menu: false, label: "Easing" },
    ],
  },
  core: { id: "core", label: "Core", entries: [{ menu: false, label: "Language" }] },
};

test("paneRows sorts categories with the modal's comparator", () => {
  assert.deepEqual(
    paneRows(categories, byLabel).map((row) => row.id),
    ["core", "token-tools"],
  );
});

test("paneRows counts settings apart from menus and localizes menu names", () => {
  const row = paneRows(categories, byLabel, (text) => `L(${text})`).find((r) => r.id === "token-tools");
  assert.equal(row.settingCount, 2);
  assert.deepEqual(row.menus, [{ key: "token-tools.art", label: "L(TOKEN.art-menu)", icon: "fa-solid fa-image" }]);
});

test("paneRows tolerates missing data", () => {
  assert.deepEqual(paneRows(undefined, byLabel), []);
  assert.deepEqual(paneRows({ x: { id: "x", label: "X" } }, byLabel), [{ id: "x", label: "X", settingCount: 0, menus: [] }]);
});

test("matchesQuery matches the category or a menu name, ignoring case", () => {
  const row = { label: "Token Tools", menus: [{ label: "Configure Art" }] };
  assert.equal(matchesQuery(row, "token"), true);
  assert.equal(matchesQuery(row, "  ART "), true);
  assert.equal(matchesQuery(row, "lighting"), false);
  assert.equal(matchesQuery(row, ""), true);
});
