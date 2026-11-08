/**
 * Token HUD scaling and placement.
 *
 * Adapted from Illandril's Token HUD Scale
 * (github.com/illandril/FoundryVTT-token-hud-scale), MIT, © 2021 Joe Spandrusyszyn.
 *
 * Upstream rewrote each HUD's size and position on a debounced canvasPan,
 * which made the HUD trail the map and then snap. Here core's placement is
 * left alone: canvasPan writes two custom properties on #hud in the same frame
 * as core's own HUD alignment, and CSS scales each part outward from the
 * token edge it touches. The only prototype patch is for the 1×1 option.
 */

import { hudMetrics, oneByOneRect } from "./math.js";
import { getHudSettings } from "./settings.js";

const SCALED_CLASS = "dmm-hud-scaled";
const GAP_PX = 6;

let active = false;

/** Write --dmm-hud-factor and --dmm-hud-gap on #hud for the current zoom. */
export function writeHudVars() {
  const hud = canvas?.hud?.element;
  if (!active || !hud || !canvas.dimensions) return;
  const { buttonScale, response, floor } = getHudSettings();
  const stageScale = canvas.stage.scale.x;
  const gridSize = canvas.dimensions.size;
  const coreUiScale = canvas.dimensions.uiScale ? (canvas.dimensions.uiScale * 100) / gridSize : (game.settings.get("core", "uiConfig")?.uiScale ?? 1);
  const { factor, gap } = hudMetrics({
    stageScale,
    gridSize,
    coreUiScale,
    buttonScale,
    response,
    floor,
    gapPx: GAP_PX,
  });
  hud.style.setProperty("--dmm-hud-factor", String(factor));
  hud.style.setProperty("--dmm-hud-gap", `${gap}px`);
}

/** Re-place any open placeable HUD, so a 1×1 change shows without reopening it. */
export function rerenderOpenHuds() {
  if (!active) return;
  for (const key of ["token", "tile", "drawing"]) {
    const app = canvas?.hud?.[key];
    if (app?.rendered) app.setPosition();
  }
}

function patchOneByOne() {
  const proto = foundry.applications.hud.BasePlaceableHUD.prototype;
  const original = proto._updatePosition;
  proto._updatePosition = function (position) {
    const result = original.call(this, position);
    if (!active || !this.object || !getHudSettings().oneByOne) return result;
    return Object.assign(result, oneByOneRect({
      center: this.object.center,
      gridSize: canvas.dimensions.size,
      uiScale: canvas.dimensions.uiScale,
    }));
  };
}

/** Start scaling unless another HUD scaler is on (see scalingConflict). */
export function startScaling() {
  active = true;
  patchOneByOne();
  // canvasPan runs just before core's hud.align(), so the HUD moves and
  // rescales in the same frame. No debounce on purpose.
  Hooks.on("canvasPan", writeHudVars);
  Hooks.on("canvasReady", () => {
    canvas.hud?.element?.classList.add(SCALED_CLASS);
    writeHudVars();
  });
  if (canvas?.ready) {
    canvas.hud?.element?.classList.add(SCALED_CLASS);
    writeHudVars();
  }
}
