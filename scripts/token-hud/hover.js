/**
 * GM hover HP tab.
 *
 * Hovering a token shows a small tab with its HP (bar1) in the token's bottom
 * right corner (centred on the grid intersection), clear of a nameplate that
 * also shows on hover.
 * Clicking the tab opens the token HUD as a right-click would, with the tab
 * growing into the HUD's HP box while the button columns open.
 */

import { getHudSettings } from "./settings.js";

const HIDE_DELAY = 250;
const TAKEOVER_DELAY = 150;
const OPEN_MS = 200;

let tab = null;
let current = null;
let pending = null;
let hideTimer = null;
let takeoverTimer = null;
let tabHovered = false;

function eligible(token) {
  if (!game.user.isGM || !getHudSettings().hover || !canvas?.ready) return false;
  if (!token?.document || token.isPreview || token.hasActiveHUD) return false;
  if (token.mouseInteractionManager?.isDragging) return false;
  const bar = token.document.getBarAttribute("bar1");
  return bar != null && bar.value != null;
}

function ensureTab() {
  const hud = canvas.hud?.element;
  if (!hud) return null;
  if (tab?.isConnected && tab.parentElement === hud) return tab;
  tab = document.createElement("div");
  tab.className = "dmm-hud-hover-tab";
  tab.setAttribute("role", "button");
  tab.addEventListener("pointerenter", () => {
    tabHovered = true;
    clearTimeout(hideTimer);
    clearTimeout(takeoverTimer);
  });
  tab.addEventListener("pointerleave", () => {
    tabHovered = false;
    scheduleHide();
  });
  tab.addEventListener("pointerdown", (ev) => ev.stopPropagation());
  tab.addEventListener("click", openHud);
  hud.append(tab);
  return tab;
}

function show(token) {
  clearTimeout(hideTimer);
  clearTimeout(takeoverTimer);
  pending = null;
  if (!eligible(token)) return;
  const el = ensureTab();
  if (!el) return;
  current = token;
  el.textContent = String(token.document.getBarAttribute("bar1").value);

  // Anchored on the token's bottom right corner (a grid intersection); the CSS
  // centres the tab on that point.
  el.style.left = `${token.x + token.w}px`;
  el.style.top = `${token.y + token.h}px`;
  // #hud is scaled by zoom only; HUD parts also carry the grid's uiScale.
  el.style.setProperty("--dmm-hud-ui-scale", String(canvas.dimensions.uiScale));
}

export function hideTab() {
  clearTimeout(hideTimer);
  clearTimeout(takeoverTimer);
  pending = null;
  current = null;
  tabHovered = false;
  tab?.remove();
}

function scheduleHide() {
  clearTimeout(hideTimer);
  if (!current) return;
  hideTimer = setTimeout(() => {
    if (!tabHovered && !current?.hover) hideTab();
  }, HIDE_DELAY);
}

function onHoverToken(token, hovered) {
  if (hovered) {
    if (!eligible(token)) return;
    if (!current) return show(token);
    if (token === current) return clearTimeout(hideTimer);
    // Another token: only take the tab once the pointer has rested on it, so
    // crossing a neighbour on the way down to the tab doesn't steal it.
    pending = token;
    clearTimeout(takeoverTimer);
    takeoverTimer = setTimeout(() => show(token), TAKEOVER_DELAY);
    return;
  }
  if (token === pending) {
    pending = null;
    clearTimeout(takeoverTimer);
  }
  if (!tabHovered) scheduleHide();
}

async function openHud(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  const token = current;
  const from = tab?.getBoundingClientRect();
  hideTab();
  if (!token?.layer) return;
  token.control({ releaseOthers: true });
  await canvas.tokens.hud.bind(token);
  if (from) animateOpen(from);
  focusHp(canvas.tokens.hud.element);
}

/** Put the cursor in the HP box, selected, so a value can be typed at once. */
function focusHp(hud) {
  const input = hud?.querySelector(".attribute.bar1 input");
  input?.focus({ preventScroll: true });
  input?.select();
}

/** Token whose HUD already got its focus, so re-renders don't repeat it. */
let focusedFor = null;

/** The setting: focus the HP box whenever the HUD opens, e.g. on right click. */
function onOpenHud(hud, html) {
  if (!getHudSettings().focusHp) return;
  const id = hud.object?.id ?? null;
  if (id === focusedFor) return;
  focusedFor = id;
  // The right click is still finishing and the HUD may not be in the page yet,
  // so wait two frames or the focus is lost.
  requestAnimationFrame(() => requestAnimationFrame(() => focusHp(html)));
}

/** Grow the HP box out of the tab and scale the columns out from the token. */
function animateOpen(from) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const hud = canvas.tokens.hud.element;
  if (!hud) return;
  const options = { duration: OPEN_MS, easing: "ease-out" };

  const bar = hud.querySelector(".attribute.bar1");
  const to = bar?.getBoundingClientRect();
  if (to?.width && to.height && bar.offsetWidth) {
    // The keyframe transform applies inside the bar's own scale, so convert
    // screen px to the bar's local px.
    const k = to.width / bar.offsetWidth;
    const dx = (from.left + from.width / 2 - (to.left + to.width / 2)) / k;
    const dy = (from.top - to.top) / k;
    const sx = from.width / to.width;
    const sy = from.height / to.height;
    bar.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, transformOrigin: "top center" },
      { transform: "none", transformOrigin: "top center" },
    ], options);
  }

  // A keyframe transform multiplies with the column's own `scale`, so the
  // columns grow from 60% of their current size, out of the token's edges.
  for (const col of hud.querySelectorAll(".col.left, .col.right")) {
    col.animate([{ opacity: 0, transform: "scale(0.6)" }, { opacity: 1, transform: "none" }], options);
  }
}

export function startHover() {
  Hooks.on("hoverToken", onHoverToken);
  Hooks.on("renderTokenHUD", hideTab);
  Hooks.on("renderTokenHUD", onOpenHud);
  Hooks.on("closeTokenHUD", () => {
    focusedFor = null;
  });
  Hooks.on("canvasTearDown", hideTab);
  const forCurrent = (doc) => {
    if (current && doc.id === current.document?.id) hideTab();
  };
  Hooks.on("updateToken", forCurrent);
  Hooks.on("deleteToken", forCurrent);
}
