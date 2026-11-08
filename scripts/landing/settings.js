/**
 * Landing Page settings.
 *
 * One Configure-Settings entry opens a dialog that edits what the login page
 * can show: the background rotation. Saving writes the settings and
 * republishes.
 *
 * The dialog re-renders on rescan/upload/re-roll, so in-progress edits are
 * stashed and re-applied afterwards.
 */

import CONSTANTS from "../shared/constants.js";
import SettingsGroupDialog, { escapeHTML } from "../shared/settings-dialog.js";
import { DEFAULTS, KEYS } from "./keys.js";
import { basename, scanImages, uploadTo, clearFileCache } from "../shared/files.js";
import { captureOriginal, publishLandingPage, rerollBackground, restoreOriginal } from "./publish.js";

const MODULE = CONSTANTS.MODULE_NAME;

/**
 * Register the Landing Page settings and menu.
 */
export function registerLandingSettings() {
  game.settings.registerMenu(MODULE, "landing-menu", {
    name: "LANDING.name",
    label: "LANDING.label",
    hint: "LANDING.hint",
    icon: "fas fa-door-open",
    type: LandingConfig,
    restricted: true,
  });

  // name/hint are only needed for the keys the base dialog renders by
  // introspection; the rest get purpose-built controls in _extraHTML.
  const world = (key, type, initial, labelled = false) =>
    game.settings.register(MODULE, key, {
      scope: "world",
      config: false,
      type,
      default: initial,
      ...(labelled ? { name: `LANDING.${key}`, hint: `LANDING.${key}-hint` } : {}),
    });

  world(KEYS.ENABLED, Boolean, false, true);
  world(KEYS.IMAGE_FOLDER, String, DEFAULTS.IMAGE_FOLDER);
  world(KEYS.IMAGES, Array, []);
  world(KEYS.SAVED_BACKGROUND, String, "");
}

/**
 * The Landing Page dialog.
 */
class LandingConfig extends SettingsGroupDialog {
  static DEFAULT_OPTIONS = {
    id: "dmm-landing",
    window: { title: "LANDING.name", icon: "fas fa-door-open" },
    position: { width: 620, height: "auto" },
  };

  // Only the plain rows go through the base class's introspection; everything
  // else needs custom controls and is built in _extraHTML.
  static SETTING_KEYS = [KEYS.ENABLED];

  /** Images found in the configured folder, refreshed on each render. */
  #scanned = [];

  /** Unsaved edits preserved across re-renders. */
  #draft = null;

  /** @inheritDoc */
  async _renderHTML(...args) {
    const imageFolder = this.#value(KEYS.IMAGE_FOLDER) || DEFAULTS.IMAGE_FOLDER;
    this.#scanned = await scanImages(imageFolder);
    return super._renderHTML(...args);
  }

  /** Current value for a key: the unsaved draft if there is one, else the setting. */
  #value(key) {
    if (this.#draft && key in this.#draft) return this.#draft[key];
    return game.settings.get(MODULE, key);
  }

  /** @inheritDoc */
  _extraHTML() {
    return this.#backgroundsHTML();
  }

  #backgroundsHTML() {
    const enabled = new Set(this.#value(KEYS.IMAGES) ?? []);
    const rows = this.#scanned.length
      ? this.#scanned
          .map(
            (path) => `
          <label class="dmm-lp-image">
            <input type="checkbox" class="dmm-lp-image-toggle" data-path="${escapeHTML(path)}" ${enabled.has(path) ? "checked" : ""}/>
            <span>${escapeHTML(basename(path))}</span>
          </label>`,
          )
          .join("")
      : `<p class="hint dmm-lp-empty">${game.i18n.localize("LANDING.images-empty")}</p>`;

    const count = this.#scanned.filter((p) => enabled.has(p)).length;

    return `
      <div class="form-group">
        <label>${escapeHTML(game.i18n.localize("LANDING.image-folder"))}</label>
        <div class="form-fields">
          <input type="text" name="${KEYS.IMAGE_FOLDER}" value="${escapeHTML(this.#value(KEYS.IMAGE_FOLDER))}"/>
          <button type="button" data-action="rescan" class="dmm-lp-inline">
            <i class="fas fa-rotate"></i> ${game.i18n.localize("LANDING.rescan")}
          </button>
        </div>
        <p class="hint">${game.i18n.localize("LANDING.image-folder-hint")}</p>
      </div>
      <div class="form-group dmm-lp-images-group">
        <label>${escapeHTML(game.i18n.localize("LANDING.images"))}</label>
        <div class="dmm-lp-images">${rows}</div>
        <div class="dmm-lp-image-actions">
          <button type="button" data-action="upload"><i class="fas fa-upload"></i> ${game.i18n.localize("LANDING.upload")}</button>
          <button type="button" data-action="reroll"><i class="fas fa-dice"></i> ${game.i18n.localize("LANDING.reroll")}</button>
          <span class="dmm-lp-count">${game.i18n.format("LANDING.images-count", { count, total: this.#scanned.length })}</span>
        </div>
        <input type="file" class="dmm-lp-file" accept="image/*" hidden/>
      </div>`;
  }

