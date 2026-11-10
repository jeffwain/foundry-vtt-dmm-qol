/**
 * Placeables Tab — extra clicks for the entries in core's Placeables sidebar tab.
 *
 * - Click an entry to centre the canvas on it, keeping the current zoom.
 * - Middle-click an entry to open its sheet without waiting on a double-click.
 *
 * Centre-on-click wraps core's PlaceableTab entry handler, so it adds no
 * listeners of its own. Middle-click needs real listeners; they go on the
 * Placeables directory (PlaceableDirectory) once, the first time it's opened,
 * rather than on every sub-tab frame from launch.
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
}

/** Directory elements that already have the middle-click listeners. */
const listening = new WeakSet();

/**
 * Add the middle-click listeners to a directory's element, once. They're
 * delegated, so they cover whichever sub-tab is showing.
 */
function listenForMiddleClick(directory) {
  const el = directory.element;
  if (!el || listening.has(el)) return;
  listening.add(el);
  // Stop the browser's middle-button autoscroll from starting on an entry.
  el.addEventListener("mousedown", (event) => {
    if (setting(KEYS.MIDDLE_CLICK_SHEET) && isEntryMiddleClick(event)) event.preventDefault();
  });
  el.addEventListener("auxclick", (event) => {
    if (!setting(KEYS.MIDDLE_CLICK_SHEET) || !isEntryMiddleClick(event)) return;
    const tab = directory.tab;
    if (!tab) return;
    event.preventDefault();
    tab._onConfigureEntry(event, event.target);
  });
}

function patchPlaceableDirectory() {
  const proto = foundry.applications.sidebar.tabs.PlaceableDirectory.prototype;

  const originalActivate = proto._onActivate;
  proto._onActivate = function (...args) {
    const result = originalActivate.apply(this, args);
    listenForMiddleClick(this);
    return result;
  };

  // A pop-out, or a world that loads with this tab already showing, may
  // render without an activate call.
  const originalRender = proto._onRender;
  proto._onRender = async function (...args) {
    await originalRender.apply(this, args);
    if (this.isPopout || this.active) listenForMiddleClick(this);
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
  patchPlaceableDirectory();
});
