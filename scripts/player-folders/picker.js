/**
 * The FilePicker wrapper behind Player Image Folders.
 *
 * For a token, sheet image or Tidy header picker with folders set, it opens in
 * the browse folder. For players it also keeps browsing inside the allowed
 * folders and sends uploads to the upload folder; GMs can go anywhere.
 * Other pickers are left plain.
 *
 * It subclasses whatever CONFIG.ux.FilePicker is at ready, so it sits on top
 * of other modules' pickers (Filepicker Plus) instead of replacing them.
 * The lock is a convenience, not security: the server still lets anyone with
 * Browse Files reach other folders.
 */

import CONSTANTS from "../shared/constants.js";
import { KEYS } from "./keys.js";
import { resolveFolders, clampTarget, isWithin } from "./folders.js";
import { takePickerRequest } from "./detect.js";
import { normalizeFolder, ensureFolder } from "../shared/files.js";

const MODULE = CONSTANTS.MODULE_NAME;

export function installPlayerFolderPicker() {
  const Base = CONFIG.ux.FilePicker;

  // The picker whose upload input or drop zone was last used. Core's upload
  // handlers call the static upload without saying which picker they belong to.
  let uploadingPicker = null;

  class PlayerFolderPicker extends Base {
    /** @type {{browse:string, upload:string, roots:string[]}|null} */
    #folders = null;

    /** Players are kept inside the folders; GMs only get the starting folder. */
    #locked = false;

    /** Folder to show after a redirected upload. */
    #jumpTo = null;

    constructor(options = {}) {
      super(options);
      const request = takePickerRequest();
      if (!request || !this.sources.data) return;
      this.#folders = resolveFolders(game.settings.get(MODULE, KEYS.FOLDERS), request.kind, request.docType);
      if (!this.#folders) return;
      this.#locked = !game.user.isGM;

      // Start in the browse folder unless the current image already sits in an allowed one.
      const inside = this.activeSource === "data" && this.#folders.roots.some((root) => isWithin(this.target, root));
      if (!inside) {
        this.activeSource = "data";
        this.sources.data.target = this.#folders.browse;
      }
    }

    async browse(target = this.target, options = {}) {
      if (this.#locked) {
        if (this.#jumpTo) target = this.#jumpTo;
        this.#jumpTo = null;
        this.activeSource = "data";
        target = clampTarget(target, this.#folders.roots);
      }
      return super.browse(target, options);
    }

    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      // No going up from the top of an allowed folder.
      if (this.#locked && this.#folders.roots.includes(normalizeFolder(this.target))) context.canGoBack = false;
      return context;
    }

    async _onFirstRender(context, options) {
      await super._onFirstRender(context, options);
      if (!this.#locked) return;
      this.element.classList.add("dmm-locked-picker");
      // Capture runs before core's own upload and drop handlers.
      const mark = () => (uploadingPicker = this);
      this.element.addEventListener("change", mark, true);
      this.element.addEventListener("drop", mark, true);
    }

    _onClose(options) {
      super._onClose(options);
      if (uploadingPicker === this) uploadingPicker = null;
    }

    static async upload(source, path, file, body = {}, options = {}) {
      const picker = uploadingPicker;
      // uploadingPicker is only ever a locked picker, set in _onFirstRender.
      const folder = picker?.#folders?.upload;
      // Only redirect uploads into the folder that picker is showing, not other callers.
      if (folder && source === "data" && normalizeFolder(picker.target) === normalizeFolder(path)) {
        await ensureFolder(this, folder);
        picker.#jumpTo = folder;
        path = folder;
      }
      return super.upload(source, path, file, body, options);
    }
  }

  CONFIG.ux.FilePicker = PlayerFolderPicker;
}
