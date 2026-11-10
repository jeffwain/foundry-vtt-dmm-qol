/**
 * Token HUD — alternate image search.
 *
 * Adds a GM-only button to the Token HUD. Left- or right-clicking it opens a
 * palette with a search box (prefilled with the token's name) and a grid of
 * matching images. Clicking an image applies it to the token.
 *
 * Pure DOM — no libWrapper, no jQuery, no Handlebars templates.
 */

import CONSTANTS from "../shared/constants.js";
import { searchImages, isVideo, getFileName, searchPathsFor, clearSearchCache, wildcardImages } from "./search.js";
import { openPlayerFolders } from "../player-folders/settings.js";

const TOKEN_SEARCH_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor" aria-hidden="true"><!--!Font Awesome Pro 7.3.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2026 Fonticons, Inc.--><path d="M64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 333.3 575 346.3 573.1 359C519 312 433.6 300.9 373 355.8C363.1 364.8 354.7 374.2 347.7 384L288 384C240.6 384 199.1 409.8 177 448.2C212.2 487.4 263.2 512 320 512C321.9 512 323.9 512 325.8 511.9C332.5 534.5 344.3 555.4 359.9 572.9C346.9 574.9 333.5 576 319.9 576C178.5 576 63.9 461.4 63.9 320L64 320zM320 192C280.2 192 248 224.2 248 264C248 303.8 280.2 336 320 336C359.8 336 392 303.8 392 264C392 224.2 359.8 192 320 192zM352 471.1C352 404.8 405.7 351.1 472 351.1C538.3 351.1 592 404.8 592 471.1C592 495.6 584.7 518.3 572.1 537.3L633 598.1C637.7 602.8 640 608.9 640 615.1C640 621.2 637.7 627.4 633 632.1C623.6 641.5 608.4 641.5 599.1 632.1L538.3 571.2C519.3 583.8 496.6 591.1 472.1 591.1C405.8 591.1 352.1 537.4 352.1 471.1L352 471.1zM472 399.1C432.2 399.1 400 431.3 400 471.1C400 510.9 432.2 543.1 472 543.1C511.8 543.1 544 510.9 544 471.1C544 431.3 511.8 399.1 472 399.1z"/></svg>';

const PORTRAIT_SEARCH_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor" aria-hidden="true"><!--!Font Awesome Pro 7.3.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2026 Fonticons, Inc.--><path d="M99 99.1C99 58.5 132 25.5 172.6 25.5L467 25.5C507.6 25.5 540.6 58.5 540.6 99.1L540.6 337C488.6 310.1 422.5 310.9 373 355.8C372.3 356.5 371.5 357.1 370.8 357.8C366.2 357.1 361.4 356.7 356.6 356.7L283 356.7C232.2 356.7 191 397.9 191 448.7C191 458.8 199.3 467.1 209.4 467.1L319.7 467.1C318.6 531.1 360.1 591.9 420.2 614.3L172.6 614.3C132 614.3 99 581.3 99 540.7L99 99.1zM319.8 181.9C284.2 181.9 255.4 210.7 255.4 246.3C255.4 281.9 284.2 310.7 319.8 310.7C355.4 310.7 384.2 281.9 384.2 246.3C384.2 210.7 355.4 181.9 319.8 181.9zM352 471.1C352 404.8 405.7 351.1 472 351.1C538.3 351.1 592 404.8 592 471.1C592 495.6 584.7 518.3 572.1 537.3L633 598.1C637.7 602.8 640 608.9 640 615.1C640 621.2 637.7 627.4 633 632.1C623.6 641.5 608.4 641.5 599.1 632.1L538.3 571.2C519.3 583.8 496.6 591.1 472.1 591.1C405.8 591.1 352.1 537.4 352.1 471.1L352 471.1zM472 399.1C432.2 399.1 400 431.3 400 471.1C400 510.9 432.2 543.1 472 543.1C511.8 543.1 544 510.9 544 471.1C544 431.3 511.8 399.1 472 399.1z"/></svg>';

/**
 * renderTokenHUD hook handler.
 * @param {foundry.applications.hud.TokenHUD} hud
 * @param {HTMLElement} html  Root element of the rendered HUD.
 */
