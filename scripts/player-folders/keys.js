/**
 * Setting keys and constants for Player Image Folders.
 */

export const KEYS = {
  /**
   * One world object: { "pc-token", "other-token", image, "image-<type>", header }.
   * Each entry is {browse, upload}; the search kinds may add {searchBrowse: false, search: [paths]}.
   */
  FOLDERS: "pf-folders",
};

/** The picker kinds, in dialog order. */
export const KINDS = ["pc-token", "other-token", "image", "header"];

/** Kinds with a Search Folder for the Token HUD image search. */
export const SEARCH_KINDS = ["pc-token", "other-token", "image"];

/** Sheet types the Sheet Image folders can be overridden for: actor types, plus items. */
export const SHEET_TYPES = ["character", "npc", "vehicle", "group", "encounter", "faction", "item"];

export const TIDY_ID = "tidy5e-sheet";
