/**
 * CSS Tweaks — one setting that switches on a stylesheet of small visual
 * changes (scripts/css-tweaks/css-tweaks.css).
 *
 * The setting puts a class on <body>; every rule in the stylesheet is scoped to
 * that class, so turning the setting off removes all of them at once.
 */

import CONSTANTS from "../shared/constants.js";
import { KEYS } from "./keys.js";

const MODULE = CONSTANTS.MODULE_NAME;
const BODY_CLASS = "dmm-css-tweaks";

function apply(enabled) {
  document.body.classList.toggle(BODY_CLASS, Boolean(enabled));
}

Hooks.once("init", () => {
  game.settings.register(MODULE, KEYS.ENABLED, {
    name: "CSS-TWEAKS.enabled-name",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: apply,
  });
});

Hooks.once("ready", () => apply(game.settings.get(MODULE, KEYS.ENABLED)));
