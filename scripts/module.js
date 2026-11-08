/**
 * DMM Quality of Life — bootstrap.
 *
 * This package bundles several independent Foundry "modules" (features), each
 * self-contained under scripts/<module>/. Each module entrypoint registers its
 * own hooks on import, so this file just pulls them in.
 */

import CONSTANTS from "./shared/constants.js";
import { orderMenus } from "./shared/menu-order.js";

import "./token-images/index.js";
import "./player-folders/index.js";
import "./sidebar-tabs/index.js";
import "./settings-pane/index.js";
import "./landing/index.js";
import "./fonts/index.js";
import "./activity-defaults/index.js";
import "./group-rolls/index.js";
import "./css-tweaks/index.js";
import "./token-hud/index.js";
import "./placeables-tab/index.js";
// Last, so its setting sits at the bottom of the Configure Settings list.
import "./x-card/index.js";

// Configure Settings menu order. Runs after every feature's init above has
// registered its menu; anything unlisted (Landing Page) follows these.
Hooks.once("init", () => {
  orderMenus(game.settings.menus, CONSTANTS.MODULE_NAME, [
    "player-folders-menu",
    "token-images-menu",
    "scene-controls-menu",
    "sidebar-tabs-menu",
    "sidebar-tweaks-menu",
    "token-hud-menu",
    "fonts-menu",
  ]);
});
