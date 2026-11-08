/**
 * Group Rolls — extras for dnd5e's group roll request card (the "Party
 * Members" card a group sheet posts for a skill check or saving throw).
 *
 * Adds "NPC" and "All" buttons under the list, and a right-click menu on each
 * row to reset, reroll with advantage or disadvantage, or remove that entry.
 */

import CONSTANTS from "../shared/constants.js";
import { KEYS } from "./keys.js";
import { enhanceRequestCard } from "./card.js";

const MODULE = CONSTANTS.MODULE_NAME;

/** Redraw request cards already in the log so the change shows without a reload. */
function rerenderRequestCards() {
  for (const message of game.messages) {
    if (message.type === "request") ui.chat?.updateMessage(message);
  }
}

Hooks.once("init", () => {
  game.settings.register(MODULE, KEYS.ENABLED, {
    name: "GROUP-ROLLS.enabled-name",
    hint: "GROUP-ROLLS.enabled-hint",
    scope: "world",
    // Shown in the Sidebar Tweaks menu (sidebar-tabs/tweaks.js).
    config: false,
    type: Boolean,
    default: true,
    onChange: rerenderRequestCards,
  });
});

Hooks.on("dnd5e.renderChatMessage", (message, html) => {
  if (!game.settings.get(MODULE, KEYS.ENABLED)) return;
  enhanceRequestCard(message, html);
});

// dnd5e redraws a request card only when a result is first linked, so the
// card's total would go stale when a roll is upgraded to advantage in place.
Hooks.on("updateChatMessage", (message, changes) => {
  if (!("rolls" in changes) || !game.settings.get(MODULE, KEYS.ENABLED)) return;
  const requestId = message.getFlag("dnd5e", "requestResult")?.requestId;
  const request = requestId && game.messages.get(requestId);
  if (request) ui.chat?.updateMessage(request);
});
