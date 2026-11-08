/**
 * Placeables Tab — extra clicks for the entries in core's Placeables sidebar tab.
 *
 * - Click an entry to centre the canvas on it, keeping the current zoom.
 * - Middle-click an entry to open its sheet without waiting on a double-click.
 *
 * Both patch core's PlaceableTab, the base class of every sub-tab (Tokens,
 * Tiles, Walls and so on). Sub-tabs are built the first time they're opened,
 * so patching at init catches all of them.
 */

import CONSTANTS from "../shared/constants.js";
import { KEYS } from "./keys.js";

const MODULE = CONSTANTS.MODULE_NAME;
const ENTRY_SELECTOR = "[data-entry-id]";

function setting(key) {
  return game.settings.get(MODULE, key);
}

/** The middle button, outside the entry's own buttons (lock, hide and so on). */
function isEntryMiddleClick(event) {
  return event.button === 1 && !event.target.closest("button") && event.target.closest(ENTRY_SELECTOR);
}

function patchPlaceableTab() {
  const proto = foundry.applications.sidebar.tabs.PlaceableTab.prototype;

  const originalClick = proto._onClickEntry;
  proto._onClickEntry = function (event) {
    const result = originalClick.call(this, event);
    // Shift-click builds a selection; jumping the view each time would get in the way.
    if (!setting(KEYS.CENTER_ON_CLICK) || event.shiftKey || event.target.closest("button")) return result;
    const object = this._getPlaceableFromElement(event.target)?.object;
    if (object) canvas.animatePan(object.center);
    return result;
  };

  const originalAttach = proto._attachFrameListeners;
  proto._attachFrameListeners = function () {
    originalAttach.call(this);
    // Stop the browser's middle-button autoscroll from starting on an entry.
    this.element.addEventListener("mousedown", (event) => {
      if (setting(KEYS.MIDDLE_CLICK_SHEET) && isEntryMiddleClick(event)) event.preventDefault();
    });
    this.element.addEventListener("auxclick", (event) => {
      if (!setting(KEYS.MIDDLE_CLICK_SHEET) || !isEntryMiddleClick(event)) return;
      event.preventDefault();
      this._onConfigureEntry(event, event.target);
    });
  };
}

// Both are shown in the Sidebar Tweaks menu (sidebar-tabs/tweaks.js).
Hooks.once("init", () => {
  game.settings.register(MODULE, KEYS.CENTER_ON_CLICK, {
    name: "PLACEABLES-TAB.center-name",
    hint: "PLACEABLES-TAB.center-hint",
    scope: "client",
    config: false,
    type: Boolean,
    default: true,
  });
  game.settings.register(MODULE, KEYS.MIDDLE_CLICK_SHEET, {
    name: "PLACEABLES-TAB.middle-click-name",
    hint: "PLACEABLES-TAB.middle-click-hint",
    scope: "client",
    config: false,
    type: Boolean,
    default: true,
  });
  patchPlaceableTab();
});
