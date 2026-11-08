/**
 * Player Image Folders settings.
 *
 * One Configure-Settings entry opens a dialog with a browse and an upload
 * folder for each kind of image players pick: tokens, sheet images and Tidy
 * sheet headers. Sheet images can also be set per sheet type. Tokens and sheet
 * images also get a Search Folder for the GM's Token HUD image search. Blank
 * means "not set": a kind with no browse folder leaves the picker alone.
 */

import CONSTANTS from "../shared/constants.js";
import SettingsGroupDialog, { escapeHTML } from "../shared/settings-dialog.js";
import { normalizeFolder } from "../shared/files.js";
import { recommendedFolders, hasSearchFolders } from "./folders.js";
import { KEYS, KINDS, SEARCH_KINDS, SHEET_TYPES, TIDY_ID } from "./keys.js";
import { validateSearchPath, clearSearchCache } from "../token-images/search.js";

const MODULE = CONSTANTS.MODULE_NAME;

const tidyActive = () => !!game.modules.get(TIDY_ID)?.active;

/** Label for a sheet type: the system's actor type label, or Items. */
function sheetTypeLabel(type) {
  if (type === "item") return game.i18n.localize("PLAYER-FOLDERS.sheet-item");
  const key = CONFIG.Actor.typeLabels?.[type];
  return key ? game.i18n.localize(key) : type;
}

export function registerPlayerFolderSettings() {
  game.settings.registerMenu(MODULE, "player-folders-menu", {
    name: "PLAYER-FOLDERS.name",
    label: "PLAYER-FOLDERS.label",
    hint: "PLAYER-FOLDERS.hint",
    icon: "fas fa-folder-tree",
    type: PlayerFoldersConfig,
    restricted: true,
  });

  game.settings.register(MODULE, KEYS.FOLDERS, {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange: () => {
      clearSearchCache();
      markUnsetFolders(document);
    },
  });

  Hooks.on("renderSettingsConfig", (app, html) => markUnsetFolders(html));
}

/**
 * In Configure Settings, make the Image Folders button primary and warn
 * beneath it while the Token HUD image search has no folder to look in.
 * Safe to run again: it adds or removes the warning to match the setting.
 * @param {ParentNode} root
 */
function markUnsetFolders(root) {
  const unset = !hasSearchFolders(game.settings.get(MODULE, KEYS.FOLDERS));
  const selector = `button[data-action="openSubmenu"][data-key="${MODULE}.player-folders-menu"]`;
  for (const button of root.querySelectorAll(selector)) {
    button.classList.toggle("bright", unset);
    const group = button.closest(".form-group");
    const next = group?.nextElementSibling;
    const banner = next?.classList.contains("dmm-pf-unset-warning") ? next : null;
    if (!unset) banner?.remove();
    else if (group && !banner) {
      group.insertAdjacentHTML(
        "afterend",
        `<div class="notification warning dmm-pf-unset-warning"><p>${escapeHTML(game.i18n.localize("PLAYER-FOLDERS.unset-warning"))}</p></div>`,
      );
    }
  }
}

/**
 * Open Image Folders, or bring it forward if it's already open.
 * @param {{onSave?: Function}} [options]  onSave runs after a save, e.g. to refresh a summary.
 */
export function openPlayerFolders(options = {}) {
  const open = foundry.applications.instances.get(PlayerFoldersConfig.DEFAULT_OPTIONS.id);
  if (open) return open.bringToFront();
  new PlayerFoldersConfig(options).render(true);
}

class PlayerFoldersConfig extends SettingsGroupDialog {
  static DEFAULT_OPTIONS = {
    id: "dmm-player-folders",
    window: { title: "PLAYER-FOLDERS.name", icon: "fas fa-folder-tree" },
    position: { width: 600, height: "auto" },
  };

  static SETTING_KEYS = [];

  /** Unsaved edits. Adding or removing a search row re-renders from this, so nothing typed is lost. */
  #draft;