export function onRenderTokenHUD(hud, html) {
  if (!game.user.isGM) return;
  if (!game.settings.get(CONSTANTS.MODULE_NAME, "ti-enable-hud")) return;

  const token = hud.object;
  if (!token?.document) return;

  const rightCol = html.querySelector("div.right") ?? html.querySelector(".col.right");
  if (!rightCol) return;

  // Guard against a duplicate button if the HUD re-renders for the same element.
  if (rightCol.querySelector(".dmm-token-image-button")) return;

  // NOTE: deliberately a <div>, not a <button>. The palette we nest inside it
  // contains a text <input> and clickable tiles; interactive content inside a
  // <button> is invalid HTML and Chromium swallows those nested clicks.
  const button = document.createElement("div");
  button.className = "control-icon dmm-token-image-button";
  button.setAttribute("role", "button");
  button.dataset.tooltip = game.i18n.localize("TOKEN-IMAGES.hud-tooltip");
  button.innerHTML = TOKEN_SEARCH_ICON;

  const toggle = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    togglePalette(button, token);
  };
  button.addEventListener("click", toggle);
  button.addEventListener("contextmenu", toggle);

  rightCol.appendChild(button);
}

/**
 * A header button in the core sidebar search style: `button.icon` with a
 * Font Awesome class, `aria-pressed` for toggles.
 * @param {string|null} faIcon  e.g. "fa-ring", or null to supply an SVG later.
 * @param {string} labelKey     Localization key for the tooltip and aria-label.
 * @param {{mode?: string, pressed?: boolean}} [options]
 */
function iconButton(faIcon, labelKey, { mode, pressed } = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "icon dmm-ti-mode";
  if (faIcon) btn.classList.add("fa-solid", faIcon);
  btn.ariaLabel = game.i18n.localize(labelKey);
  btn.dataset.tooltip = "";
  if (mode) btn.dataset.mode = mode;
  if (pressed !== undefined) btn.setAttribute("aria-pressed", String(pressed));
  return btn;
}

/**
 * Resolve the current texture path for the token under the active apply mode.
 */
function currentTokenSrc(token, applyMode) {
  const doc = canvas.tokens?.get(token.id)?.document ?? token.document;
  return applyMode === "ring" ? doc.ring?.subject?.texture : doc.texture?.src;
}

/**
 * Open or close the search palette attached to the HUD button.
 */
