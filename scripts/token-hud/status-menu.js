/**
 * Token HUD status menu additions.
 *
 * - A Clear button that removes every status in the menu except stacked ones
 *   (exhaustion, Drakkenheim's contamination, anything dnd5e gives levels),
 *   concentration (removing it ends the spell), and the ones dnd5e manages
 *   itself. With multi-select on, it clears every selected token.
 * - Ctrl (Cmd) click on a stacked status takes a level off instead of adding
 *   one. multi-select.js does the same for the other selected tokens.
 * - A help icon left of the filter box and Clear button whose tooltip lists
 *   the click modifiers.
 *
 * Bases (Bugbear's Status Sorter) puts a filter box at the top of the menu; the
 * help icon sits to its left and the button to its right. Without Bases, both
 * go in a row of our own at the top. Bases and Monk's Little Details each have their own
 * clear button that removes stacked statuses too; when one is shown, it runs
 * this clear instead, so there's only one.
 */

import {
  affectedActors,
  controlledTokens,
  hudToken,
  multiSelectOn,
  hasStatusLevel,
  reportFailures,
  statusHasLevels,
  stepStatusLevel,
} from "./multi-select.js";

/** Kept on clear: concentration ends spells, and dnd5e recreates bloodied and falling by itself. */
const KEPT_STATUSES = new Set(["concentrating", "bloodied", "falling"]);
const BUTTON_CLASS = "dmm-hud-clear-statuses";
const HELP_CLASS = "dmm-hud-status-help";
const TOOLBAR_CLASS = "dmm-hud-status-toolbar";
const OTHER_CLEAR_BUTTONS = ".clear-all, .bases-filter-clearall";
const BASES_FILTER = ":scope > fieldset.bases-filter";

/**
 * The effects to delete from one actor.
 * @param {{id: string, statuses: Set<string>}[]} effects The actor's own effects.
 * @param {Set<string>} shown Status IDs the HUD menu lists.
 * @param {(statusId: string) => boolean} keep Whether a status survives a clear.
 * @returns {string[]} Effect IDs. An effect with any kept status is left whole.
 */
export function clearableEffectIds(effects, shown, keep) {
  const ids = [];
  for (const effect of effects) {
    const statuses = [...(effect.statuses ?? [])];
    if (!statuses.some((id) => shown.has(id))) continue;
    if (statuses.some(keep)) continue;
    ids.push(effect.id);
  }
  return ids;
}

function keepOnClear(statusId) {
  return KEPT_STATUSES.has(statusId) || statusHasLevels(statusId);
}

/** The HUD token's actor, plus the other selected actors when multi-select is on. */
function targetActors(hud) {
  const token = hudToken(hud);
  if (!token?.actor) return [];
  const actors = [token.actor];
  if (multiSelectOn()) actors.push(...affectedActors(controlledTokens(), token).others);
  return actors;
}

async function clearStatuses(hud, palette) {
  const shown = new Set([...palette.querySelectorAll("[data-status-id]")].map((el) => el.dataset.statusId));
  const deletions = targetActors(hud).map((actor) => {
    const ids = clearableEffectIds(actor.effects, shown, keepOnClear);
    return ids.length ? actor.deleteEmbeddedDocuments("ActiveEffect", ids) : null;
  }).filter(Boolean);
  reportFailures(await Promise.allSettled(deletions));
}

/**
 * Ctrl (Cmd) click on a stacked status: take a level off the clicked token
 * and stop the HUD (or Drakkenheim's contamination listener) from adding one.
 * multi-select.js handles the others.
 * @returns {boolean} Whether the click was handled.
 */
function reduceLevel(hud, event) {
  if (!(event.ctrlKey || event.metaKey)) return false;
  const button = event.target.closest("[data-action='effect'][data-status-id]");
  const statusId = button?.dataset.statusId;
  if (!statusId || !statusHasLevels(statusId)) return false;
  event.preventDefault();
  event.stopPropagation();
  const actor = hudToken(hud)?.actor;
  // dnd5e adds the status when there's no level to remove, so skip actors without it.
  if (hasStatusLevel(actor, statusId)) {
    Promise.resolve(stepStatusLevel(actor, statusId, -1)).catch((err) =>
      console.error("dmm-quality-of-life | reducing a status level failed", err));
  }
  return true;
}

function onPaletteClick(hud, event) {
  if (event.button !== 0) return;
  const palette = event.currentTarget;
  if (reduceLevel(hud, event)) return;
  const button = event.target.closest(`.${BUTTON_CLASS}, ${OTHER_CLEAR_BUTTONS}`);
  if (!button || !palette.contains(button)) return;
  // Capture on the palette runs before Bases' or MLD's own handler on their button; stop it there.
  event.preventDefault();
  event.stopPropagation();
  clearStatuses(hud, palette);
}

function makeClearButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = BUTTON_CLASS;
  button.dataset.tooltipText = game.i18n.localize("TOKEN-HUD.clear-statuses-tooltip");
  const icon = document.createElement("i");
  icon.className = "fa-solid fa-eraser";
  icon.setAttribute("inert", "");
  button.append(icon, ` ${game.i18n.localize("TOKEN-HUD.clear-statuses")}`);
  return button;
}

function makeHelpIcon() {
  const help = document.createElement("span");
  help.className = HELP_CLASS;
  help.tabIndex = 0;
  const text = game.i18n.localize("TOKEN-HUD.status-hint");
  help.dataset.tooltipText = text;
  help.setAttribute("aria-label", text);
  const icon = document.createElement("i");
  icon.className = "fa-solid fa-circle-question";
  icon.setAttribute("inert", "");
  help.append(icon);
  return help;
}

/**
 * The row the help icon and Clear button go in: Bases' filter row when it's
 * there, otherwise our own row at the top of the menu.
 */
function toolbarFor(palette) {
  const filter = palette.querySelector(BASES_FILTER);
  const own = palette.querySelector(`:scope > .${TOOLBAR_CLASS}`);
  if (filter) {
    own?.remove();
    return filter;
  }
  if (own) {
    if (palette.firstElementChild !== own) palette.prepend(own);
    return own;
  }
  const row = document.createElement("div");
  row.className = TOOLBAR_CLASS;
  palette.prepend(row);
  return row;
}

/** Help icon first in the row; Clear last, unless Bases or MLD show their own clear button. */
function placeToolbar(palette) {
  const row = toolbarFor(palette);
  const help = palette.querySelector(`.${HELP_CLASS}`) ?? makeHelpIcon();
  if (row.firstElementChild !== help) row.prepend(help);
  let button = palette.querySelector(`.${BUTTON_CLASS}`);
  if (palette.querySelector(OTHER_CLEAR_BUTTONS)) {
    button?.remove();
    return;
  }
  button ??= makeClearButton();
  if (row.lastElementChild !== button) row.append(button);
}

function onRenderTokenHUD(hud, html) {
  const palette = html.querySelector(".palette[data-palette='effects']");
  if (!palette) return;
  if (!palette.dataset.dmmStatusMenu) {
    palette.dataset.dmmStatusMenu = "true";
    palette.addEventListener("click", (event) => onPaletteClick(hud, event), { capture: true });
  }
  // Bases and MLD build their parts in their own renderTokenHUD hooks, which may run after this one.
  queueMicrotask(() => {
    if (!palette.isConnected) return;
    placeToolbar(palette);
  });
}

export function startStatusMenu() {
  Hooks.on("renderTokenHUD", onRenderTokenHUD);
}
