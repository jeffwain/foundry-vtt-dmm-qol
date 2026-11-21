/**
 * Token HUD — replaces Illandril's Token HUD Scale for v14.
 *
 * Scales the placeable HUDs partway with zoom and keeps their parts outside the
 * token (scale.js), pins HUD menus inside the visible canvas (palettes.js),
 * gives the GM a hover HP tab that opens the HUD (hover.js), copies status
 * and movement changes to every selected token (multi-select.js), and adds a
 * Clear button, a reduce-level shortcut and a hint to the status menu
 * (status-menu.js).
 */

import { registerSettings, getHudSettings } from "./settings.js";
import { startScaling, writeHudVars, rerenderOpenHuds } from "./scale.js";
import { startPalettes } from "./palettes.js";
import { startHover } from "./hover.js";
import { startMultiSelect } from "./multi-select.js";
import { startStatusMenu } from "./status-menu.js";

let conflictWarned = false;

/**
 * Another module that rescales the HUD. Both patching it would double the
 * scale, so ours stands aside while one is on.
 * @returns {string|null} The localization key for the conflict warning, or null.
 */
export function scalingConflict() {
  if (game.modules.get("illandril-token-hud-scale")?.active) {
    return "TOKEN-HUD.conflict-illandril";
  }
  const key = "custom-dnd5e.token-hud-improvements";
  if (game.settings.settings.has(key) && game.settings.get("custom-dnd5e", "token-hud-improvements")) {
    return "TOKEN-HUD.conflict-custom-dnd5e";
  }
  return null;
}

/**
 * Custom D&D 5e's "Toggle Status Effects on Selected" copies statuses too.
 * With both on, exhaustion would go up twice per click and both would race to
 * create the same effect, so ours stands aside. Its setting reloads on change.
 */
function multiSelectConflict() {
  const key = "custom-dnd5e.toggle-status-effect-on-selected-tokens";
  return game.settings.settings.has(key) && game.settings.get("custom-dnd5e", "toggle-status-effect-on-selected-tokens");
}

function refreshAll() {
  writeHudVars();
  rerenderOpenHuds();
}

Hooks.once("init", () => registerSettings(refreshAll));

Hooks.once("ready", () => {
  if (!getHudSettings().enabled) return;

  const conflictKey = scalingConflict();
  if (conflictKey) {
    if (game.user.isGM && !conflictWarned) {
      conflictWarned = true;
      ui.notifications.warn(game.i18n.localize(conflictKey));
    }
  } else {
    startScaling();
  }
  startPalettes();
  startHover();
  if (!multiSelectConflict()) {
    startMultiSelect(() => getHudSettings().multiSelect);
  } else if (game.user.isGM && getHudSettings().multiSelect) {
    ui.notifications.warn(game.i18n.localize("TOKEN-HUD.conflict-custom-dnd5e-multi-select"));
  }
  startStatusMenu();
});
