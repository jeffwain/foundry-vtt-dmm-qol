/**
 * HUD changes for every selected token.
 *
 * With several tokens selected, a status or movement action picked in the
 * Token HUD is copied to the other selected tokens. A count on the status and
 * movement buttons shows how many will change.
 *
 * Core (or dnd5e) still handles the clicked token as usual. A capture listener
 * on the palette reads the click before the HUD acts on it, then applies the
 * matching change to the others. Nothing is inferred from later effect or
 * token updates, which is what made Multi Token Status copy stray effects.
 */

/** Whether the setting is on. Passed in so this file loads in tests without Foundry. */
let isOn = () => false;

/** dnd5e's concentration status ends spells, so only the clicked token gets it. */
const SKIPPED_STATUSES = new Set(["concentrating"]);
const BADGE_CLASS = "dmm-hud-multi-count";

/**
 * The other selected tokens' actors, and how many actors the click changes.
 * @param {{id: string, actor: object|null}[]} controlled Controlled tokens.
 * @param {{id: string, actor: object|null}} hudToken The token the HUD is open on.
 * @returns {{others: object[], count: number}} Each actor once, the HUD token's excluded.
 */
export function affectedActors(controlled, hudToken) {
  if (!hudToken?.actor || !controlled.some((t) => t.id === hudToken.id)) return { others: [], count: 0 };
  const actors = new Set([hudToken.actor]);
  const others = [];
  for (const token of controlled) {
    if (!token.actor || actors.has(token.actor)) continue;
    actors.add(token.actor);
    others.push(token.actor);
  }
  return { others, count: actors.size };
}

/**
 * The other selected tokens, and how many tokens a movement pick changes.
 * @param {{id: string}[]} controlled Controlled tokens.
 * @param {{id: string}} hudToken The token the HUD is open on.
 * @returns {{others: object[], count: number}}
 */
export function affectedTokens(controlled, hudToken) {
  if (!hudToken || !controlled.some((t) => t.id === hudToken.id)) return { others: [], count: 0 };
  return { others: controlled.filter((t) => t.id !== hudToken.id), count: controlled.length };
}

/**
 * What to do to the other actors for one status click.
 * @param {{statusId: string, rightClick: boolean, wasActive: boolean, hasLevels: boolean}} click
 *   wasActive is the clicked token's state before the HUD acted.
 * @returns {{options: object, onlyIfHas: boolean}|null} toggleStatusEffect options, or null to skip.
 */
export function statusChange({ statusId, rightClick, wasActive, hasLevels }) {
  if (!statusId || SKIPPED_STATUSES.has(statusId)) return null;
  // dnd5e falls back to a plain toggle when there is no level to remove, which
  // would add the status, so a decrease only touches actors that have it.
  if (hasLevels) return { options: { levels: rightClick ? -1 : 1 }, onlyIfHas: rightClick };
  // Set each actor to the clicked token's new state rather than flipping each one.
  return { options: { active: !wasActive, overlay: rightClick }, onlyIfHas: false };
}

/** dnd5e marks statuses with levels (exhaustion) in its condition config. */
function statusHasLevels(statusId) {
  return Number.isFinite(CONFIG.DND5E?.conditionTypes?.[statusId]?.levels);
}

function hudToken(hud) {
  return hud.object ?? null;
}

function controlledTokens() {
  return canvas?.tokens?.controlled ?? [];
}

function reportFailures(results) {
  for (const result of results) {
    if (result.status === "rejected") console.error("dmm-quality-of-life | multi-token HUD change failed", result.reason);
  }
}

function onStatusClick(hud, event) {
  if (event.button !== 0 && event.button !== 2) return;
  if (!isOn()) return;
  const button = event.target.closest("[data-action='effect'][data-status-id]");
  if (!button) return;
  const statusId = button.dataset.statusId;
  const change = statusChange({
    statusId,
    rightClick: event.button === 2,
    wasActive: button.classList.contains("active"),
    hasLevels: statusHasLevels(statusId),
  });
  if (!change) return;
  const { others } = affectedActors(controlledTokens(), hudToken(hud));
  const targets = change.onlyIfHas ? others.filter((actor) => actor.statuses?.has(statusId)) : others;
  if (!targets.length) return;
  Promise.allSettled(targets.map((actor) => actor.toggleStatusEffect(statusId, change.options))).then(reportFailures);
}

function onMovementClick(hud, event) {
  if (event.button !== 0) return;
  if (!isOn()) return;
  const button = event.target.closest("[data-action='movementAction']");
  if (!button) return;
  const { others } = affectedTokens(controlledTokens(), hudToken(hud));
  if (!others.length) return;
  // Same value core writes for the clicked token: an empty ID means the default.
  const movementAction = button.dataset.movementAction || null;
  const updates = others.map((token) => ({ _id: token.id, movementAction }));
  canvas.scene.updateEmbeddedDocuments("Token", updates).catch((err) =>
    console.error("dmm-quality-of-life | multi-token movement change failed", err));
}

/** Listen on each palette once; the HUD can re-render without replacing them. */
function listenOnce(palette, events, handler) {
  if (!palette || palette.dataset.dmmMultiSelect) return;
  palette.dataset.dmmMultiSelect = "true";
  for (const name of events) palette.addEventListener(name, handler, { capture: true });
}

function setBadge(button, count) {
  if (!button) return;
  let badge = button.querySelector(`:scope > .${BADGE_CLASS}`);
  if (count < 2) {
    badge?.remove();
    return;
  }
  if (!badge) {
    badge = document.createElement("span");
    badge.className = BADGE_CLASS;
    badge.setAttribute("aria-hidden", "true");
    button.append(badge);
  }
  badge.textContent = String(count);
}

function updateBadges(hud, html) {
  const on = isOn();
  const controlled = controlledTokens();
  const token = hudToken(hud);
  const statusCount = on ? affectedActors(controlled, token).count : 0;
  const movementCount = on ? affectedTokens(controlled, token).count : 0;
  setBadge(html.querySelector("[data-action='togglePalette'][data-palette='effects']"), statusCount);
  setBadge(html.querySelector("[data-action='togglePalette'][data-palette='movementActions']"), movementCount);
}

function onRenderTokenHUD(hud, html) {
  listenOnce(html.querySelector(".palette[data-palette='effects']"), ["click", "auxclick"], (event) => onStatusClick(hud, event));
  listenOnce(html.querySelector(".palette[data-palette='movementActions']"), ["click"], (event) => onMovementClick(hud, event));
  updateBadges(hud, html);
}

/** Releasing a selection fires controlToken once per token, so refresh once after them. */
let refreshQueued = false;
function onControlToken() {
  if (refreshQueued) return;
  refreshQueued = true;
  queueMicrotask(() => {
    refreshQueued = false;
    const hud = canvas?.hud?.token;
    if (hud?.rendered && hud.element) updateBadges(hud, hud.element);
  });
}

/** @param {() => boolean} enabled Reads the multi-select setting. */
export function startMultiSelect(enabled) {
  isOn = enabled;
  Hooks.on("renderTokenHUD", onRenderTokenHUD);
  Hooks.on("controlToken", onControlToken);
}