  /** @inheritDoc */
  async _replaceHTML(result, content) {
    await super._replaceHTML(result, content);

    // The hidden file input drives the upload button.
    const file = content.querySelector(".dmm-lp-file");
    file?.addEventListener("change", (ev) => this.#onFileChosen(ev));

    // Keep the "x of y in rotation" counter honest as boxes are ticked.
    content.querySelectorAll(".dmm-lp-image-toggle").forEach((box) => {
      box.addEventListener("change", () => this.#updateCount());
    });
  }

  #updateCount() {
    const boxes = [...this.element.querySelectorAll(".dmm-lp-image-toggle")];
    const label = this.element.querySelector(".dmm-lp-count");
    if (!label) return;
    label.textContent = game.i18n.format("LANDING.images-count", {
      count: boxes.filter((b) => b.checked).length,
      total: boxes.length,
    });
  }

  /** Stash every current form value so a re-render does not discard edits. */
  #readDraft() {
    const draft = {};
    for (const key of this.settingKeys) {
      const el = this.element.querySelector(`[name="${key}"]`);
      if (!el) continue;
      draft[key] = el.type === "checkbox" ? el.checked : el.value;
    }
    const folder = this.element.querySelector(`[name="${KEYS.IMAGE_FOLDER}"]`);
    if (folder) draft[KEYS.IMAGE_FOLDER] = folder.value;
    draft[KEYS.IMAGES] = [...this.element.querySelectorAll(".dmm-lp-image-toggle")]
      .filter((box) => box.checked)
      .map((box) => box.dataset.path);
    this.#draft = draft;
  }

  /** @inheritDoc */
  async _onExtraAction(action) {
    if (action === "rescan") {
      this.#readDraft();
      clearFileCache();
      await this.render();
    } else if (action === "upload") {
      this.element.querySelector(".dmm-lp-file")?.click();
    } else if (action === "reroll") {
      await this.#onReroll();
    }
  }

  async #onFileChosen(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    this.#readDraft();
    const folder = this.#draft[KEYS.IMAGE_FOLDER] || DEFAULTS.IMAGE_FOLDER;
    const path = await uploadTo(folder, file);

    // Tick what was just uploaded — you almost certainly want it in rotation.
    if (path && !this.#draft[KEYS.IMAGES].includes(path)) this.#draft[KEYS.IMAGES].push(path);
    await this.render();
  }

  async #onReroll() {
    // Uses the live form values, so ticking a box and re-rolling works without
    // saving first — and backing out with Cancel still discards the edits.
    this.#readDraft();
    const background = await rerollBackground(this.#draft);
    if (!background) {
      ui.notifications.warn(game.i18n.localize("LANDING.no-images"));
      return;
    }
    ui.notifications.info(game.i18n.format("LANDING.rerolled", { image: basename(background) }));
  }

  /** Write the draft (or the live form) into settings. */
  async #persist() {
    if (!this.#draft) this.#readDraft();
    for (const [key, value] of Object.entries(this.#draft)) {
      if (!foundry.utils.objectsEqual(value, game.settings.get(MODULE, key))) {
        await game.settings.set(MODULE, key, value);
      }
    }
  }

  /** @inheritDoc */
  async _save() {
    this.#readDraft();

    // Capture the world's own background before the first publish overwrites it.
    if (this.#draft[KEYS.ENABLED]) await captureOriginal();

    await this.#persist();
    ui.notifications.info(game.i18n.localize("DMM.SettingsSaved"));

    if (this.#draft[KEYS.ENABLED]) await publishLandingPage({ reroll: false });
    else await restoreOriginal();
  }
}
