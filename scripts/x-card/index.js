/**
 * X-Card — the X-Card safety tool (John Stavropoulos), rebuilt from the XCard
 * module by Richard Bellingham.
 *
 * One setting turns on a button in the top-level scene controls. Pressing it
 * shows a full-screen X to everyone at the table, without saying who pressed it.
 * The fonts the X cycles through are picked in the Fonts dialog.
 */

import CONSTANTS from "../shared/constants.js";
import { KEYS } from "./keys.js";
import { listenForCards, pressCard } from "./overlay.js";

const MODULE = CONSTANTS.MODULE_NAME;

function enabled() {
  return game.settings.get(MODULE, KEYS.ENABLED);
}

function onEnabledChange() {
  // Add or remove the button, and the X-Card section of an open Fonts dialog.
  ui.controls?.render({ reset: true });
  foundry.applications.instances.get("dmm-fonts")?.render();
}

Hooks.once("init", () => {
  game.settings.register(MODULE, KEYS.ENABLED, {
    name: "X-CARD.enabled-name",
    hint: "X-CARD.enabled-hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: onEnabledChange,
  });
});

Hooks.once("ready", () => listenForCards());

/**
 * Put the X-Card button at the end of the top-level scene controls. Core's
 * top-level buttons each switch canvas layer, so this one isn't a core
 * control; it's added to the rendered menu with its own click handler.
 * Sidebar Tabs' Scene Controls dialog can still hide or move it.
 */
Hooks.on("renderSceneControls", (app, element) => {
  const menu = element.querySelector("#scene-controls-layers");
  if (!menu) return; // A partial render that left the top row alone.
  const existing = menu.querySelector('[data-control="xCard"]');
  if (!enabled()) {
    existing?.closest("li")?.remove();
    return;
  }
  if (existing) return;

  const button = document.createElement("button");
  button.type = "button";
  // Not a Font Awesome icon: x-card.css paints assets/x-card.svg into it.
  button.className = "control ui-control layer icon x-card-tool-icon";
  button.dataset.control = "xCard";
  button.dataset.tooltip = "";
  button.setAttribute("aria-label", game.i18n.localize("X-CARD.button"));
  button.addEventListener("click", () => pressCard());

  const item = document.createElement("li");
  item.append(button);
  menu.append(item);
});
