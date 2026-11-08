/**
 * Font helpers — pure functions.
 *
 * Nothing here touches Foundry globals, so it stays unit testable via
 * `node --test`. Callers pass settings in as plain data.
 */

import { basename, extensionOf } from "../shared/files.js";

/** Escape a string for use inside a double-quoted CSS string. */
function escapeCssString(str) {
  return String(str ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\A ");
}

/**
 * Derive a family name from a font filename.
 * "assets/fonts/Beyond-Wonderland.woff2" -> "Beyond Wonderland"
 *
 * Weight-per-file families (Foo-Regular, Foo-Bold) become separate families.
 * That is a known simplification: each file is one pickable font.
 *
 * @param {string} path
 * @returns {string}
 */
export function familyFromFilename(path) {
  const name = basename(path);
  const ext = extensionOf(name);
  const stem = ext ? name.slice(0, -ext.length) : name;
  return stem.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Fonts are on unless the user switched them off, so files added to the
 * folder arrive enabled.
 *
 * @param {string[]} scanned   Paths currently in the folder.
 * @param {string[]} disabled  Paths the user unticked.
 * @returns {string[]}         Enabled paths, in folder order.
 */
export function enabledFonts(scanned, disabled) {
  const off = new Set(Array.isArray(disabled) ? disabled : []);
  return (Array.isArray(scanned) ? scanned : []).filter((path) => !off.has(path));
}

/**
 * Turn enabled font files into Foundry font definitions (the shape used by
 * CONFIG.fontDefinitions). `editor: true` also offers them in text editors.
 *
 * @param {string[]} paths  Data-relative font file paths.
 * @returns {Map<string, object>}  family -> definition; the first file wins a name clash.
 */
export function fontDefinitionsFor(paths) {
  const definitions = new Map();
  for (const path of Array.isArray(paths) ? paths : []) {
    const family = familyFromFilename(path);
    if (!family || definitions.has(family)) continue;
    definitions.set(family, { editor: true, fonts: [{ urls: [path] }] });
  }
  return definitions;
}

/**
 * The font assigned to a character, or "" when none is assigned or the
 * assigned font has since been switched off.
 *
 * @param {Record<string, string>} characters  actorId -> family
 * @param {string} actorId
 * @param {Set<string>} families  Families currently enabled.
 * @returns {string}
 */
export function characterFamily(characters, actorId, families) {
  const family = characters?.[actorId] ?? "";
  return family && families.has(family) ? family : "";
}

/**
 * Each character's effective font: their own pick, else the default font.
 * Picks and a default that have since been switched off are dropped, so a
 * character whose own font is off falls back to the default.
 *
 * @param {object} options
 * @param {Record<string, string>} [options.characters]  actorId -> family
 * @param {string[]} [options.characterIds]  Every character actor, for the default.
 * @param {string} [options.fallback]  The default family; "" for none.
 * @param {Set<string>} options.families  Families currently enabled.
 * @returns {Record<string, string>}  actorId -> family
 */
export function characterFonts({ characters = {}, characterIds = [], fallback = "", families }) {
  const result = {};
  const useFallback = fallback && families.has(fallback);
  for (const actorId of characterIds ?? []) {
    if (useFallback) result[actorId] = fallback;
  }
  for (const [actorId, family] of Object.entries(characters ?? {})) {
    if (families.has(family)) result[actorId] = family;
  }
  return result;
}

/**
 * The font size that fits a line of text into its box.
 * Text width scales roughly with font size, so this is a first guess; the
 * caller measures again and steps down if kerning leaves it a pixel over.
 *
 * @param {object} size
 * @param {number} size.base       The font size the sheet gives the text, in px.
 * @param {number} size.available  Width the text may take, in px.
 * @param {number} size.needed     Width the text takes at `base`, in px.
 * @param {number} size.min        Smallest size allowed, in px.
 * @returns {number}  Whole px, or `base` when the text already fits.
 */
export function fittedFontSize({ base, available, needed, min }) {
  // A box with no width has not been laid out yet; leave the size alone.
  if (!(available > 0) || !(needed > available)) return base;
  return Math.max(min, Math.floor((base * available) / needed));
}

/** Actor ids are alphanumeric; anything else is skipped rather than escaped into a selector. */
const PLAIN_ID = /^[A-Za-z0-9]+$/;

/**
 * CSS that applies the chosen fonts in the game view.
 *
 * Sheet windows get the id "<SheetClass>-Actor-<actorId>" (also for unlinked
 * token actors, whose uuid ends the same way), so an id suffix match finds a
 * character's sheet. The name is styled through Tidy's own data hook, in both
 * the locked heading and the unlocked input. Sheets for items the character
 * owns get "...-Actor-<actorId>-Item-<itemId>", and Tidy uses .document-name
 * only for their header title.
 *
 * The .application prefix lifts the rules over Tidy's own (0,2,1) input
 * styles without needing !important.
 *
 * @param {object} options
 * @param {Record<string, string>} [options.characters]  actorId -> family
 * @param {string} [options.pause]                       Family for the pause caption.
 * @param {Set<string>} options.families                 Families currently enabled.
 * @returns {string}
 */
export function fontRulesCss({ characters = {}, pause = "", families }) {
  const rules = [];

  for (const [actorId, family] of Object.entries(characters ?? {})) {
    if (!PLAIN_ID.test(actorId) || !families.has(family)) continue;
    const font = `font-family: "${escapeCssString(family)}";`;
    const name = `.application[id$="-Actor-${actorId}"] [data-tidy-sheet-part="actor-name"]`;
    rules.push(`${name},\n${name} * { ${font} }`);
    const itemTitle = `.application[id*="-Actor-${actorId}-Item-"] .document-name`;
    rules.push(`${itemTitle},\n${itemTitle} * { ${font} }`);
  }

  if (pause && families.has(pause)) {
    rules.push(`#pause figcaption { font-family: "${escapeCssString(pause)}"; }`);
  }

  return rules.join("\n");
}
