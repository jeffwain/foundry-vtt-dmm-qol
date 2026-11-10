/**
 * Applying the chosen fonts in the game view.
 *
 * Fonts in use go into CONFIG.fontDefinitions at setup, so Foundry loads them
 * before the canvas draws (and into every popped-out window it opens). Every
 * client waits for each one, so unused fonts stay out, and so do fonts in
 * core's own font list, which core loads itself. The sheet-header and
 * pause-caption fonts are CSS in one <style> element, kept in sync across
 * the main page and any popped-out windows. Token nameplates are canvas
 * text, so they get their font from a refreshToken hook instead.
 */

import CONSTANTS from "../shared/constants.js";
import { KEYS } from "./keys.js";
import { refitNames } from "./fit-name.js";
import { changedFontActors, characterFamily, characterFonts, definitionsToRegister, fontDefinitionsFor, fontRulesCss } from "./render.js";
import { KEYS as X_CARD_KEYS } from "../x-card/keys.js";

const MODULE = CONSTANTS.MODULE_NAME;
const STYLE_ID = "dmm-fonts-rules";

/** Families this module put into CONFIG.fontDefinitions, so it can take them out again. */
const added = new Set();

/** Settings snapshot used on every nameplate refresh, rebuilt when settings change. */
let state = { characters: {}, families: new Set(), register: new Map() };

/** Families in core's font list (Configure Settings > Font Configuration). */
export function coreFamilies() {
  return new Set(Object.keys(game.settings.get("core", "fonts") ?? {}));
}

function readState() {
  const get = (key) => game.settings.get(MODULE, key);
  const definitions = fontDefinitionsFor(get(KEYS.ENABLED));
  const families = new Set(definitions.keys());
  const fallback = get(KEYS.CHARACTER_DEFAULT) ?? "";
  // Resolved here so the sheet rules and nameplates both see the default font.
  const characters = characterFonts({
    characters: get(KEYS.CHARACTERS) ?? {},
    // game.actors does not exist yet at init; the ready read fills these in.
    characterIds: game.actors?.filter((actor) => actor.type === "character").map((actor) => actor.id) ?? [],
    fallback,
    families,
  });
  const pause = get(KEYS.PAUSE) ?? "";
  // X-Card fonts are only needed while its button is on.
  const xCard = get(X_CARD_KEYS.ENABLED) ? (get(KEYS.X_CARD) ?? []) : [];
  state = {
    families,
    // The default is passed on its own: at setup no character has it yet.
    register: definitionsToRegister(definitions, { characters, fallback, pause, xCard, core: coreFamilies() }),
    characters,
    pause,
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
 * Sync CONFIG.fontDefinitions with the fonts to register.
 * A family core already defines is left alone, so a stray "Signika.woff2"
 * cannot replace Foundry's own Signika.
 *
 * @returns {Array<[string, object]>}  Definitions added by this call.
 */
function syncDefinitions() {
  const fresh = [];
  for (const family of added) {
    if (state.register.has(family)) continue;
    delete CONFIG.fontDefinitions[family];
    added.delete(family);
  }
  for (const [family, definition] of state.register) {
    if (family in CONFIG.fontDefinitions) continue;
    CONFIG.fontDefinitions[family] = definition;
    added.add(family);
    fresh.push([family, definition]);
  }
  return fresh;
}

/**
 * Register the fonts in use. Called at setup, once every feature's settings
 * exist (the X-Card registers last); Foundry loads them itself before the canvas.
 */
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

/** Whether a character has an enabled font assigned. */
export function hasCharacterFont(actorId) {
  return Boolean(characterFamily(state.characters, actorId, state.families));
}

/**
 * Redraw the nameplates of tokens whose actor passes `test`. Each redraw
 * rebuilds the text texture, so tokens without a custom font are skipped.
 */
function refreshNameplates(test) {
  for (const token of canvas?.tokens?.placeables ?? []) {
    if (test(token.actor?.id)) token.renderFlags.set({ refreshNameplate: true });
  }
}

/**
 * A font that missed core's 4.5 s wait at load arrives later; redraw the
 * nameplates that use it. Font Face family names can come back quoted.
 */
function onFontsLoaded(event) {
  const loaded = new Set(event.fontfaces.map((face) => face.family.replace(/^["']|["']$/g, "")));
  refreshNameplates((id) => loaded.has(characterFamily(state.characters, id, state.families)));
}

/**
 * Once the world is ready. The canvas first drew with the fonts registered at
 * setup, so only the style rules are new here.
 */
export function applyFonts() {
  readState();
  applyRules();
  document.fonts?.addEventListener("loadingdone", onFontsLoaded);
}

/**
 * Settings changed (on any client): pick up new fonts without a reload, then
 * re-apply rules and nameplates.
 */
async function refresh() {
  const before = state;
  readState();
  const fresh = syncDefinitions();
  const { FontConfig } = foundry.applications.settings.menus;
  await Promise.all(
    hostDocuments().flatMap((doc) => fresh.map(([family, def]) => FontConfig.loadFont(family, def, { document: doc }))),
  );
  applyRules();
  // A new font changes how wide each name is.
  refitNames();
  const changed = changedFontActors(before, state);
  if (changed.size) refreshNameplates((id) => changed.has(id));
}

/** Saving the dialog writes several settings in a row; refresh once. */
export const scheduleRefresh = foundry.utils.debounce(() => {
  refresh().catch((err) => console.error("dmm-quality-of-life | fonts: refresh failed", err));
}, 100);

/**
 * createSetting / updateSetting hook. A font joining or leaving core's list
 * changes which fonts this module registers itself.
 */
export function onSettingChange(setting) {
  if (setting.key === "core.fonts") scheduleRefresh();
}

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
