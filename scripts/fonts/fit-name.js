/**
 * Shrinking a character's name to fit the Tidy sheet header.
 *
 * Tidy clips a long name (no wrap, overflow hidden), and a wide custom font
 * makes that common. CSS cannot size text to its own length, so this measures
 * it. Character sheets only: NPC and group headers are left as Tidy draws them.
 *
 * The name element is swapped (heading when locked, input when unlocked) and
 * the sheet resizes, so the row around it is watched rather than the name.
 */

import { fittedFontSize } from "./render.js";

const ROW = '[data-tidy-sheet-part="name-header-row"]';
const NAME = '[data-tidy-sheet-part="actor-name"]';

/** Never shrink below this share of Tidy's size; past it the name is unreadable anyway. */
const MIN_SCALE = 0.5;

/** Rows already observed, so a re-render does not stack observers. */
const watched = new WeakSet();

function textWidths(el) {
  const style = getComputedStyle(el);
  const padding = parseFloat(style.paddingInlineStart) + parseFloat(style.paddingInlineEnd);
  return { available: el.clientWidth - padding, needed: el.scrollWidth - padding };
}

function fit(el) {
  el.style.fontSize = "";
  el.style.lineHeight = "";
  if (el.scrollWidth <= el.clientWidth) return;

  const style = getComputedStyle(el);
  const base = parseFloat(style.fontSize);
  const min = Math.floor(base * MIN_SCALE);
  let size = fittedFontSize({ base, ...textWidths(el), min });

  // Keep the line as tall as before, so the subtitle row below does not jump up.
  el.style.lineHeight = style.lineHeight;
  el.style.fontSize = `${size}px`;
  // At most 2px of kerning adjustment beyond the linear estimate.
  for (let steps = 0; steps < 2 && el.scrollWidth > el.clientWidth && size > min; steps++) {
    size -= 1;
    el.style.fontSize = `${size}px`;
  }
}

function fitRow(row) {
  const name = row.querySelector(NAME);
  if (name) fit(name);
}

/**
 * renderActorSheetV2 hook. Tidy's sheet class names are minified in its
 * build, so the hook for the core class it extends is the stable one.
 *
 * @param {ApplicationV2} app
 * @param {HTMLElement} element
 */
export function onRenderActorSheet(app, element) {
  if (app.document?.type !== "character") return;
  const row = (element ?? app.element)?.querySelector(ROW);
  if (!row) return;

  fitRow(row);
  // A custom font may still be loading, and measures differently once it lands.
  row.ownerDocument.fonts?.ready.then(() => fitRow(row));

  if (watched.has(row)) return;
  watched.add(row);
  row.dataset.dmmFitName = "";
  new ResizeObserver(() => fitRow(row)).observe(row);
  // Lock toggles swap the name element; renames change its text.
  new MutationObserver(() => fitRow(row)).observe(row, { childList: true, subtree: true, characterData: true });
  row.addEventListener("input", () => fitRow(row));
}

/**
 * Refit every watched name, after the font settings change.
 * @param {Document[]} docs  The main page and any popped-out windows.
 */
export function refitNames(docs) {
  for (const doc of docs) {
    for (const row of doc.querySelectorAll(`${ROW}[data-dmm-fit-name]`)) fitRow(row);
  }
}
