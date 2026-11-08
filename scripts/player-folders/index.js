/**
 * Player Image Folders — point players' file pickers at set folders.
 *
 * For tokens, sheet images and Tidy sheet headers, a player's picker opens in the
 * browse folder, stays inside it, and sends uploads to the upload folder.
 * A GM's picker just opens in the browse folder, with nothing locked.
 */

import { registerPlayerFolderSettings } from "./settings.js";
import { listenForPickerClicks } from "./detect.js";
import { installPlayerFolderPicker } from "./picker.js";

Hooks.once("init", () => registerPlayerFolderSettings());

// At ready, so we wrap whatever picker other modules configured during init.
Hooks.once("ready", () => {
  listenForPickerClicks();
  installPlayerFolderPicker();
});
