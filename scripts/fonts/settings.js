/**
 * Fonts settings.
 *
 * One Configure-Settings entry opens a dialog that lists the font files in a
 * folder in a table. The Custom column switches a font on for this module:
 * enabled fonts can be picked for each character (their Tidy sheet header,
 * owned item titles and token nameplate), the pause caption and the X-Card.
 * The Core column adds or removes the file in Foundry's own font list, which
 * is what text editors, drawings and map notes offer.
 *
 * Every control saves as soon as it changes, so the dialog has no Save button.
 * Fonts are on unless unticked: the dialog stores what was switched off and
 * resolves the enabled list from each folder scan.
 */

import CONSTANTS from "../shared/constants.js";
import SettingsGroupDialog, { escapeHTML } from "../shared/settings-dialog.js";
import { basename, scanFonts, clearFileCache } from "../shared/files.js";
import { DEFAULTS, KEYS } from "./keys.js";
import { addCoreFont, coreFontPaths, enabledFonts, familyFromFilename, fontDefinitionsFor, removeCoreFont } from "./render.js";
import { coreFamilies, scheduleRefresh } from "./apply.js";
import { KEYS as X_CARD_KEYS } from "../x-card/keys.js";

const MODULE = CONSTANTS.MODULE_NAME;

function setting(key) {
  return game.settings.get(MODULE, key);
}

function save(key, value) {
  return game.settings.set(MODULE, key, value);
}

/**
 * Register the Fonts settings and menu.
 */
export function registerFontsSettings() {
  game.settings.registerMenu(MODULE, "fonts-menu", {
    name: "FONTS.name",
    label: "FONTS.label",
    hint: "FONTS.hint",
    icon: "fas fa-font",
    type: FontsConfig,
    restricted: true,
  });

  const world = (key, type, initial, onChange) =>
    game.settings.register(MODULE, key, { scope: "world", config: false, type, default: initial, onChange });

  world(KEYS.FOLDER, String, DEFAULTS.FOLDER);
  world(KEYS.ENABLED, Array, [], scheduleRefresh);
  world(KEYS.DISABLED, Array, []);
  world(KEYS.CHARACTERS, Object, {}, scheduleRefresh);
  world(KEYS.CHARACTER_DEFAULT, String, "", scheduleRefresh);
  world(KEYS.PAUSE, String, "", scheduleRefresh);
  // Changes which fonts are registered, so it refreshes.
  world(KEYS.X_CARD, Array, [], scheduleRefresh);
}

/** Keep an open Fonts dialog's Core column in step with core's font list. */
function onSettingChange(setting) {
  if (setting.key === "core.fonts") foundry.applications.instances.get("dmm-fonts")?.syncCoreFonts?.();
}
Hooks.on("createSetting", onSettingChange);
Hooks.on("updateSetting", onSettingChange);

/** Families already loaded for the dialog's previews. */
const previewed = new Set();

/**
 * Load a font so its name can be shown in its own face. Fire and forget: the
 * label swaps over once the file arrives. Families core defines are skipped so
 * a folder file can't add faces to Foundry's own fonts, and so are those in
 * core's font list, which core has loaded already.
 */
function loadPreview(path, core) {
  const family = familyFromFilename(path);
  if (!family || previewed.has(family) || family in CONFIG.fontDefinitions || core.has(family)) return;
  previewed.add(family);
  foundry.applications.settings.menus.FontConfig.loadFont(family, { fonts: [{ urls: [path] }] });
}

/**
 * The Fonts dialog.
 */
class FontsConfig extends SettingsGroupDialog {
  static DEFAULT_OPTIONS = {
    id: "dmm-fonts",
    window: { title: "FONTS.name", icon: "fas fa-font" },
    position: { width: 560, height: "auto" },
  };

  // Every control here is custom, built in _renderHTML.
  static SETTING_KEYS = [];

  /** Font files found in the configured folder, refreshed on each render. */
  #scanned = [];

  /** Paths the user switched off. Kept locally so quick clicks don't read a stale setting. */
  #disabled = new Set();

  /** Families ticked for the X-Card, kept locally for the same reason. */
  #xCard = new Set();

  /** Core's font list as last written here, for the same reason. */
  #core = {};

  /** Whether this dialog changed core's font list, so closing offers a reload. */
  #coreChanged = false;

  /** Writes to core's font list still in flight from this dialog. */
  #coreWrites = 0;

