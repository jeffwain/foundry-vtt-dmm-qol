/**
 * Setting keys for the landing page feature.
 *
 * Kept in their own file so settings.js and publish.js can both use them
 * without importing each other.
 */

export const KEYS = {
  ENABLED: "lp-enabled",
  IMAGE_FOLDER: "lp-image-folder",
  IMAGES: "lp-images",
  /** Background captured the first time we publish, so we can put it back. */
  SAVED_BACKGROUND: "lp-saved-background",
};

export const DEFAULTS = {
  IMAGE_FOLDER: "assets/landing",
};
