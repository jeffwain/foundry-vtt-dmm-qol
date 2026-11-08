/**
 * Token HUD settings. The GM's values are world settings and apply to everyone.
 * While the GM has the HUD on, a player can override the three size settings
 * (button scale, zoom response, smallest size) for their own screen. Everything else
 * is GM only. One Configure Settings menu serves both: it shows the GM the
 * full list and a player only the size settings.
 */

import CONSTANTS from "../shared/constants.js";
import SettingsGroupDialog, { escapeHTML } from "../shared/settings-dialog.js";
import { resolveValues } from "../shared/overrides.js";
import { KEYS } from "./keys.js";

const MODULE = CONSTANTS.MODULE_NAME;

/** The settings a player may override. */
const SIZE_KEYS = [KEYS.BUTTON_SCALE, KEYS.RESPONSE, KEYS.FLOOR];

/** Cached snapshot so canvasPan/hoverToken never hit the settings store. */
let cached = null;

/** Size values that apply to this user: the GM's, or the player's own. */
function sizeValues() {
  const world = Object.fromEntries(SIZE_KEYS.map((key) => [key, game.settings.get(MODULE, key)]));
  return resolveValues({
    isGM: game.user.isGM,
    world,
    mine: game.settings.get(MODULE, KEYS.USER),
  });
}

function readSettings() {
  const get = (key) => game.settings.get(MODULE, key);
  const size = sizeValues();
  cached = {
    enabled: get(KEYS.ENABLED),
    buttonScale: size[KEYS.BUTTON_SCALE],
    response: size[KEYS.RESPONSE] / 100,
    floor: size[KEYS.FLOOR] / 100,
    oneByOne: get(KEYS.ONE_BY_ONE),
    hover: get(KEYS.HOVER),
    hoverMenus: get(KEYS.HOVER_MENUS),
    focusHp: get(KEYS.FOCUS_HP),
  };
  return cached;
}

class TokenHudSettings extends SettingsGroupDialog {
  static MODULE = MODULE;
  static DEFAULT_OPTIONS = {
    id: "dmm-token-hud-settings",
    classes: ["dmm-quality-of-life"],
    window: { title: "TOKEN-HUD.name", icon: "fa-solid fa-expand" },
  };

  get settingKeys() {
    if (game.user.isGM) {
      return [KEYS.ENABLED, ...SIZE_KEYS, KEYS.ONE_BY_ONE, KEYS.HOVER_MENUS, KEYS.HOVER, KEYS.FOCUS_HP];
    }
    return game.settings.get(MODULE, KEYS.ENABLED) ? SIZE_KEYS : [];
  }

  _extraHTML() {
    if (game.user.isGM || this.settingKeys.length) return "";
    return `<p class="hint">${escapeHTML(game.i18n.localize("TOKEN-HUD.players-off"))}</p>`;
  }

  /** A player sees their effective size values; the GM sees the world values. */
  _currentValue(key) {
    return !game.user.isGM && SIZE_KEYS.includes(key) ? sizeValues()[key] : super._currentValue(key);
  }

  /** A player's changes go to their own override, never the world setting. */
  async _commit(key, value) {
    if (game.user.isGM) return super._commit(key, value);
    const mine = game.settings.get(MODULE, KEYS.USER);
    await game.settings.set(MODULE, KEYS.USER, { ...mine, [key]: value });
  }
}

/** @param {() => void} onChange  Called after any Token HUD setting changes. */
export function registerSettings(onChange) {
  const handleChange = () => {
    readSettings();
    onChange?.();
  };

  game.settings.registerMenu(MODULE, "token-hud-menu", {
    name: "TOKEN-HUD.name",
    label: "TOKEN-HUD.label",
    hint: "TOKEN-HUD.hint",
    icon: "fa-solid fa-expand",
    type: TokenHudSettings,
    restricted: false,
  });

  const number = (key, name, initial, range) =>
    game.settings.register(MODULE, key, {
      name: `TOKEN-HUD.${name}-name`,
      hint: `TOKEN-HUD.${name}-hint`,
      scope: "world",
      config: false,
      type: Number,
      default: initial,
      range,
      onChange: handleChange,
    });
  const boolean = (key, name, initial) =>
    game.settings.register(MODULE, key, {
      name: `TOKEN-HUD.${name}-name`,
      hint: `TOKEN-HUD.${name}-hint`,
      scope: "world",
      config: false,
      type: Boolean,
      default: initial,
      onChange: handleChange,
    });

  // Master switch. Each part hooks in once at ready, so turning it off or on reloads.
  game.settings.register(MODULE, KEYS.ENABLED, {
    name: "TOKEN-HUD.enabled-name",
    hint: "TOKEN-HUD.enabled-hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
    requiresReload: true,
    // Our dialog saves through game.settings.set, which skips core's reload prompt.
    onChange: () => {
      readSettings();
      foundry.applications.settings.SettingsConfig.reloadConfirm();
    },
  });
  number(KEYS.BUTTON_SCALE, "button-scale", 0.85, { min: 0.5, max: 2, step: 0.05 });
  number(KEYS.RESPONSE, "zoom-response", 70, { min: 0, max: 100, step: 5 });
  number(KEYS.FLOOR, "min-size", 85, { min: 30, max: 100, step: 5 });
  boolean(KEYS.ONE_BY_ONE, "one-by-one", true);
  boolean(KEYS.HOVER_MENUS, "hover-menus", true);
  boolean(KEYS.HOVER, "hover-shortcut", true);
  boolean(KEYS.FOCUS_HP, "focus-hp", true);

  // A player's own size overrides.
  game.settings.register(MODULE, KEYS.USER, {
    scope: "client",
    config: false,
    type: Object,
    default: {},
    onChange: handleChange,
  });

  readSettings();
}

/** @returns {{enabled: boolean, buttonScale: number, response: number, floor: number, oneByOne: boolean, hover: boolean, hoverMenus: boolean, focusHp: boolean}} */
export function getHudSettings() {
  return cached ?? readSettings();
}