  /**
   * Core's font list changed, perhaps from Foundry's own dialog. Re-read it so
   * the next tick here doesn't write over that change.
   */
  syncCoreFonts() {
    if (this.#coreWrites || !this.rendered) return;
    this.#core = game.settings.get("core", "fonts") ?? {};
    const inCore = coreFontPaths(this.#core);
    for (const box of this.element.querySelectorAll(".dmm-fonts-core-toggle")) box.checked = inCore.has(box.dataset.path);
    this.#syncAllBoxes();
  }

  /** @inheritDoc */
  async _renderHTML() {
    this.#scanned = await scanFonts(setting(KEYS.FOLDER) || DEFAULTS.FOLDER);
    const core = coreFamilies();
    this.#scanned.forEach((path) => loadPreview(path, core));
    this.#core = game.settings.get("core", "fonts") ?? {};
    this.#disabled = new Set(setting(KEYS.DISABLED) ?? []);
    this.#xCard = new Set(setting(KEYS.X_CARD) ?? []);

    // New files in the folder arrive enabled; record the resolved list.
    const enabled = enabledFonts(this.#scanned, [...this.#disabled]);
    if (!foundry.utils.objectsEqual(enabled, setting(KEYS.ENABLED) ?? [])) await save(KEYS.ENABLED, enabled);

    return `
      <div class="standard-form">${this.#folderHTML()}${this.#charactersHTML()}${this.#otherHTML()}${this.#xCardHTML()}</div>
      <footer class="form-footer dmm-fonts-footer">
        <button type="button" data-action="reset"><i class="fas fa-arrow-rotate-left"></i> ${game.i18n.localize("FONTS.reset")}</button>
        <button type="button" data-action="done"><i class="fas fa-check"></i> ${game.i18n.localize("FONTS.done")}</button>
      </footer>`;
  }

  /** Families on offer in the pickers: the enabled fonts. */
  #families() {
    const enabled = enabledFonts(this.#scanned, [...this.#disabled]);
    return [...fontDefinitionsFor(enabled).keys()].sort((a, b) => a.localeCompare(b));
  }

  #optionsHTML(selected, families = this.#families(), emptyLabel = game.i18n.localize("FONTS.default")) {
    return [`<option value="">${escapeHTML(emptyLabel)}</option>`]
      .concat(
        families.map((family) => {
          const on = family === selected ? " selected" : "";
          return `<option value="${escapeHTML(family)}"${on}>${escapeHTML(family)}</option>`;
        }),
      )
      .join("");
  }

  #folderHTML() {
    const list = this.#scanned.length
      ? this.#tableHTML()
      : `<p class="hint">${game.i18n.localize("FONTS.files-empty")}</p>`;

    return `
      <div class="form-group">
        <label>${escapeHTML(game.i18n.localize("FONTS.folder"))}</label>
        <div class="form-fields">
          <input type="text" name="${KEYS.FOLDER}" value="${escapeHTML(setting(KEYS.FOLDER))}"/>
          <button type="button" data-action="rescan" class="dmm-fonts-inline">
            <i class="fas fa-rotate"></i> ${game.i18n.localize("FONTS.rescan")}
          </button>
        </div>
        <p class="hint">${game.i18n.localize("FONTS.folder-hint")}</p>
      </div>
      <div class="dmm-fonts-files-group">
        <div class="dmm-fonts-files-heading">
          <label>${escapeHTML(game.i18n.localize("FONTS.files"))}</label>
          <a data-action="open-core"><i class="fas fa-up-right-from-square"></i> ${escapeHTML(game.i18n.localize("FONTS.open-core"))}</a>
        </div>
        <div class="dmm-fonts-files dmm-fonts-scroll">${list}</div>
        <p class="hint">${escapeHTML(game.i18n.localize("FONTS.files-hint"))}</p>
      </div>`;
  }

  /** One row per file: its name in its own face, then the Custom and Core boxes. */
  #tableHTML() {
    const t = (key) => escapeHTML(game.i18n.localize(key));
    const inCore = coreFontPaths(this.#core);
    const rows = this.#scanned
      .map((path) => {
        const family = familyFromFilename(path);
        const p = escapeHTML(path);
        return `
          <tr>
            <td class="dmm-fonts-name" data-tooltip="${escapeHTML(basename(path))}">
              <span style="${escapeHTML(`font-family: "${family}"`)}">${escapeHTML(family)}</span>
            </td>
            <td class="dmm-fonts-box"><input type="checkbox" class="dmm-fonts-toggle" data-path="${p}" ${this.#disabled.has(path) ? "" : "checked"}/></td>
            <td class="dmm-fonts-box"><input type="checkbox" class="dmm-fonts-core-toggle" data-path="${p}" ${inCore.has(path) ? "checked" : ""}/></td>
          </tr>`;
      })
      .join("");
    // The All boxes' checked/indeterminate state is set by #syncAllBoxes after render.
    return `
      <table class="dmm-fonts-table">
        <thead>
          <tr>
            <th>${t("FONTS.column-font")}</th>
            <th class="dmm-fonts-box" data-tooltip="${t("FONTS.column-custom-hint")}">${t("FONTS.column-custom")}</th>
            <th class="dmm-fonts-box" data-tooltip="${t("FONTS.column-core-hint")}">${t("FONTS.column-core")}</th>
          </tr>
        </thead>
        <tbody>
          <tr class="dmm-fonts-all-row">
            <td>${t("FONTS.all")}</td>
            <td class="dmm-fonts-box"><input type="checkbox" class="dmm-fonts-custom-all"/></td>
            <td class="dmm-fonts-box"><input type="checkbox" class="dmm-fonts-core-all"/></td>
          </tr>
          ${rows}
        </tbody>
      </table>`;
  }

  #charactersHTML() {
    const assigned = setting(KEYS.CHARACTERS) ?? {};
    const characters = game.actors
      .filter((actor) => actor.type === "character")
      .sort((a, b) => a.name.localeCompare(b.name));

    const optionsBySelected = new Map();
    const families = this.#families();
    const getOptions = (sel = "") => {
      if (!optionsBySelected.has(sel)) optionsBySelected.set(sel, this.#optionsHTML(sel, families));
      return optionsBySelected.get(sel);
    };

    const rows = characters.length
      ? `<div class="dmm-fonts-characters dmm-fonts-scroll">${characters
          .map(
            (actor) => `
        <div class="form-group">
          <label>${escapeHTML(actor.name)}</label>
          <div class="form-fields">
            <select class="dmm-fonts-select dmm-fonts-character" data-actor="${escapeHTML(actor.id)}">${getOptions(assigned[actor.id] ?? "")}</select>
          </div>
        </div>`,
          )
          .join("")}</div>`
      : `<p class="hint">${game.i18n.localize("FONTS.characters-empty")}</p>`;

    return `
      <fieldset>
        <legend>${escapeHTML(game.i18n.localize("FONTS.characters"))}</legend>
        <p class="hint">${escapeHTML(game.i18n.localize("FONTS.characters-hint"))}</p>
        ${this.#characterDefaultHTML(families)}
        ${rows}
      </fieldset>`;
  }

  /** The font every character gets unless they have their own pick. */
  #characterDefaultHTML(families = this.#families()) {
    return `
      <div class="form-group dmm-fonts-character-default">
        <label>${escapeHTML(game.i18n.localize("FONTS.character-default"))}</label>
        <div class="form-fields">
          <select class="dmm-fonts-select" name="${KEYS.CHARACTER_DEFAULT}">${this.#characterDefaultOptionsHTML(setting(KEYS.CHARACTER_DEFAULT), families)}</select>
        </div>
      </div>`;
  }

