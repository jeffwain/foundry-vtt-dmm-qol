/**
 * Tests for the pure font helpers.
 * Run with: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  addCoreFont,
  changedFontActors,
  coreFontPaths,
  characterFamily,
  characterFonts,
  definitionsToRegister,
  enabledFonts,
  familyFromFilename,
  fittedFontSize,
  fontDefinitionsFor,
  fontRulesCss,
  removeCoreFont,
} from "./render.js";

test("familyFromFilename derives a readable family name", () => {
  assert.equal(familyFromFilename("assets/fonts/Beyond-Wonderland.woff2"), "Beyond Wonderland");
  assert.equal(familyFromFilename("assets/fonts/old_english.ttf"), "old english");
  assert.equal(familyFromFilename("Plain.otf"), "Plain");
  assert.equal(familyFromFilename(""), "");
});

test("fontDefinitionsFor builds a Foundry font definition per file", () => {
  const defs = fontDefinitionsFor(["assets/fonts/Beyond-Wonderland.woff2"]);
  assert.deepEqual(Object.fromEntries(defs), {
    "Beyond Wonderland": { editor: false, fonts: [{ urls: ["assets/fonts/Beyond-Wonderland.woff2"], display: "swap" }] },
  });
});

test("fontDefinitionsFor keeps the first file when two map to one family", () => {
  const defs = fontDefinitionsFor(["a/Foo.woff2", "a/Foo.ttf"]);
  assert.equal(defs.size, 1);
  assert.deepEqual(defs.get("Foo").fonts[0].urls, ["a/Foo.woff2"]);
});

test("fontDefinitionsFor skips blanks and tolerates a missing list", () => {
  assert.equal(fontDefinitionsFor(["", null]).size, 0);
  assert.equal(fontDefinitionsFor(undefined).size, 0);
});

test("characterFamily returns the family only while it is enabled", () => {
  const families = new Set(["Foo"]);
  assert.equal(characterFamily({ abc: "Foo" }, "abc", families), "Foo");
  assert.equal(characterFamily({ abc: "Bar" }, "abc", families), "");
  assert.equal(characterFamily({ abc: "Foo" }, "xyz", families), "");
  assert.equal(characterFamily(undefined, "abc", families), "");
});

test("characterFonts gives the default to characters without their own pick", () => {
  const fonts = characterFonts({
    characters: { abc: "Foo" },
    characterIds: ["abc", "def"],
    fallback: "Bar",
    families: new Set(["Foo", "Bar"]),
  });
  assert.deepEqual(fonts, { abc: "Foo", def: "Bar" });
});

test("characterFonts falls back to the default when a pick is switched off", () => {
  const fonts = characterFonts({
    characters: { abc: "Gone" },
    characterIds: ["abc"],
    fallback: "Bar",
    families: new Set(["Bar"]),
  });
  assert.deepEqual(fonts, { abc: "Bar" });
});

test("characterFonts ignores a default that is empty or switched off", () => {
  const families = new Set(["Foo"]);
  assert.deepEqual(characterFonts({ characters: { abc: "Foo" }, characterIds: ["abc", "def"], families }), { abc: "Foo" });
  assert.deepEqual(characterFonts({ characterIds: ["def"], fallback: "Gone", families }), {});
});

test("fontRulesCss targets the Tidy header name inside that actor's sheet", () => {
  const css = fontRulesCss({ characters: { abc123: "Foo" }, families: new Set(["Foo"]) });
  assert.match(css, /\.application\[id\$="-Actor-abc123"\] \[data-tidy-sheet-part="actor-name"\],/);
  assert.match(css, /\.application\[id\$="-Actor-abc123"\] \[data-tidy-sheet-part="actor-name"\] > a \{ font-family: "Foo"; \}/);
});

test("fontRulesCss targets the title of item sheets the actor owns", () => {
  const css = fontRulesCss({ characters: { abc123: "Foo" }, families: new Set(["Foo"]) });
  assert.match(css, /\.application\[id\*="-Actor-abc123-Item-"\] \.document-name,/);
  assert.match(css, /\.application\[id\*="-Actor-abc123-Item-"\] \.document-name > a \{ font-family: "Foo"; \}/);
});

test("fontRulesCss sets the pause caption font", () => {
  const css = fontRulesCss({ pause: "Foo", families: new Set(["Foo"]) });
  assert.match(css, /#pause figcaption \{ font-family: "Foo"; \}/);
});

test("fontRulesCss drops fonts that are not enabled and ids that are not plain", () => {
  const css = fontRulesCss({
    characters: { abc: "Gone", 'x"]{}': "Foo" },
    pause: "Gone",
    families: new Set(["Foo"]),
  });
  assert.equal(css, "");
});

test("fontRulesCss escapes quotes in family names", () => {
  const css = fontRulesCss({ pause: 'Odd "Name"', families: new Set(['Odd "Name"']) });
  assert.match(css, /font-family: "Odd \\"Name\\"";/);
});

test("enabledFonts turns on every scanned file the user has not switched off", () => {
  const scanned = ["a/One.woff2", "a/Two.ttf", "a/New.otf"];
  assert.deepEqual(enabledFonts(scanned, ["a/Two.ttf", "a/gone.woff"]), ["a/One.woff2", "a/New.otf"]);
});

test("enabledFonts tolerates missing arguments", () => {
  assert.deepEqual(enabledFonts(["a/One.woff2"], undefined), ["a/One.woff2"]);
  assert.deepEqual(enabledFonts(undefined, []), []);
});

test("fittedFontSize leaves a name that already fits alone", () => {
  assert.equal(fittedFontSize({ base: 46, available: 400, needed: 300, min: 23 }), 46);
  assert.equal(fittedFontSize({ base: 46, available: 400, needed: 400, min: 23 }), 46);
});

test("fittedFontSize shrinks in proportion to the overflow", () => {
  // Text 500px wide in a 400px box: 46 * 0.8 = 36.8, rounded down.
  assert.equal(fittedFontSize({ base: 46, available: 400, needed: 500, min: 23 }), 36);
});

test("fittedFontSize stops at the minimum", () => {
  assert.equal(fittedFontSize({ base: 46, available: 100, needed: 1000, min: 23 }), 23);
});

test("fittedFontSize ignores a box with no width yet", () => {
  // A sheet measured before layout reports 0; shrinking to the minimum then would stick.
  assert.equal(fittedFontSize({ base: 46, available: 0, needed: 500, min: 23 }), 46);
});

test("fontRulesCss has no rule that matches any element", () => {
  const css = fontRulesCss({ characters: { abc123: "Foo" }, families: new Set(["Foo"]) });
  // A bare * selector; the * in [id*=…] is an attribute match and fine.
  assert.doesNotMatch(css, /(^|[\s,>])\*(\s|\{|,|$)/m);
});

test("definitionsToRegister keeps only fonts a character, the pause caption or the X-Card uses", () => {
  const defs = fontDefinitionsFor(["a/One.woff2", "a/Two.woff2", "a/Three.woff2", "a/Four.woff2"]);
  const out = definitionsToRegister(defs, { characters: { abc: "One" }, pause: "Two", xCard: ["Three"] });
  assert.deepEqual([...out.keys()], ["One", "Two", "Three"]);
});

test("definitionsToRegister keeps the default character font before any character uses it", () => {
  const defs = fontDefinitionsFor(["a/One.woff2", "a/Two.woff2"]);
  assert.deepEqual([...definitionsToRegister(defs, { characters: {}, fallback: "Two" }).keys()], ["Two"]);
});

test("definitionsToRegister leaves fonts in core's list to core, so each loads once", () => {
  const defs = fontDefinitionsFor(["a/One.woff2", "a/Two.woff2"]);
  const out = definitionsToRegister(defs, { pause: "One", xCard: ["Two"], core: new Set(["Two"]) });
  assert.deepEqual([...out.keys()], ["One"]);
});

test("coreFontPaths lists every file in core's font list", () => {
  const core = {
    One: { editor: true, fonts: [{ urls: ["a/One.woff2"] }, { urls: ["a/One-Bold.woff2"] }] },
    // A system font has no file.
    Arial: { editor: true, fonts: [] },
  };
  assert.deepEqual([...coreFontPaths(core)], ["a/One.woff2", "a/One-Bold.woff2"]);
  assert.equal(coreFontPaths(null).size, 0);
});

test("addCoreFont adds a file the way core's own dialog does", () => {
  const before = { Other: { editor: true, fonts: [{ urls: ["b/Other.ttf"] }] } };
  const after = addCoreFont(before, "One", "a/One.woff2");
  assert.deepEqual(after.One, { editor: true, fonts: [{ urls: ["a/One.woff2"], weight: 400, style: "normal" }] });
  assert.deepEqual(after.Other, before.Other);
  // The setting's own object is not changed.
  assert.equal("One" in before, false);
});

test("addCoreFont joins an existing family and skips a file already listed", () => {
  const before = { One: { editor: true, fonts: [{ urls: ["b/One.ttf"] }] } };
  const after = addCoreFont(before, "One", "a/One.woff2");
  assert.equal(after.One.fonts.length, 2);
  assert.deepEqual(addCoreFont(after, "One", "a/One.woff2"), after);
});

test("removeCoreFont drops only that file, and the family once it has none left", () => {
  const before = {
    One: { editor: true, fonts: [{ urls: ["a/One.woff2"] }, { urls: ["b/One-Bold.ttf"] }] },
    Two: { editor: true, fonts: [{ urls: ["a/Two.woff2"] }] },
  };
  const after = removeCoreFont(removeCoreFont(before, "a/One.woff2"), "a/Two.woff2");
  assert.deepEqual(after, { One: { editor: true, fonts: [{ urls: ["b/One-Bold.ttf"] }] } });
  assert.equal(before.One.fonts.length, 2);
});

test("definitionsToRegister tolerates missing settings", () => {
  const defs = fontDefinitionsFor(["a/One.woff2"]);
  assert.equal(definitionsToRegister(defs, {}).size, 0);
  assert.equal(definitionsToRegister(defs, { characters: null, xCard: null }).size, 0);
});

test("changedFontActors lists actors whose shown font changed", () => {
  const before = { characters: { a: "Foo", b: "Foo", c: "Bar" }, families: new Set(["Foo", "Bar"]) };
  // a unchanged, b reassigned, c's font switched off, d newly assigned.
  const after = { characters: { a: "Foo", b: "Bar", c: "Bar", d: "Foo" }, families: new Set(["Foo"]) };
  assert.deepEqual([...changedFontActors(before, after)].sort(), ["b", "c", "d"]);
});

test("changedFontActors is empty when nothing changed", () => {
  const state = { characters: { a: "Foo" }, families: new Set(["Foo"]) };
  assert.equal(changedFontActors(state, state).size, 0);
});
