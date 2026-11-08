/**
 * SettingsGroupDialog — a reusable settings menu window.
 *
 * Each "module" in this package collapses its world settings into a single
 * entry in Foundry's Configure Settings list (a button that opens this dialog).
 * The dialog is introspection-based: subclasses just declare which setting keys
 * to show, and the controls are generated from each setting's registered
 * metadata (name, hint, type, choices, range). On save it writes back through
 * game.settings.set, so each setting's onChange handler still fires.
 *
 * Subclass contract:
 *   static MODULE        – settings namespace (defaults to this package)
 *   static SETTING_KEYS  – ordered array of setting keys to render
 *   static DEFAULT_OPTIONS.window.title / id  – window chrome
 *   _extraHTML()         – optional extra content (e.g. a sub-dialog button)
 *   _onExtraAction(a)    – optional handler for data-action buttons in extras
 */

import CONSTANTS from "./constants.js";

const { ApplicationV2 } = foundry.applications.api;

export function escapeHTML(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Resolve a setting label/hint that may be an i18n key or plain text. */
function localizeText(text) {
  if (!text) return "";
  return game.i18n.has(text) ? game.i18n.localize(text) : text;
}

export default class SettingsGroupDialog extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["dmm-quality-of-life"],
    window: { resizable: true },
    position: { width: 520, height: "auto" },
  };

  static MODULE = CONSTANTS.MODULE_NAME;
  static SETTING_KEYS = [];

  get module() {
    return this.constructor.MODULE;
  }

  get settingKeys() {
    return this.constructor.SETTING_KEYS;
  }

  /** Build the control + label markup for a single registered setting. */
  _controlHTML(key) {
    const cfg = game.settings.settings.get(`${this.module}.${key}`);
    if (!cfg) return "";

    const value = this._currentValue(key);
    const hint = cfg.hint ? `<p class="hint">${escapeHTML(localizeText(cfg.hint))}</p>` : "";

    let control;
    if (cfg.choices) {
      const entries = Array.isArray(cfg.choices)
        ? cfg.choices.map((label, i) => [String(i), label])
        : Object.entries(cfg.choices);
      const opts = entries
        .map(([v, label]) => `<option value="${escapeHTML(v)}" ${String(value) === v ? "selected" : ""}>${escapeHTML(localizeText(label))}</option>`)
        .join("");
      control = `<select name="${key}">${opts}</select>`;
    } else if (cfg.type === Boolean) {
      control = `<input type="checkbox" name="${key}" ${value ? "checked" : ""}/>`;
    } else if (cfg.type === Number) {
      const r = cfg.range;
      // Ranged numbers get core's slider + number box, as in Configure Settings.
      control = r
        ? `<range-picker name="${key}" value="${escapeHTML(value)}" min="${r.min}" max="${r.max}" step="${r.step}"></range-picker>`
        : `<input type="number" name="${key}" value="${escapeHTML(value)}" step="any"/>`;
    } else {
      control = `<input type="text" name="${key}" value="${escapeHTML(value)}"/>`;
    }

    return `
			<div class="form-group">
				<label>${escapeHTML(localizeText(cfg.name ?? key))}</label>
				<div class="form-fields">${control}</div>
				${hint}
			</div>`;
  }

  async _renderHTML() {
    const rows = this.settingKeys.map((k) => this._controlHTML(k)).join("");
    return `
			<div class="standard-form">${rows}${this._extraHTML()}</div>
			<footer class="form-footer">
				<button type="button" data-action="cancel"><i class="fas fa-close"></i> ${game.i18n.localize("DMM.Cancel")}</button>
				<button type="submit" data-action="save"><i class="fas fa-save"></i> ${game.i18n.localize("DMM.Save")}</button>
			</footer>`;
  }

  /** Optional extra markup (buttons/content) appended after the settings rows. */
  _extraHTML() {
    return "";
  }

  async _replaceHTML(result, content) {
    content.innerHTML = result;
    content.querySelectorAll("[data-action]").forEach((el) => {
      el.addEventListener("click", (ev) => this._onAction(ev));
    });
  }

  async _onAction(ev) {
    const action = ev.currentTarget.dataset.action;
    if (action === "save") {
      await this._save();
      this.close();
    } else if (action === "cancel") {
      this.close();
    } else {
      await this._onExtraAction?.(action, ev);
    }
  }

  async _save() {
    for (const key of this.settingKeys) {
      const el = this.element.querySelector(`[name="${key}"]`);
      if (!el) continue;
      const cfg = game.settings.settings.get(`${this.module}.${key}`);
      let value;
      if (el.type === "checkbox") value = el.checked;
      else if (cfg?.type === Number) value = Number(el.value);
      else value = el.value;
      if (!foundry.utils.objectsEqual(value, this._currentValue(key))) {
        await this._commit(key, value);
      }
    }
    ui.notifications.info(game.i18n.localize("DMM.SettingsSaved"));
  }

  /** The value shown for a key. Override when a user sees something other than the setting itself. */
  _currentValue(key) {
    return game.settings.get(this.module, key);
  }

  /** Store a changed value. Override to write somewhere other than the setting itself. */
  async _commit(key, value) {
    await game.settings.set(this.module, key, value);
  }
}
