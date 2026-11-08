/**
 * Tests for the Token HUD math helpers.
 * Run with: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import { hudMetrics, oneByOneRect, clampToArea } from "./math.js";

function approx(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${expected}, got ${actual}`);
}

const base = { stageScale: 1, gridSize: 100, coreUiScale: 1, buttonScale: 1, response: 0.7, floor: 0.7, gapPx: 6 };

test("hudMetrics is identity at 100px grid, zoom 1, scale 1", () => {
  const m = hudMetrics(base);
  approx(m.factor, 1);
  approx(m.gap, 6);
});

test("hudMetrics response 1 keeps a fixed screen size when zoomed out", () => {
  approx(hudMetrics({ ...base, stageScale: 0.5, response: 1, floor: 0.3 }).factor, 2);
});

test("hudMetrics response 0 shrinks with the map down to the floor", () => {
  approx(hudMetrics({ ...base, stageScale: 0.5, response: 0, floor: 0.3 }).factor, 1);
  approx(hudMetrics({ ...base, stageScale: 0.25, response: 0, floor: 0.7 }).factor, 2.8);
});

test("hudMetrics caps at base size when zoomed in", () => {
  approx(hudMetrics({ ...base, stageScale: 2 }).factor, 0.5);
});

test("hudMetrics folds grid size into zoom and applies button scale", () => {
  // A 200px grid at stage 0.5 is the same on-screen square as 100px at 1.
  approx(hudMetrics({ ...base, stageScale: 0.5, gridSize: 200, buttonScale: 1.5 }).factor, 1.5);
});

test("hudMetrics gap is constant on screen", () => {
  approx(hudMetrics({ ...base, stageScale: 0.5 }).gap, 12);
});

test("hudMetrics falls back safely on a zero stage scale", () => {
  assert.deepEqual(hudMetrics({ ...base, stageScale: 0, buttonScale: 1.25 }), { factor: 1.25, gap: 6 });
});

test("oneByOneRect centres one grid square on the token", () => {
  assert.deepEqual(oneByOneRect({ center: { x: 450, y: 350 }, gridSize: 100, uiScale: 1 }), { left: 400, top: 300, width: 100, height: 100 });
  assert.deepEqual(oneByOneRect({ center: { x: 300, y: 300 }, gridSize: 200, uiScale: 2 }), { left: 200, top: 200, width: 100, height: 100 });
});

const area = { left: 60, top: 0, right: 1000, bottom: 800 };

test("clampToArea leaves a rect that fits alone", () => {
  assert.deepEqual(clampToArea({ left: 100, top: 100, right: 300, bottom: 300 }, area, 8), { dx: 0, dy: 0, maxHeight: 784 });
});

test("clampToArea pins to the nearest edge", () => {
  assert.equal(clampToArea({ left: 900, top: 100, right: 1100, bottom: 300 }, area, 8).dx, -108);
  assert.equal(clampToArea({ left: 20, top: 100, right: 220, bottom: 300 }, area, 8).dx, 48);
  assert.equal(clampToArea({ left: 100, top: 700, right: 300, bottom: 900 }, area, 8).dy, -108);
});

test("clampToArea aligns an over-wide rect to the start and treats tall rects as capped", () => {
  assert.equal(clampToArea({ left: 0, top: 0, right: 2000, bottom: 10 }, area, 8).dx, 68);
  // 1000px tall from top 50 is capped to 784, so it must move up to top 8.
  assert.equal(clampToArea({ left: 100, top: 50, right: 300, bottom: 1050 }, area, 8).dy, -42);
});