  constructor(options = {}) {
    super(options);
    this._onSave = options.onSave;
    this.#draft = foundry.utils.deepClone(game.settings.get(MODULE, KEYS.FOLDERS) ?? {});
  }

  /** One folder input with a folder-picker button. */
  #folderField(entry, field, value, placeholder) {
    const name = `${entry}.${field}`;
    const label = game.i18n.localize(`PLAYER-FOLDERS.${field}`);
    return `
      <div class="form-group">
        <label>${escapeHTML(label)}</label>
        <div class="form-fields">
          <input type="text" name="${escapeHTML(name)}" value="${escapeHTML(value)}" placeholder="${escapeHTML(placeholder)}"/>
          <button type="button" class="icon fa-solid fa-folder-open" data-action="pick" data-target="${escapeHTML(name)}"
            data-tooltip aria-label="${escapeHTML(game.i18n.localize("PLAYER-FOLDERS.pick"))}"></button>
        </div>
      </div>`;
  }

  /** Browse + upload fields for one entry. */
  #pairHTML(entry, placeholders = {}) {
    const saved = this.#draft[entry] ?? {};
    return (
      this.#folderField(entry, "browse", saved.browse, placeholders.browse ?? "") +
      this.#folderField(entry, "upload", saved.upload, placeholders.upload ?? "")
    );
  }

  /** One search path row: source, bucket for S3, path, test status and remove. */
  #searchRowHTML(path, index) {
    const loc = (key) => escapeHTML(game.i18n.localize(`PLAYER-FOLDERS.${key}`));
    const source = path.source ?? "data";
    const options = ["data", "s3"]
      .map((value) => `<option value="${value}" ${source === value ? "selected" : ""}>${loc(`source-${value}`)}</option>`)
      .join("");
    const bucket =
      source === "s3"
        ? `<input type="text" class="dmm-pf-search-bucket" value="${escapeHTML(path.bucket)}" placeholder="${loc("bucket-placeholder")}"/>`
        : "";
    return `
      <div class="dmm-pf-search-row" data-index="${index}">
        <select class="dmm-pf-search-source">${options}</select>
        ${bucket}
        <input type="text" class="dmm-pf-search-text" value="${escapeHTML(path.text)}" placeholder="${loc("path-placeholder")}"/>
        <span class="dmm-pf-search-status"></span>
        <button type="button" class="icon fa-solid fa-trash" data-action="remove-search"
          data-tooltip aria-label="${loc("search-remove")}"></button>
      </div>`;
  }

  /** The Search Folder field: search the browse folder, or a list of paths. */
  #searchHTML(entry) {
    const loc = (key) => escapeHTML(game.i18n.localize(`PLAYER-FOLDERS.${key}`));
    const saved = this.#draft[entry] ?? {};
    const own = saved.searchBrowse === false;
    const list = own
      ? `
        <div class="dmm-pf-search-list">${(saved.search ?? []).map((path, i) => this.#searchRowHTML(path, i)).join("")}</div>
        <div class="dmm-pf-search-actions">
          <button type="button" data-action="add-search"><i class="fas fa-plus"></i> ${loc("search-add")}</button>
          <button type="button" data-action="test-search"><i class="fas fa-vial"></i> ${loc("search-test")}</button>
        </div>`
      : "";
    return `
      <div class="dmm-pf-search" data-entry="${escapeHTML(entry)}">
        <div class="form-group">
          <label>${loc("search")}</label>
          <div class="form-fields">
            <label class="checkbox">
              <input type="checkbox" class="dmm-pf-search-browse" ${own ? "" : "checked"}/> ${loc("search-browse")}
            </label>
          </div>
          <p class="hint">${loc("search-hint")}</p>
        </div>
        ${list}
      </div>`;
  }

  _extraHTML() {
    const kinds = KINDS.filter((kind) => kind !== "header" || tidyActive());

    const sections = kinds
      .map((kind) => {
        let extra = "";
        if (kind === "image") {
          // Blank per-type fields fall back to the Sheet Image defaults above them.
          const fallback = game.i18n.localize("PLAYER-FOLDERS.sheet-default");
          // Skip actor types the installed system lacks (faction is dnd5e 6.1+).
          const types = SHEET_TYPES.filter((type) => type === "item" || type in (CONFIG.Actor.typeLabels ?? {})).map(
            (type) => `
              <fieldset class="dmm-pf-sheet-type">
                <legend>${escapeHTML(sheetTypeLabel(type))}</legend>
                ${this.#pairHTML(`image-${type}`, { browse: fallback, upload: fallback })}
              </fieldset>`,
          ).join("");
          extra = `
            <details class="dmm-pf-sheet-types">
              <summary>${escapeHTML(game.i18n.localize("PLAYER-FOLDERS.sheet-types"))}</summary>
              ${types}
            </details>`;
        }
        return `
          <fieldset>
            <legend>${escapeHTML(game.i18n.localize(`PLAYER-FOLDERS.kind-${kind}`))}</legend>
            <p class="hint">${escapeHTML(game.i18n.localize(`PLAYER-FOLDERS.kind-${kind}-hint`))}</p>
            ${this.#pairHTML(kind)}
            ${SEARCH_KINDS.includes(kind) ? this.#searchHTML(kind) : ""}
            ${extra}
          </fieldset>`;
      })
      .join("");

    const loc = (key) => escapeHTML(game.i18n.localize(`PLAYER-FOLDERS.${key}`));
    return `
      <p class="hint">${loc("dialog-hint")}</p>
      <div class="dmm-pf-presets">
        <button type="button" data-action="clear-all"><i class="fas fa-eraser"></i> ${loc("clear-all")}</button>
        <button type="button" data-action="recommended"><i class="fas fa-wand-magic-sparkles"></i> ${loc("recommended")}</button>
      </div>
      ${sections}`;
  }

  async _replaceHTML(result, content) {
    await super._replaceHTML(result, content);
    content.querySelectorAll(".dmm-pf-search-browse").forEach((el) => {
      el.addEventListener("change", () => this.#onSearchBrowseChange(el));
    });
    // Re-render on source change so the S3 bucket field appears or goes.
    content.querySelectorAll(".dmm-pf-search-source").forEach((el) => {
      el.addEventListener("change", () => {
        this.#syncFromDOM();
        this.render();
      });
    });
  }

  /** A new search row, starting from the browse folder as typed right now. */
  #newSearchRow(entry) {
    return { source: "data", text: normalizeFolder(this.#draft[entry]?.browse) };
  }

  #onSearchBrowseChange(checkbox) {
    this.#syncFromDOM();
    const entry = checkbox.closest(".dmm-pf-search").dataset.entry;
    const draft = this.#draft[entry];
    // Unticking with no rows yet starts one, so there's something to edit.
    if (draft.searchBrowse === false && !draft.search?.length) draft.search = [this.#newSearchRow(entry)];
    this.render();
  }

  /** One search row's values, straight from the DOM. */
  #readSearchRow(row) {
    const path = {
      source: row.querySelector(".dmm-pf-search-source").value,
      text: row.querySelector(".dmm-pf-search-text").value.trim(),
    };
    const bucket = row.querySelector(".dmm-pf-search-bucket");
    if (path.source === "s3" && bucket) path.bucket = bucket.value.trim();
    return path;
  }

  /** Copy every field into the draft, ahead of a re-render or save. */
  #syncFromDOM() {
    for (const input of this.element.querySelectorAll('input[type="text"][name]')) {
      const [entry, field] = input.name.split(".");
      (this.#draft[entry] ??= {})[field] = input.value;
    }
    for (const block of this.element.querySelectorAll(".dmm-pf-search")) {
      const draft = (this.#draft[block.dataset.entry] ??= {});
      // Rows stay in the draft while ticked, so unticking again brings them back.
      if (block.querySelector(".dmm-pf-search-browse").checked) {
        delete draft.searchBrowse;
        continue;
      }
      draft.searchBrowse = false;
      if (block.querySelector(".dmm-pf-search-list")) {
        draft.search = Array.from(block.querySelectorAll(".dmm-pf-search-row"), (row) => this.#readSearchRow(row));
      }
    }
  }

  /** Count the media under each row's path and show it beside the row. */
  async #testSearchRows(block) {
    const show = (row, state, key, data) => {
      const el = row.querySelector(".dmm-pf-search-status");
      el.className = `dmm-pf-search-status dmm-pf-search-${state}`;
      el.textContent = data ? game.i18n.format(key, data) : game.i18n.localize(key);
    };
    const rows = Array.from(block.querySelectorAll(".dmm-pf-search-row"));
    await Promise.all(
      rows.map(async (row) => {
        const path = this.#readSearchRow(row);
        if (!path.text) return show(row, "bad", "PLAYER-FOLDERS.test-empty");
        show(row, "checking", "PLAYER-FOLDERS.test-checking");
        const res = await validateSearchPath(path);
        if (res.ok) {
          const key = res.capped ? "PLAYER-FOLDERS.test-found-capped" : "PLAYER-FOLDERS.test-found";
          show(row, "ok", key, { count: res.count });
        } else {
          const key = res.error === "not-found" ? "PLAYER-FOLDERS.test-not-found" : "PLAYER-FOLDERS.test-empty";
          show(row, "bad", key);
        }
      }),
    );
  }

  async _onExtraAction(action, ev) {
    const { target } = ev.currentTarget.dataset;
    const entry = ev.currentTarget.closest(".dmm-pf-search")?.dataset.entry;
    if (action === "pick") {
      const input = this.element.querySelector(`input[name="${target}"]`);
      const fp = new foundry.applications.apps.FilePicker.implementation({
        type: "folder",
        current: input.value,
        callback: (path) => (input.value = normalizeFolder(path)),
      });
      fp.browse();
    } else if (action === "add-search") {
      this.#syncFromDOM();
      (this.#draft[entry].search ??= []).push(this.#newSearchRow(entry));
      this.render();
    } else if (action === "remove-search") {
      this.#syncFromDOM();
      const index = Number(ev.currentTarget.closest(".dmm-pf-search-row").dataset.index);
      this.#draft[entry].search.splice(index, 1);
      this.render();
    } else if (action === "test-search") {
      // No re-render, so the counts show beside the rows as typed.
      await this.#testSearchRows(ev.currentTarget.closest(".dmm-pf-search"));
    } else if (action === "recommended") {
      await this.#replaceDraft("recommended", recommendedFolders());
    } else if (action === "clear-all") {
      await this.#replaceDraft("clear-all", {});
    }
  }

  /**
   * Swap every field for a preset after the GM confirms. Like any edit here,
   * nothing is stored until Save.
   */
  async #replaceDraft(preset, config) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize(`PLAYER-FOLDERS.${preset}`) },
      content: `<p>${escapeHTML(game.i18n.localize(`PLAYER-FOLDERS.${preset}-confirm`))}</p>`,
    });
    if (!confirmed) return;
    this.#draft = config;
    this.render();
  }

  async _save() {
    this.#syncFromDOM();
    // The draft started from the saved setting, so entries for kinds hidden
    // right now (Tidy inactive) are kept instead of wiped.
    const config = {};
    for (const [entry, value] of Object.entries(this.#draft)) {
      const out = {};
      for (const field of ["browse", "upload"]) {
        const folder = normalizeFolder(value[field]);
        if (folder) out[field] = folder;
      }
      if (value.searchBrowse === false) {
        out.searchBrowse = false;
        out.search = (value.search ?? [])
          .filter((path) => path.text)
          .map((path) => (path.source === "data" ? { ...path, text: normalizeFolder(path.text) } : path));
      }
      if (Object.keys(out).length) config[entry] = out;
    }
    await game.settings.set(MODULE, KEYS.FOLDERS, config);
    ui.notifications.info(game.i18n.localize("DMM.SettingsSaved"));
    this._onSave?.();
  }
}
