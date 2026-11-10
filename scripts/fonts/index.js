/**
 * Fonts — custom font files for character names and the pause caption.
 *
 * Enabled fonts from a Data folder are registered with Foundry, then applied
 * to each character's Tidy sheet header and token nameplate, and to the
 * "Game Paused" caption. Long names shrink to fit the character sheet header.
 */

import { registerFontsSettings } from "./settings.js";
import { applyFonts, onCharacterListChange, onRefreshToken, onSettingChange, registerFontDefinitions } from "./apply.js";
import { onRenderActorSheet } from "./fit-name.js";

Hooks.once("init", registerFontsSettings);
// Setup, not init: the X-Card registers its setting after this feature does.
Hooks.once("setup", registerFontDefinitions);

Hooks.once("ready", () => applyFonts());
Hooks.on("refreshToken", onRefreshToken);
Hooks.on("createActor", onCharacterListChange);
Hooks.on("deleteActor", onCharacterListChange);
Hooks.on("createSetting", onSettingChange);
Hooks.on("updateSetting", onSettingChange);
Hooks.on("renderActorSheetV2", onRenderActorSheet);
