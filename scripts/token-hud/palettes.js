/**
 * Token HUD menus (palettes) pinned inside the visible canvas.
 *
 * Core palettes open beside their column and can run off the canvas or under
 * the sidebar. Whenever one opens, re-renders, or the view changes, it is
 * moved back inside the visible area (overlapping the HUD is fine) and capped
 * in height with a scrollbar if it's still too tall.
 */

import { clampToArea } from "./math.js";
import { getHudSettings } from "./settings.js";

const MARGIN = 8;
const OPEN_PALETTES = ".placeable-hud .palette.active, .dmm-token-image-palette";
const MLD_LIST = "#token-hud.monks-little-details .status-effects";
const MLD_ROWS = /^repeat\((\d+),\s*[\d.]+%\)$/;

/** Screen rect of the canvas not covered by the sidebar or the scene controls. */
export function visibleArea() {
  const board = document.getElementById("board")?.getBoundingClientRect();
  const area = board
    ? { left: board.left, top: board.top, right: board.right, bottom: board.bottom }
    : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  const sidebar = document.getElementById("sidebar")?.getBoundingClientRect();
  if (sidebar?.width) area.right = Math.min(area.right, sidebar.left);
  const controls = document.getElementById("scene-controls")?.getBoundingClientRect();
  if (controls?.width) area.left = Math.max(area.left, controls.right);
  return area;
}

/**
 * MLD's labeled list is fixed at 8 rows tall with overflow visible, and with
 * column sorting its rows are percentages of that height, so the background
 * stops while the names keep going. Its rules are ID-scoped and partly
 * !important, so only inline styles can undo them. Let it size to its content.
 */
function prepareMldList(el) {
  el.style.height = "auto";
  const match = MLD_ROWS.exec(el.style.gridTemplateRows);
  if (match) el.dataset.dmmRows = match[1];
  const rows = el.dataset.dmmRows;
  if (rows) el.style.gridTemplateRows = `repeat(${rows}, auto)`;
  setMldClearAllSticky(el, false);
}

/**
 * MLD puts "clear all" above the list (position absolute, bottom: 100%), which
 * a scrolling list would clip. When capped, give it its own first grid row and
 * keep it stuck to the top while the names scroll under it.
 */
function setMldClearAllSticky(el, sticky) {
  const clearAll = el.querySelector(":scope > .clear-all");
  if (!clearAll) return;
  Object.assign(clearAll.style, sticky
    ? { position: "sticky", insetBlockStart: "0", gridColumn: "1 / -1", gridRow: "1", justifySelf: "end", zIndex: "1" }
    : { position: "", insetBlockStart: "", gridColumn: "", gridRow: "", justifySelf: "", zIndex: "" });
  const rows = el.dataset.dmmRows;
  if (rows) el.style.gridTemplateRows = sticky ? `auto repeat(${rows}, auto)` : `repeat(${rows}, auto)`;
}

/** Move and cap one open palette so it sits inside the visible canvas. */
function fitPalette(el, area) {
  // Measure from where the palette would naturally sit, not from last time's offset.
  el.style.translate = "";
  el.style.maxHeight = "";
  el.style.overflowY = "";
  const isMld = el.matches(MLD_LIST);
  if (isMld) prepareMldList(el);

  const rect = el.getBoundingClientRect();
  if (!rect.width || !el.offsetWidth) return;
  // Palettes sit inside the scaled #hud and HUD columns; convert screen px back to local px.
  const scale = rect.width / el.offsetWidth;
  const { dx, dy, maxHeight } = clampToArea(rect, area, MARGIN);

  if (rect.height > maxHeight) {
    el.style.maxHeight = `${maxHeight / scale}px`;
    el.style.overflowY = "auto";
    if (isMld) setMldClearAllSticky(el, true);
  }
  if (dx || dy) el.style.translate = `${dx / scale}px ${dy / scale}px`;
}

function anyHudRendered() {
  const huds = canvas?.hud;
  return Boolean(huds && (huds.token?.rendered || huds.tile?.rendered || huds.drawing?.rendered));
}

export function fitOpenPalettes() {
  if (!anyHudRendered()) return;
  const hud = canvas?.hud?.element ?? document.getElementById("hud");
  if (!hud) return;
  const palettes = hud.querySelectorAll(OPEN_PALETTES);
  if (!palettes.length) return;
  const area = visibleArea();
  for (const el of palettes) fitPalette(el, area);
}

let observed = null;

function observeHud() {
  const hud = document.getElementById("hud");
  if (!hud || hud === observed) return;
  observed = hud;
  // Only class changes and new nodes: our own inline style writes must not retrigger it.
  // The callback runs as a microtask, before paint, so a palette never shows unclamped.
  new MutationObserver(fitOpenPalettes).observe(hud, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class"],
  });
}

/* Hover to open, as custom-dnd5e's Token HUD Improvements does: resting on a
   palette button opens its palette; leaving the button and the palette closes
   it after a short delay, so the pointer can cross the gap between them.
   The open delay keeps a pointer passing over the HUD from throwing a large
   palette (Monk's status list) over everything. */
const HOVER_OPEN_DELAY = 500;
const HOVER_CLOSE_DELAY = 200;
let openTimer = null;
let closeTimer = null;

function cancelOpen() {
  clearTimeout(openTimer);
  openTimer = null;
}

function cancelClose() {
  clearTimeout(closeTimer);
  closeTimer = null;
}

function scheduleClose(hud) {
  cancelClose();
  closeTimer = setTimeout(() => hud.togglePalette(null), HOVER_CLOSE_DELAY);
}

function attachHoverOpen(hud, html) {
  if (!getHudSettings().hoverMenus) return;
  for (const button of html.querySelectorAll('[data-action="togglePalette"][data-palette]')) {
    button.addEventListener("pointerenter", () => {
      cancelClose();
      cancelOpen();
      openTimer = setTimeout(() => {
        openTimer = null;
        // The HUD may have closed or re-rendered while we waited.
        if (hud.rendered && button.isConnected) hud.togglePalette(button.dataset.palette, true);
      }, HOVER_OPEN_DELAY);
    });
    button.addEventListener("pointerleave", () => {
      cancelOpen();
      scheduleClose(hud);
    });
  }
  for (const palette of html.querySelectorAll(".palette[data-palette]")) {
    palette.addEventListener("pointerenter", cancelClose);
    palette.addEventListener("pointerleave", () => scheduleClose(hud));
  }
}

export function startPalettes() {
  Hooks.on("renderTokenHUD", attachHoverOpen);
  observeHud();
  Hooks.on("canvasReady", observeHud);
  // canvasPan fires before core realigns #hud; a microtask runs after pan()
  // returns but before paint, so it measures the moved HUD in the same frame.
  Hooks.on("canvasPan", () => {
    if (anyHudRendered()) queueMicrotask(fitOpenPalettes);
  });
  window.addEventListener("resize", fitOpenPalettes);
  // Follows the sidebar's collapse animation frame by frame.
  const sidebar = document.getElementById("sidebar");
  if (sidebar) new ResizeObserver(fitOpenPalettes).observe(sidebar);
}