  /** The empty choice names the font the system actually shows, rather than "(default)". */
  #characterDefaultOptionsHTML(selected, families) {
    return this.#optionsHTML(selected, families, DEFAULTS.SYSTEM_NAME_FONT);
  }

  #otherHTML() {
    return `
      <fieldset>
        <legend>${escapeHTML(game.i18n.localize("FONTS.other"))}</legend>
        <div class="form-group">
          <label>${escapeHTML(game.i18n.localize("FONTS.pause"))}</label>
          <div class="form-fields">
            <select class="dmm-fonts-select" name="${KEYS.PAUSE}">${this.#optionsHTML(setting(KEYS.PAUSE))}</select>
          </div>
        </div>
      </fieldset>`;
  }

  /** Shown only while the X-Card button is turned on. */
  #xCardHTML() {
    if (!game.settings.get(MODULE, X_CARD_KEYS.ENABLED)) return "";
    return `
      <fieldset>
        <legend>${escapeHTML(game.i18n.localize("FONTS.x-card"))}</legend>
        <p class="hint">${game.i18n.localize("FONTS.x-card-hint")}</p>
        <div class="dmm-fonts-files dmm-fonts-scroll dmm-fonts-x-card">${this.#xCardRowsHTML()}</div>
      </fieldset>`;
  }

  #xCardRowsHTML(families = this.#families()) {
    if (!families.length) return `<p class="hint">${game.i18n.localize("FONTS.x-card-empty")}</p>`;
    // Its checked/indeterminate state is set by #syncXCardAll after render.
    const all = `
      <label class="dmm-fonts-file dmm-fonts-all">
        <input type="checkbox" class="dmm-fonts-x-card-all"/>
        <span>${escapeHTML(game.i18n.localize("FONTS.all"))}</span>
      </label>`;
    return all + families
      .map((family) => {
        const on = this.#xCard.has(family) ? "checked" : "";
        return `
          <label class="dmm-fonts-file">
            <input type="checkbox" class="dmm-fonts-x-card-toggle" data-family="${escapeHTML(family)}" ${on}/>
            <span style="${escapeHTML(`font-family: "${family}"`)}">${escapeHTML(family)}</span>
          </label>`;
      })
      .join("");
  }

  /** @inheritDoc */
  async _replaceHTML(result, content) {
    await super._replaceHTML(result, content);

    content.querySelector(".dmm-fonts-table")?.addEventListener("change", (ev) => {
      const box = ev.target;
      if (box.matches(".dmm-fonts-toggle")) this.#onToggle(box);
      else if (box.matches(".dmm-fonts-core-toggle")) this.#onCore(box);
      else if (box.matches(".dmm-fonts-custom-all")) this.#onCustomAll(box.checked);
      else if (box.matches(".dmm-fonts-core-all")) this.#onCoreAll(box.checked);
    });
    this.#syncAllBoxes(content);
    content.querySelectorAll(".dmm-fonts-character").forEach((select) => {
      select.addEventListener("change", () => this.#onCharacter(select));
    });
    content
      .querySelector(`[name="${KEYS.CHARACTER_DEFAULT}"]`)
      ?.addEventListener("change", (ev) => save(KEYS.CHARACTER_DEFAULT, ev.currentTarget.value));
    content.querySelector(`[name="${KEYS.PAUSE}"]`)?.addEventListener("change", (ev) => save(KEYS.PAUSE, ev.currentTarget.value));
    // Delegated, because #refreshPickers rebuilds these rows.
    content.querySelector(".dmm-fonts-x-card")?.addEventListener("change", (ev) => {
      if (ev.target.closest(".dmm-fonts-x-card-all")) return this.#onXCardAll(ev.target.checked);
      const box = ev.target.closest(".dmm-fonts-x-card-toggle");
      if (box) this.#onXCard(box);
    });
    this.#syncXCardAll(content);
    content.querySelector(`[name="${KEYS.FOLDER}"]`)?.addEventListener("change", (ev) => this.#onFolder(ev.currentTarget.value));
  }

  #onToggle(box) {
    if (box.checked) this.#disabled.delete(box.dataset.path);
    else this.#disabled.add(box.dataset.path);
    return this.#saveCustom();
  }

  /** Switch every font on or off for this module. */
  #onCustomAll(checked) {
    for (const box of this.element.querySelectorAll(".dmm-fonts-toggle")) {
      box.checked = checked;
      if (checked) this.#disabled.delete(box.dataset.path);
      else this.#disabled.add(box.dataset.path);
    }
    return this.#saveCustom();
  }

  async #saveCustom() {
    this.#syncAllBoxes();
    this.#refreshPickers();
    await save(KEYS.DISABLED, [...this.#disabled]);
    await save(KEYS.ENABLED, enabledFonts(this.#scanned, [...this.#disabled]));
  }

  #onCore(box) {
    return this.#saveCore([box]);
  }

  /** Add every file to core's font list, or take them all out. */
  #onCoreAll(checked) {
    const boxes = [...this.element.querySelectorAll(".dmm-fonts-core-toggle")];
    for (const box of boxes) box.checked = checked;
    return this.#saveCore(boxes);
  }

  /**
   * Write the given boxes' state into core's font list. Added fonts are loaded
   * straight away, as core's own dialog does, so this client's editors offer
   * them before the reload.
   */
  async #saveCore(boxes) {
    let core = this.#core;
    const added = [];
    for (const box of boxes) {
      const path = box.dataset.path;
      const next = box.checked ? addCoreFont(core, familyFromFilename(path), path) : removeCoreFont(core, path);
      if (next === core) continue;
      if (box.checked) added.push(path);
      core = next;
    }
    this.#syncAllBoxes();
    if (core === this.#core) return;
    this.#core = core;
    this.#coreChanged = true;
    this.#coreWrites++;
    try {
      await game.settings.set("core", "fonts", core);
    } finally {
      this.#coreWrites--;
    }
    const { FontConfig } = foundry.applications.settings.menus;
    for (const path of added) FontConfig.loadFont(familyFromFilename(path), { editor: true, fonts: [{ urls: [path] }] });
  }

  /** Each All box is checked when every box below it is, a dash when only some are. */
  #syncAllBoxes(root = this.element) {
    const sync = (allSelector, boxSelector) => {
      const all = root.querySelector(allSelector);
      if (!all) return;
      const boxes = [...root.querySelectorAll(boxSelector)];
      const ticked = boxes.filter((box) => box.checked).length;
      all.checked = ticked > 0 && ticked === boxes.length;
      all.indeterminate = ticked > 0 && ticked < boxes.length;
    };
    sync(".dmm-fonts-custom-all", ".dmm-fonts-toggle");
    sync(".dmm-fonts-core-all", ".dmm-fonts-core-toggle");
  }

  /**
   * Rebuild every picker's options from the enabled fonts. A picker whose font
   * was just switched off shows "(default)", but the assignment is kept, so
   * ticking the font again brings it back.
   */
  #refreshPickers() {
    const families = this.#families();
    const assigned = setting(KEYS.CHARACTERS) ?? {};
    for (const select of this.element.querySelectorAll(".dmm-fonts-select")) {
      if (select.name === KEYS.CHARACTER_DEFAULT) {
        select.innerHTML = this.#characterDefaultOptionsHTML(setting(KEYS.CHARACTER_DEFAULT), families);
        continue;
      }
      const saved = select.dataset.actor ? assigned[select.dataset.actor] : setting(KEYS.PAUSE);
      select.innerHTML = this.#optionsHTML(saved, families);
    }
    const xCard = this.element.querySelector(".dmm-fonts-x-card");
    if (xCard) xCard.innerHTML = this.#xCardRowsHTML(families);
    this.#syncXCardAll();
  }

  #onXCard(box) {
    if (box.checked) this.#xCard.add(box.dataset.family);
    else this.#xCard.delete(box.dataset.family);
    this.#syncXCardAll();
    return save(KEYS.X_CARD, [...this.#xCard]);
  }

  /** Tick or untick every listed X-Card font. */
  #onXCardAll(checked) {
    for (const box of this.element.querySelectorAll(".dmm-fonts-x-card-toggle")) {
      box.checked = checked;
      if (checked) this.#xCard.add(box.dataset.family);
      else this.#xCard.delete(box.dataset.family);
    }
    this.#syncXCardAll();
    return save(KEYS.X_CARD, [...this.#xCard]);
  }

  /** Checked when every font is ticked, a dash when only some are. */
  #syncXCardAll(root = this.element) {
    const all = root.querySelector(".dmm-fonts-x-card-all");
    if (!all) return;
    const boxes = [...root.querySelectorAll(".dmm-fonts-x-card-toggle")];
    const ticked = boxes.filter((box) => box.checked).length;
    all.checked = ticked > 0 && ticked === boxes.length;
    all.indeterminate = ticked > 0 && ticked < boxes.length;
  }

  #onCharacter(select) {
    const characters = { ...(setting(KEYS.CHARACTERS) ?? {}) };
    if (select.value) characters[select.dataset.actor] = select.value;
    else delete characters[select.dataset.actor];
    return save(KEYS.CHARACTERS, characters);
  }

  async #onFolder(folder) {
    await save(KEYS.FOLDER, folder.trim() || DEFAULTS.FOLDER);
    await this.render();
  }

  async #onReset() {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("FONTS.reset") },
      content: `<p>${game.i18n.localize("FONTS.reset-confirm")}</p>`,
    });
    if (!confirmed) return;

    await save(KEYS.FOLDER, DEFAULTS.FOLDER);
    await save(KEYS.DISABLED, []);
    await save(KEYS.CHARACTERS, {});
    await save(KEYS.CHARACTER_DEFAULT, "");
    await save(KEYS.PAUSE, "");
    await save(KEYS.X_CARD, []);
    clearFileCache();
    await this.render();
  }

  /** @inheritDoc */
  async _onExtraAction(action) {
    if (action === "rescan") {
      clearFileCache();
      await this.render();
    } else if (action === "reset") {
      await this.#onReset();
    } else if (action === "done") {
      await this.close();
    } else if (action === "open-core") {
      new foundry.applications.settings.menus.FontConfig().render({ force: true });
    }
  }

  /** Other clients read core's font list once per page load, so offer a reload. */
  async close(options) {
    const result = await super.close(options);
    if (this.#coreChanged) {
      this.#coreChanged = false;
      await foundry.applications.settings.SettingsConfig.reloadConfirm({ world: true });
    }
    return result;
  }
}
