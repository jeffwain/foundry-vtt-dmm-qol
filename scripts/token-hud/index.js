/**
 * Token HUD — replaces Illandril's Token HUD Scale for v14.
 *
 * Scales the placeable HUDs partway with zoom and keeps their parts outside the
 * token (scale.js), pins HUD menus inside the visible canvas (palettes.js), and
 * gives the GM a hover HP tab that opens the HUD (hover.js).
 */

import { registerSettings, getHudSettings } from "./settings.js";
import { startScaling, writeHudVars, rerenderOpenHuds } from "./scale.js";
import { startPalettes } from "./palettes.js";
import { startHover } from "./hover.js";

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
});
