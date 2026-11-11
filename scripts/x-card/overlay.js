/**
 * The X-Card overlay: a full-screen card with a giant X, shown on every
 * screen when anyone presses the button.
 *
 * The X cycles through the fonts ticked for it in the Fonts dialog. The
 * presser picks the opening font and sends only that, so the message says
 * nothing about who pressed. With no fonts ticked, the card shows an image.
 * Each person dismisses their own card with a click or Escape.
 */

import CONSTANTS from "../shared/constants.js";
import { KEYS as FONT_KEYS } from "../fonts/keys.js";
import { fontDefinitionsFor } from "../fonts/render.js";
import { cardFamilies, nextFamily, pickStart } from "./cycle.js";

const MODULE = CONSTANTS.MODULE_NAME;
const SOCKET = `module.${MODULE}`;
const OVERLAY_ID = "dmm-x-card";

/** How long each font stays up, and how long the crossfade between them takes. */
const STEP_MS = 1200;
const FADE_MS = 150;
const CLOSE_MS = 300;

let timer = null;

/** The card on screen. A dismissed card is let go at once and fades out on its own. */
let card = null;

/** Last opening font on this client, so the next press opens on a different one. */
let lastStart = "";

/**
 * The fonts to cycle: those ticked for the X-Card whose Custom box is on.
 * Core's font list plays no part. The enabled list is only resolved when the
 * Fonts dialog renders, so until it has been, "on" means "not switched off".
 */
function families() {
  const enabledPaths = game.settings.get(MODULE, FONT_KEYS.ENABLED);
  const enabled = enabledPaths?.length
    ? new Set(fontDefinitionsFor(enabledPaths).keys())
    : null;
  const ticked = game.settings.get(MODULE, FONT_KEYS.X_CARD);
  if (enabled) return cardFamilies(ticked, enabled);
  const off = fontDefinitionsFor(game.settings.get(MODULE, FONT_KEYS.DISABLED)).keys();
  const switchedOff = new Set(off);
  return (Array.isArray(ticked) ? ticked : []).filter((family) => !switchedOff.has(family));
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function element(tag, className, text) {
  const el = document.createElement(tag);
  el.className = className;
  if (text) el.textContent = text;
  return el;
}

function buildOverlay(family) {
  const overlay = element("div", "x-card-overlay");
  overlay.id = OVERLAY_ID;
  overlay.tabIndex = -1;
  overlay.setAttribute("role", "alertdialog");
  overlay.setAttribute("aria-label", game.i18n.localize("X-CARD.title"));
  overlay.addEventListener("click", () => hideCard());

  let mark;
  if (family) {
    mark = element("div", "x-card-mark", game.i18n.localize("X-CARD.symbol"));
    mark.style.fontFamily = `"${family}"`;
  } else {
    // A div, not an img: x-card.css paints the SVG as a mask in the card's color.
    mark = element("div", "x-card-image");
    mark.setAttribute("role", "img");
    mark.setAttribute("aria-label", game.i18n.localize("X-CARD.symbol"));
  }

  overlay.append(mark);
  return overlay;
}

/** Fade the X out, change its font, fade it back in. */
function swapFont(mark, family) {
  const fade = { duration: FADE_MS, easing: "ease-in-out" };
  mark
    .animate([{ opacity: 1 }, { opacity: 0 }], fade)
    .finished.then(() => {
      mark.style.fontFamily = `"${family}"`;
      mark.animate([{ opacity: 0 }, { opacity: 1 }], fade);
    })
    // A card dismissed mid-fade cancels the animation; nothing to do then.
    .catch(() => {});
}

// Capture phase, so Foundry's own Escape handling doesn't also close a window.
function onKeydown(event) {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  hideCard();
}

/** Stop the cycle and listeners, and hand back the card that was up. */
function release() {
  clearInterval(timer);
  timer = null;
  document.removeEventListener("keydown", onKeydown, { capture: true });
  const released = card;
  card = null;
  return released;
}

/** Fade the card out on this screen. */
export function hideCard() {
  const released = release();
  if (!released) return;
  if (reducedMotion()) {
    released.remove();
    return;
  }
  // Clicks pass through to the game while it fades.
  released.style.pointerEvents = "none";
  const remove = () => released.remove();
  released
    .animate([{ opacity: 1 }, { opacity: 0 }], { duration: CLOSE_MS, easing: "ease-out", fill: "forwards" })
    .finished.then(remove, remove);
}

/**
 * Show the card on this screen, opening on `start`. A press while a card is
 * already up restarts it.
 *
 * @param {string} start  Opening font; "" or an unknown font falls back to the first ticked one.
 */
export function showCard(start) {
  // A restart swaps cards outright; the new one covers the old.
  release()?.remove();
  const list = families();
  let current = list.includes(start) ? start : (list[0] ?? "");
  lastStart = current;

  const overlay = buildOverlay(current);
  document.body.append(overlay);
  card = overlay;
  overlay.focus();
  document.addEventListener("keydown", onKeydown, { capture: true });

  if (list.length < 2 || reducedMotion()) return;
  const mark = overlay.querySelector(".x-card-mark");
  timer = setInterval(() => {
    current = nextFamily(list, current);
    swapFont(mark, current);
  }, STEP_MS);
}

/** The button: show the card here and on every other connected screen. */
export function pressCard() {
  const start = pickStart(families(), lastStart);
  showCard(start);
  game.socket.emit(SOCKET, { type: "x-card", start });
}

export function listenForCards() {
  game.socket.on(SOCKET, (data) => {
    if (data?.type === "x-card") showCard(data.start);
  });
}
