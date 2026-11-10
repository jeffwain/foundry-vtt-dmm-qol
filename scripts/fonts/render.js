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
 * CONFIG.fontDefinitions). They stay out of text editors: core's own font
 * list decides what editors offer.
 * `display: "swap"` shows text in a fallback while a late font is still loading.
 *
 * @param {string[]} paths  Data-relative font file paths.
 * @returns {Map<string, object>}  family -> definition; the first file wins a name clash.
 */
export function fontDefinitionsFor(paths) {
  const definitions = new Map();
  for (const path of Array.isArray(paths) ? paths : []) {
    const family = familyFromFilename(path);
    if (!family || definitions.has(family)) continue;
    definitions.set(family, { editor: false, fonts: [{ urls: [path], display: "swap" }] });
  }
  return definitions;
}

/**
 * The definitions to register with Foundry. Every client downloads each one
 * before the canvas draws, so only fonts something uses are registered. A
 * family in core's font list is left out: core loads it already.
 *
 * @param {Map<string, object>} definitions  family -> definition, from fontDefinitionsFor.
 * @param {object} uses
 * @param {Record<string, string>} [uses.characters]  actorId -> family
 * @param {string} [uses.fallback]                   The default character font.
 * @param {string} [uses.pause]                       Family for the pause caption.
 * @param {string[]} [uses.xCard]                     Families the X-Card cycles through.
 * @param {Set<string>} [uses.core]                   Families in core's font list.
 * @returns {Map<string, object>}
 */
export function definitionsToRegister(definitions, { characters, fallback, pause, xCard, core }) {
  const used = new Set([...Object.values(characters ?? {}), fallback, pause, ...(xCard ?? [])]);
  const out = new Map();
  for (const [family, definition] of definitions) {
    if (used.has(family) && !core?.has(family)) out.set(family, definition);
  }
  return out;
}

/*
 * Core's font list is the "core.fonts" world setting: family ->
 * { editor, fonts: [{ urls, weight, style }] }, as Foundry's Font
 * Configuration dialog writes it. These helpers return new objects so the
 * setting's cached value is never changed in place.
 */

/** Every font file in core's font list. */
export function coreFontPaths(core) {
  const paths = new Set();
  for (const definition of Object.values(core ?? {})) {
    for (const font of definition?.fonts ?? []) {
      for (const url of font?.urls ?? []) paths.add(url);
    }
  }
  return paths;
}

/** Add a file to core's font list, under its family, as core's dialog would. */
export function addCoreFont(core, family, path) {
  if (coreFontPaths(core).has(path)) return core;
  const next = { ...core };
  const existing = next[family] ?? { editor: true, fonts: [] };
  next[family] = { ...existing, fonts: [...existing.fonts, { urls: [path], weight: 400, style: "normal" }] };
  return next;
}

/** Take a file out of core's font list, and its family once it has no files left. */
export function removeCoreFont(core, path) {
  const next = {};
  for (const [family, definition] of Object.entries(core ?? {})) {
    const fonts = definition.fonts ?? [];
    const kept = fonts.filter((font) => !font?.urls?.includes(path));
    if (kept.length === fonts.length) next[family] = definition;
    else if (kept.length) next[family] = { ...definition, fonts: kept };
  }
  return next;
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
 * Actors whose shown font differs between two settings snapshots, so only
 * their nameplates need redrawing.
 *
 * @param {{characters: Record<string, string>, families: Set<string>}} before
 * @param {{characters: Record<string, string>, families: Set<string>}} after
 * @returns {Set<string>}  Actor ids.
 */
export function changedFontActors(before, after) {
  const changed = new Set();
  const ids = new Set([...Object.keys(before.characters ?? {}), ...Object.keys(after.characters ?? {})]);
  for (const id of ids) {
    if (characterFamily(before.characters, id, before.families) !== characterFamily(after.characters, id, after.families)) {
      changed.add(id);
    }
  }
  return changed;
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
 * styles without needing !important. When locked, the name text sits in an
 * <a> child, so that child is named directly rather than with a `*` rule
 * that would be tested against every element.
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
    rules.push(`${name},\n${name} > a { ${font} }`);
    const itemTitle = `.application[id*="-Actor-${actorId}-Item-"] .document-name`;
    rules.push(`${itemTitle},\n${itemTitle} > a { ${font} }`);
  }

  if (pause && families.has(pause)) {
    rules.push(`#pause figcaption { font-family: "${escapeCssString(pause)}"; }`);
  }

  return rules.join("\n");
}
