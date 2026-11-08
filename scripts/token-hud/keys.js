/** Setting keys for the Token HUD feature. */

export const KEYS = {
  ENABLED: "token-hud-enabled",
  BUTTON_SCALE: "token-hud-button-scale",
  // Stored as percents; the "-pct" keys keep old 0-1 values from being read as 0.7%.
  RESPONSE: "token-hud-zoom-response-pct",
  FLOOR: "token-hud-min-size-pct",
  ONE_BY_ONE: "token-hud-one-by-one",
  HOVER: "token-hud-hover-shortcut",
  HOVER_MENUS: "token-hud-hover-menus",
  FOCUS_HP: "token-hud-focus-hp",
  // A player's own size overrides, keyed by the size setting keys above.
  USER: "token-hud-user",
};
