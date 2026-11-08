/**
 * Tests for the pure landing-page helpers.
 * Run with: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import { enabledImages, isRotationBackground, pickBackground } from "./render.js";

test("enabledImages keeps only ticked files that still exist, in folder order", () => {
  const scanned = ["a/1.webp", "a/2.webp", "a/3.webp"];
  const enabled = ["a/3.webp", "a/1.webp", "a/gone.webp"];
  assert.deepEqual(enabledImages(scanned, enabled), ["a/1.webp", "a/3.webp"]);
});

test("enabledImages tolerates missing arguments", () => {
  assert.deepEqual(enabledImages(undefined, undefined), []);
  assert.deepEqual(enabledImages(["a"], null), []);
});

test("pickBackground returns empty string when there is nothing to pick", () => {
  assert.equal(pickBackground([]), "");
  assert.equal(pickBackground(undefined), "");
  assert.equal(pickBackground([null, ""]), "");
});

test("pickBackground uses the injected random source", () => {
  const images = ["a", "b", "c"];
  assert.equal(pickBackground(images, { random: () => 0 }), "a");
  assert.equal(pickBackground(images, { random: () => 0.5 }), "b");
  assert.equal(pickBackground(images, { random: () => 0.99 }), "c");
});

test("pickBackground stays in range when random returns 1", () => {
  assert.equal(pickBackground(["a", "b"], { random: () => 1 }), "b");
});

test("pickBackground avoids repeating the current background", () => {
  // With "a" excluded the pool is ["b"], so any roll must give "b".
  assert.equal(pickBackground(["a", "b"], { random: () => 0, exclude: "a" }), "b");
});

test("pickBackground repeats when it is the only option", () => {
  assert.equal(pickBackground(["a"], { exclude: "a" }), "a");
});

test("isRotationBackground claims ticked images and anything in the folder", () => {
  assert.ok(isRotationBackground("elsewhere/x.webp", "assets/landing", ["elsewhere/x.webp"]));
  assert.ok(isRotationBackground("assets/landing/old.webp", "assets/landing", []));
  assert.ok(isRotationBackground("assets/landing/old.webp", "assets/landing/", []));
});

test("isRotationBackground rejects backgrounds we did not set", () => {
  assert.equal(isRotationBackground("worlds/mine/bg.webp", "assets/landing", ["assets/landing/a.webp"]), false);
  assert.equal(isRotationBackground("assets/landing-other/a.webp", "assets/landing", []), false);
  assert.equal(isRotationBackground("", "assets/landing", []), false);
  assert.equal(isRotationBackground(null, "", null), false);
});
