/**
 * Setting keys for the fonts feature.
 *
 * Kept in their own file so settings.js and apply.js can both use them
 * without importing each other.
 */

export const KEYS = {
  FOLDER: "fonts-folder",
  /**
   * Data paths of the font files switched on. Resolved by the dialog from a
   * folder scan, because Foundry needs the list at init, before it can browse.
   */
  ENABLED: "fonts-enabled",
  /** Data paths the user switched off. Everything else in the folder is on. */
  DISABLED: "fonts-disabled",
  /** actorId -> family, for character name fonts. */
  CHARACTERS: "fonts-characters",
  /** Family for every character without its own pick. Empty keeps the system font. */
  CHARACTER_DEFAULT: "fonts-character-default",
  PAUSE: "fonts-pause",
  /** Families the X-Card cycles through. */
  X_CARD: "fonts-x-card",
};

export const DEFAULTS = {
  FOLDER: "assets/fonts",
  /** What dnd5e and Tidy use for character names when nothing overrides it. */
  SYSTEM_NAME_FONT: "Modesto Condensed",
};