async function togglePalette(button, token) {
  const existing = button.querySelector(".dmm-token-image-palette");
  if (existing) {
    existing.remove();
    button.classList.remove("active");
    return;
  }

  button.classList.add("active");

  const palette = document.createElement("div");
  palette.className = "dmm-token-image-palette";
  // Stop HUD interactions from bubbling and closing things unexpectedly.
  palette.addEventListener("click", (ev) => ev.stopPropagation());
  palette.addEventListener("contextmenu", (ev) => ev.stopPropagation());

  // Apply target: "token" -> texture.src, "ring" -> ring.subject.texture.
  // Default to "ring" when the token already has its dynamic ring enabled so
  // clicking a tile doesn't unexpectedly turn the ring off.
  const initialDoc = canvas.tokens?.get(token.id)?.document ?? token.document;
  let applyMode = initialDoc?.ring?.enabled ? "ring" : "token";
  const getMode = () => applyMode;

  // Character tokens search the PC token folders, everything else the other ones.
  // The portrait toggle swaps both for the portrait / sheet image folders.
  const tokenKind = token.actor?.type === "character" ? "pc-token" : "other-token";
  let searchPortraits = false;
  const searchKind = () => (searchPortraits ? "image" : tokenKind);

  // Wildcard token art opens on its own image set instead of a name search.
  // Typing or switching to portraits drops back to the normal search.
  let showWildcard = Boolean(token.actor?.prototypeToken?.randomImg);

  // Same markup as the core sidebar's search bar, so core button styles apply.
  const input = document.createElement("input");
  input.type = "search";
  input.autocomplete = "off";
  input.className = "dmm-token-image-search";
  input.placeholder = game.i18n.localize("TOKEN-IMAGES.search-placeholder");
  // Prefill with the actor's name (falls back to the token's name, then empty).
  // Wildcard tokens start empty: the box shows the wildcard set, not a search.
  input.value = showWildcard ? "" : (token.actor?.name ?? token.document.name ?? "");

  // Mode button group (apply picked art to the token image vs. its dynamic ring).
  const modes = document.createElement("div");
  modes.className = "dmm-token-image-modes";
  modes.append(
    iconButton("fa-circle-user", "TOKEN-IMAGES.mode-token", { mode: "token", pressed: applyMode === "token" }),
    iconButton("fa-ring", "TOKEN-IMAGES.mode-ring", { mode: "ring", pressed: applyMode === "ring" }),
  );

  // Portrait scope toggle (left of search). Independent of the token/ring radio.
  const portraitToggle = iconButton(null, "TOKEN-IMAGES.search-portraits", { pressed: false });
  portraitToggle.classList.add("dmm-ti-portrait");
  portraitToggle.innerHTML = PORTRAIT_SEARCH_ICON;

  // Refresh: drop the cached candidate list so newly-uploaded art shows up
  // without a Foundry reload, then re-run the current search.
  const refresh = iconButton("fa-rotate", "TOKEN-IMAGES.refresh");
  refresh.classList.add("dmm-ti-refresh");

  const header = document.createElement("search");
  header.className = "dmm-token-image-header";
  header.appendChild(portraitToggle);
  header.appendChild(input);
  header.appendChild(modes);
  header.appendChild(refresh);

  const results = document.createElement("div");
  results.className = "dmm-token-image-results";

  palette.appendChild(header);
  palette.appendChild(results);
  button.appendChild(palette);

  // Highlight tiles whose image is the token's current art for the active mode.
  const refreshActive = () => {
    const currentSrc = currentTokenSrc(token, applyMode);
    for (const t of results.querySelectorAll(".dmm-token-image-tile")) {
      t.classList.toggle("active", t.dataset.path === currentSrc);
    }
  };

  // Single delegated click listener for all image tiles in the results grid.
  results.addEventListener("click", async (ev) => {
    if (ev.target.closest(".dmm-ti-open-folders")) {
      ev.preventDefault();
      ev.stopPropagation();
      openPlayerFolders({ onSave: () => palette.isConnected && runSearch() });
      return;
    }
    const tile = ev.target.closest(".dmm-token-image-tile");
    if (!tile) return;
    ev.preventDefault();
    ev.stopPropagation();
    await applyImage(token, tile.dataset.path, getMode());
    refreshActive();
  });

  modes.querySelectorAll(".dmm-ti-mode").forEach((el) => {
    el.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      applyMode = el.dataset.mode;
      modes.querySelectorAll(".dmm-ti-mode").forEach((b) => b.setAttribute("aria-pressed", String(b === el)));
      refreshActive();
    });
  });

  let searchSeq = 0;
  let debounceTimer = null;
  const warnedKinds = new Set();
  const clearPendingDebounce = () => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  };

  const runSearch = async ({ force = false } = {}) => {
    clearPendingDebounce();
    const seq = ++searchSeq;
    const kind = searchKind();
    const query = input.value.trim();

    results.innerHTML = `<p class="dmm-ti-status">${game.i18n.localize("TOKEN-IMAGES.searching")}</p>`;
    let images;
    try {
      if (showWildcard) images = await wildcardImages(token.actor, { force });
      // A wildcard that matches nothing falls back to the name search.
      if (!images?.length) images = await searchImages(query, kind);
    } catch (err) {
      if (seq !== searchSeq || !palette.isConnected) return;
      console.error(`${CONSTANTS.MODULE_NAME} | Image search failed`, err);
      results.innerHTML = `<p class="dmm-ti-status">${game.i18n.localize("TOKEN-IMAGES.search-error")}</p>`;
      return;
    }
    if (seq !== searchSeq || !palette.isConnected) return;
    renderResults(results, images, token, kind, getMode());
    // Warn once per kind each time the palette opens, not on every keystroke.
    if (!images?.length && !searchPathsFor(kind).length && !warnedKinds.has(kind)) {
      warnedKinds.add(kind);
      ui.notifications.warn(game.i18n.format("TOKEN-IMAGES.no-paths-warning", { kind: kindLabel(kind) }));
    }
  };

  portraitToggle.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    searchPortraits = !searchPortraits;
    showWildcard = false;
    portraitToggle.setAttribute("aria-pressed", String(searchPortraits));
    runSearch();
  });

  refresh.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    clearSearchCache();
    runSearch({ force: true });
  });

  // Short debounce on actual text changes ("input"): the heavy work (enumeration
  // + index build) is cached after the first search, so per-keystroke cost is
  // just an in-memory scan. Enter searches immediately; Escape closes.
  input.addEventListener("input", () => {
    showWildcard = false;
    clearPendingDebounce();
    debounceTimer = setTimeout(runSearch, 150);
  });

  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      runSearch();
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      clearPendingDebounce();
      searchSeq++;
      palette.remove();
      button.classList.remove("active");
    }
  });

  input.focus();
  input.select();
  await runSearch();
}

