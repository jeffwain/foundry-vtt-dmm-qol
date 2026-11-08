/**
 * Applying the chosen fonts in the game view.
 *
 * Enabled fonts go into CONFIG.fontDefinitions at init, so Foundry loads them
 * before the canvas draws (and into every popped-out window it opens). The
 * sheet-header and pause-caption fonts are CSS in one <style> element, kept in
 * sync across the main page and any popped-out windows. Token nameplates are
 * canvas text, so they get their font from a refreshToken hook instead.
 */

import CONSTANTS from "../shared/constants.js";
import { KEYS } from "./keys.js";
import { refitNames } from "./fit-name.js";
import { characterFamily, characterFonts, fontDefinitionsFor, fontRulesCss } from "./render.js";

const MODULE = CONSTANTS.MODULE_NAME;
const STYLE_ID = "dmm-fonts-rules";

/** Families this module put into CONFIG.fontDefinitions, so it can take them out again. */
const added = new Set();

/** Settings snapshot used on every nameplate refresh, rebuilt when settings change. */
let state = { characters: {}, families: new Set() };

function readState() {
  const definitions = fontDefinitionsFor(game.settings.get(MODULE, KEYS.ENABLED));
  const families = new Set(definitions.keys());
  state = {
    definitions,
    families,
    // Resolved here so the sheet rules and nameplates both see the default font.
    characters: characterFonts({
      characters: game.settings.get(MODULE, KEYS.CHARACTERS) ?? {},
      // game.actors does not exist yet at init; the ready read fills these in.
      characterIds: game.actors?.filter((actor) => actor.type === "character").map((actor) => actor.id) ?? [],
      fallback: game.settings.get(MODULE, KEYS.CHARACTER_DEFAULT) ?? "",
      families,
    }),
    pause: game.settings.get(MODULE, KEYS.PAUSE) ?? "",
  };
}

/** Documents of the main page and every open popped-out window. */
function hostDocuments() {
  const docs = [document];
  for (const { window: win } of foundry.applications.detached?.windows?.values() ?? []) {
    if (win && !win.closed) docs.push(win.document);
  }
  return docs;
}

/**
 * Sync CONFIG.fontDefinitions with the enabled list.
 * A family core already defines is left alone, so a stray "Signika.woff2"
 * cannot replace Foundry's own Signika.
 *
 * @returns {Array<[string, object]>}  Definitions added by this call.
 */
function syncDefinitions() {
  const fresh = [];
  for (const family of added) {
    if (state.families.has(family)) continue;
    delete CONFIG.fontDefinitions[family];
    added.delete(family);
  }
  for (const [family, definition] of state.definitions) {
    if (family in CONFIG.fontDefinitions) continue;
    CONFIG.fontDefinitions[family] = definition;
    added.add(family);
    fresh.push([family, definition]);
  }
  return fresh;
}

/** Register enabled fonts. Called at init; Foundry loads them itself before the canvas. */
export function registerFontDefinitions() {
  readState();
  syncDefinitions();
}

function applyRules() {
  const css = fontRulesCss(state);
  for (const doc of hostDocuments()) {
    let el = doc.getElementById(STYLE_ID);
    if (!el) {
      el = doc.createElement("style");
      el.id = STYLE_ID;
      doc.head.append(el);
    }
    el.textContent = css;
  }
}

function refreshNameplates() {
  for (const token of canvas?.tokens?.placeables ?? []) {
    token.renderFlags.set({ refreshNameplate: true });
  }
}

/** First paint, once the world is ready. */
export function applyFonts() {
  readState();
  applyRules();
  refreshNameplates();
}

/**
 * Settings changed (on any client): pick up new fonts without a reload, then
 * re-apply rules and nameplates.
 */
async function refresh() {
  readState();
  const fresh = syncDefinitions();
  const { FontConfig } = foundry.applications.settings.menus;
  await Promise.all(
    hostDocuments().flatMap((doc) => fresh.map(([family, def]) => FontConfig.loadFont(family, def, { document: doc }))),
  );
  applyRules();
  // A new font changes how wide each name is.
  refitNames(hostDocuments());
  refreshNameplates();
}

/** Saving the dialog writes several settings in a row; refresh once. */
export const scheduleRefresh = foundry.utils.debounce(() => {
  refresh().catch((err) => console.error("dmm-quality-of-life | fonts: refresh failed", err));
}, 100);

/**
 * createActor / deleteActor hook. The default font's rules list every
 * character by id, so a new one needs them rebuilt.
 */
export function onCharacterListChange(actor) {
  if (actor.type === "character" && game.settings.get(MODULE, KEYS.CHARACTER_DEFAULT)) scheduleRefresh();
}

/**
 * refreshToken hook. Core rebuilds the nameplate style on each nameplate
 * refresh, so the font is set again every time.
 */
export function onRefreshToken(token, flags) {
  if (!flags.refreshNameplate || !token.nameplate) return;
  const family = characterFamily(state.characters, token.actor?.id, state.families);
  if (family) token.nameplate.style.fontFamily = family;
}
