/**
 * Token Images — alternate token art search via the Token HUD.
 * Self-registers its settings and HUD hook on import.
 */

import { registerTokenImageSettings, migrateOldSearchPaths } from "./settings.js";
import { onRenderTokenHUD } from "./hud.js";

Hooks.once("init", () => registerTokenImageSettings());
Hooks.once("ready", () => {
  if (game.user.isGM) migrateOldSearchPaths();
});
Hooks.on("renderTokenHUD", onRenderTokenHUD);