/** Each results grid's loader, so a new search can stop the last one. */
const loaders = new WeakMap();

/**
 * Load tile media only as it scrolls near the visible part of the grid. The
 * grid shows about 14 of up to 100 tiles, and each one is full-size art or a
 * video, so loading them all at once was the slow part of opening it.
 * loading="lazy" doesn't help here: it works from the window, not this
 * scrolling box, so every tile counted as near.
 */
function mediaLoader(container) {
  loaders.get(container)?.disconnect();
  const loader = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const media = entry.target.querySelector("img, video");
        if (media?.dataset.src) {
          media.src = media.dataset.src;
          delete media.dataset.src;
        }
        loader.unobserve(entry.target);
      }
    },
    // One grid height ahead, so tiles are ready by the time they scroll in.
    { root: container, rootMargin: "100% 0px" },
  );
  loaders.set(container, loader);
  return loader;
}

/** The Image Folders section name for a search kind, e.g. "Tokens (Other)". */
function kindLabel(kind) {
  return game.i18n.localize(`PLAYER-FOLDERS.kind-${kind}`);
}

/**
 * Render the image grid into the results container.
 * @param {HTMLElement} container
 * @param {Array<{path:string,name:string}>} images
 * @param {Token} token
 * @param {string} kind       The kind searched, for the empty message.
 * @param {string} applyMode  Current apply mode ("token" | "ring") for active tile highlight.
 */
function renderResults(container, images, token, kind, applyMode) {
  if (!images?.length) {
    loaders.get(container)?.disconnect();
    container.innerHTML = searchPathsFor(kind).length
      ? `<p class="dmm-ti-status">${game.i18n.localize("TOKEN-IMAGES.no-matches")}</p>`
      : `<div class="dmm-ti-status">
          <p>${game.i18n.format("TOKEN-IMAGES.no-paths", { kind: kindLabel(kind) })}</p>
          <button type="button" class="dmm-ti-open-folders"><i class="fas fa-folder-tree"></i> ${game.i18n.localize("TOKEN-IMAGES.no-paths-link")}</button>
        </div>`;
    return;
  }

  const currentSrc = currentTokenSrc(token, applyMode);
  const fragment = document.createDocumentFragment();
  const loader = mediaLoader(container);

  for (const img of images) {
    const tile = document.createElement("div");
    tile.className = "dmm-token-image-tile";
    if (img.path === currentSrc) tile.classList.add("active");
    tile.dataset.path = img.path;
    tile.title = img.name || getFileName(img.path);

    if (isVideo(img.path)) {
      const video = document.createElement("video");
      video.dataset.src = img.path;
      video.muted = true;
      video.loop = true;
      video.preload = "metadata";
      tile.addEventListener("mouseenter", () => video.play().catch(() => {}));
      tile.addEventListener("mouseleave", () => {
        video.pause();
        video.currentTime = 0;
      });
      tile.appendChild(video);
    } else {
      const image = document.createElement("img");
      image.dataset.src = img.path;
      image.decoding = "async";
      tile.appendChild(image);
    }

    fragment.appendChild(tile);
    loader.observe(tile);
  }

  container.replaceChildren(fragment);
}

/**
 * Apply the chosen image to the token. Re-resolves the live placeable so we
 * never write to a stale document captured at HUD-render time.
 * @param {string} mode  "token" -> texture.src, "ring" -> dynamic ring subject.
 */
async function applyImage(token, imgSrc, mode = "token") {
  const doc = canvas.tokens.get(token.id)?.document ?? token.document;
  // A ring-enabled token *displays* ring.subject.texture, not texture.src. So each
  // mode also sets ring.enabled to match what it writes, otherwise the swap is
  // invisible (e.g. writing texture.src on a token whose ring is on shows nothing).
  const update =
    mode === "ring"
      ? { "ring.enabled": true, "ring.subject.texture": imgSrc }
      : { "texture.src": imgSrc, "ring.enabled": false };
  try {
    await doc.update(update);
  } catch (err) {
    console.error(`${CONSTANTS.MODULE_NAME} | Failed to update token image`, err);
    ui.notifications.error(game.i18n.localize("TOKEN-IMAGES.apply-error"));
  }
}
