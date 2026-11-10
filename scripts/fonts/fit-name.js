/**
 * Shrinking a character's name to fit the Tidy sheet header.
 *
 * Tidy clips a long name (no wrap, overflow hidden), and a wide custom font
 * makes that common. CSS cannot size text to its own length, so this measures
 * it. Only characters with a custom font are fitted: NPC and group headers,
 * and names in Tidy's own font, are left as Tidy draws them.
 *
 * The name element is swapped (heading when locked, input when unlocked) and
 * the sheet resizes, so the row around it is watched rather than the name.
 * Measuring forces a layout of the whole sheet, so a name is only measured
 * again when its text or box width changed.
 */

import { fittedFontSize } from "./render.js";
import { hasCharacterFont } from "./apply.js";

const ROW = '[data-tidy-sheet-part="name-header-row"]';
const NAME = '[data-tidy-sheet-part="actor-name"]';

/** Never shrink below this share of Tidy's size; past it the name is unreadable anyway. */
const MIN_SCALE = 0.5;

/** Rows already observed, so a re-render does not stack observers. */
const watched = new WeakSet();

/** Per name element: the text and width last fitted to, and Tidy's own size and line height. */
const fitted = new WeakMap();

function unfit(el) {
  el.style.fontSize = "";
  el.style.lineHeight = "";
  fitted.delete(el);
}

function fit(el, force) {
  const text = el.value ?? el.textContent;
  const width = el.clientWidth;
  let last = fitted.get(el);
  if (!force && last && last.text === text && last.width === width) return;

  // A shrunk name that now fits (shorter text, wider box) may fit bigger:
  // start again from Tidy's size. Otherwise measure at the current size.
  if (last && el.scrollWidth <= width) {
    unfit(el);
    last = undefined;
  }

  const style = getComputedStyle(el);
  const current = parseFloat(style.fontSize);
  const base = last?.base ?? current;
  const lineHeight = last?.lineHeight ?? style.lineHeight;
  const padding = parseFloat(style.paddingInlineStart) + parseFloat(style.paddingInlineEnd);
  const available = width - padding;
  // Text width scales with font size, so its width at Tidy's size follows from this one.
  const needed = ((el.scrollWidth - padding) * base) / (current || base);
  const min = Math.floor(base * MIN_SCALE);
  let size = fittedFontSize({ base, available, needed, min });

  if (size >= base) {
    if (last) unfit(el);
    fitted.set(el, { text, width, base, lineHeight });
    return;
  }

  // Keep the line as tall as before, so the subtitle row below does not jump up.
  el.style.lineHeight = lineHeight;
  el.style.fontSize = `${size}px`;
  // At most 2px of kerning adjustment beyond the linear estimate.
  for (let steps = 0; steps < 2 && el.scrollWidth > el.clientWidth && size > min; steps++) {
    size -= 1;
    el.style.fontSize = `${size}px`;
  }
  fitted.set(el, { text, width, base, lineHeight });
}

function fitRow(row, force = false) {
  const name = row.querySelector(NAME);
  if (!name) return;
  // The font was taken off since this row was first watched.
  if (!hasCharacterFont(row.dataset.dmmActor)) {
    if (fitted.has(name)) unfit(name);
    return;
  }
  fit(name, force);
}

function attach(app, element, force) {
  if (app.document?.type !== "character") return;
  const row = (element ?? app.element)?.querySelector(ROW);
  if (!row) return;
  row.dataset.dmmActor = app.document.id;
  if (!watched.has(row) && !hasCharacterFont(app.document.id)) return;

  fitRow(row, force);
  // A custom font that is still loading measures differently once it lands.
  const fonts = row.ownerDocument.fonts;
  if (fonts?.status === "loading") fonts.ready.then(() => fitRow(row, true));

  if (watched.has(row)) return;
  watched.add(row);
  new ResizeObserver(() => fitRow(row)).observe(row);
  // Lock toggles swap the name element; renames change its text.
  new MutationObserver(() => fitRow(row)).observe(row, { childList: true, subtree: true, characterData: true });
  row.addEventListener("input", () => fitRow(row));
}

/**
 * renderActorSheetV2 hook. Tidy's sheet class names are minified in its
 * build, so the hook for the core class it extends is the stable one.
 *
 * @param {ApplicationV2} app
 * @param {HTMLElement} element
 */
export function onRenderActorSheet(app, element) {
  attach(app, element, false);
}

/**
 * Refit the names on every open character sheet, after the font settings
 * change. Popped-out sheets are in the same instance list.
 */
export function refitNames() {
  for (const app of foundry.applications.instances.values()) {
    if (app.rendered) attach(app, app.element, true);
  }
}
