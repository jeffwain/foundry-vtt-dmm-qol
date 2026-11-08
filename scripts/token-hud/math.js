/**
 * Token HUD math. Pure helpers with no Foundry globals, so node --test can
 * cover them.
 */

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * Extra scale for the HUD parts outside the token, on top of the map zoom.
 *
 * Zoom is measured against "one grid square = 100px on screen". The on-screen
 * size follows the zoom only partway (response 0 = all the way, 1 = not at
 * all), never drops below `floor` and never grows past the base size.
 *
 * @returns {{factor: number, gap: number}} factor is unitless; gap is in local
 *   HUD pixels and comes out as `gapPx` on screen.
 */
export function hudMetrics({ stageScale, gridSize, coreUiScale, buttonScale, response, floor, gapPx }) {
  const z = (stageScale * gridSize) / 100;
  if (!(z > 0) || !Number.isFinite(z)) return { factor: buttonScale, gap: gapPx };
  const screen = clamp(z ** (1 - response), floor, 1);
  return {
    factor: (buttonScale * screen) / z,
    gap: gapPx / (z * coreUiScale),
  };
}

/**
 * HUD box for the 1×1 option: one grid square centred on the token. Width and
 * height are divided by uiScale, as core's _updatePosition does with bounds.
 */
export function oneByOneRect({ center, gridSize, uiScale }) {
  return {
    left: center.x - gridSize / 2,
    top: center.y - gridSize / 2,
    width: gridSize / uiScale,
    height: gridSize / uiScale,
  };
}

/** Offset that brings [start, end] inside [min, max]; oversized spans align to min. */
function axisOffset(start, end, min, max) {
  if (end - start > max - min) return min - start;
  if (end > max) return max - end;
  if (start < min) return min - start;
  return 0;
}

/**
 * How far to move a palette (screen px) so it sits inside the visible area,
 * and the tallest it may be. The caller caps the height first, so the
 * vertical check uses the capped height.
 *
 * @param {{left:number, top:number, right:number, bottom:number}} rect
 * @param {{left:number, top:number, right:number, bottom:number}} area
 * @param {number} margin
 * @returns {{dx: number, dy: number, maxHeight: number}}
 */
export function clampToArea(rect, area, margin) {
  const maxHeight = area.bottom - area.top - 2 * margin;
  const height = Math.min(rect.bottom - rect.top, maxHeight);
  return {
    dx: axisOffset(rect.left, rect.right, area.left + margin, area.right - margin),
    dy: axisOffset(rect.top, rect.top + height, area.top + margin, area.bottom - margin),
    maxHeight,
  };
}
