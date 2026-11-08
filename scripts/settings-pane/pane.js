/**
 * The Settings pane: a sidebar tab listing every Configure Settings category,
 * so you can jump straight to one module's settings or open its submenus
 * without going through the modal.
 *
 * The list comes from core's own SettingsConfig, so it shows exactly what the
 * modal would, with the same permission filtering and order. Disabled modules
 * register no settings, so in edit mode they're added from game.modules, with
 * a switch on every module; on/off changes are staged and written together on
 * save.
 */

import { escapeHTML } from "../shared/settings-dialog.js";
import { paneRows, matchesQuery } from "./rows.js";
import { moduleSummary, effectiveState, stageToggle, configurationAfter, disabledRows } from "./modules.js";

const { AbstractSidebarTab } = foundry.applications.sidebar;

/** Sidebar tab id. No hyphen: core strips "active-<tab>" with /active-\w+/. */
export const TAB_NAME = "dmmSettings";

/** Open Configure Settings on one category. */
async function openCategory(id) {
  const sheet = game.settings.sheet;
  await sheet.render({ force: true });
  // initialCategory is cached on the class after the first open, so switch tabs instead.
  try {
    sheet.changeTab(id, "categories");
  } catch (err) {
    console.warn("DMM Quality of Life | Settings pane: no category", id, err);
  }
}

/** Open a registered settings submenu, the way the modal's button does. */
async function openMenu(key) {
  const menu = game.settings.menus.get(key);
  if (!menu) return;
  await new menu.type().render(true);
}

export default class SettingsPane extends AbstractSidebarTab {
  static tabName = TAB_NAME;

  static DEFAULT_OPTIONS = {
    classes: ["dmm-settings-pane"],
    window: { title: "SETTINGS-PANE.title" },
  };

  /** Search text, kept across re-renders. */
  #query = "";

  /** Rows from the last render, indexed by each item's data-index. */
  #rows = [];

  /** Staged module on/off changes (id -> wanted state), written on save. */
  #pending = new Map();

  /** Installed modules, keyed by id. */
  #modules() {
    return new Map(
      Array.from(game.modules.values(), (mod) => {
        const summary = moduleSummary(mod);
        return [summary.id, summary];
      }),
    );
  }

  /** Edit mode: shows the on/off switches and the disabled modules. Not remembered between sessions. */
  #editing = false;

  async _renderHTML() {
    const sheet = game.settings.sheet;
    const categories = await sheet._prepareCategoryData();
    const modules = this.#modules();
    const withSettings = paneRows(categories, (a, b) => sheet._sortCategories(a, b), (text) => game.i18n.localize(text));
    const known = new Set(withSettings.map((row) => row.id));
    // Disabled modules sit among the rest in the modal's order, not after them.
    const disabled = disabledRows(modules.values()).filter((row) => !known.has(row.id));
    this.#rows = [...withSettings, ...disabled].sort((a, b) => sheet._sortCategories(a, b));

    const items = this.#rows.map((row, index) => this.#cardHTML(row, index, modules.get(row.id))).join("");

    return `
      <search class="dmm-settings-pane-search">
        <div class="dmm-settings-pane-search-field">
          <input type="search" name="query" value="${escapeHTML(this.#query)}"
            placeholder="${escapeHTML(game.i18n.localize("SETTINGS-PANE.search"))}"
            aria-label="${escapeHTML(game.i18n.localize("SETTINGS-PANE.search"))}" autocomplete="off" spellcheck="false">
          <button type="button" class="dmm-settings-pane-clear" data-tooltip="${escapeHTML(game.i18n.localize("SETTINGS-PANE.clear-search"))}"
            aria-label="${escapeHTML(game.i18n.localize("SETTINGS-PANE.clear-search"))}"${this.#query ? "" : " hidden"}>
            <i class="fa-solid fa-xmark" inert></i>
          </button>
        </div>
        ${this.#searchButtonsHTML()}
      </search>
      <ol class="dmm-settings-pane-list">${items}</ol>`;
  }

  /** One module block. `summary` is set when the row is an installed module. */
  #cardHTML(row, index, summary) {
    const count = row.settingCount ? `<span class="dmm-settings-pane-count">${row.settingCount}</span>` : "";
    const menus = row.menus
      .map(
        (menu) => `
          <button type="button" class="dmm-settings-pane-menu" data-action="open-menu" data-key="${escapeHTML(menu.key)}">
            <i class="${escapeHTML(menu.icon || "fa-solid fa-sliders")}" inert></i>
            <span>${escapeHTML(menu.label)}</span>
          </button>`,
      )
      .join("");
    // A disabled module has no category to open, so its name is plain text.
    const title = row.disabled
      ? `<span class="dmm-settings-pane-title">${escapeHTML(row.label)}</span>`
      : `<button type="button" class="dmm-settings-pane-open" data-action="open-category" data-category="${escapeHTML(row.id)}">
          <span>${escapeHTML(row.label)}</span>
          ${count}
        </button>`;

    let toggle = "";
    let state = "";
    if (summary) state = ` data-state="${effectiveState(summary, this.#pending) ? "on" : "off"}"`;
    if (summary && this.#editing) {
      const on = effectiveState(summary, this.#pending);
      const label = escapeHTML(game.i18n.format(on ? "SETTINGS-PANE.disable" : "SETTINGS-PANE.enable", { name: row.label }));
      toggle = `
        <button type="button" class="dmm-settings-pane-toggle" data-action="toggle-module" data-module="${escapeHTML(row.id)}"
          data-tooltip="${label}" aria-label="${label}" aria-pressed="${on}">
          <i class="fa-solid ${on ? "fa-toggle-on" : "fa-toggle-off"}" inert></i>
        </button>`;
    }
    const pending = this.#pending.has(row.id) ? " data-pending" : "";

    return `
      <li class="dmm-settings-pane-category" data-index="${index}"${state}${pending}>
        <div class="dmm-settings-pane-header">${title}${toggle}</div>
        ${menus}
      </li>`;
  }

  /** Edit button normally; save and cancel while module changes are staged. */
  #searchButtonsHTML() {
    const tip = (key) => escapeHTML(game.i18n.localize(key));
    if (this.#pending.size) {
      return `
        <button type="button" class="dmm-settings-pane-save" data-action="apply-changes" data-tooltip="${tip("SETTINGS-PANE.save")}" aria-label="${tip("SETTINGS-PANE.save")}">
          <i class="fa-solid fa-floppy-disk" inert></i>
        </button>
        <button type="button" class="dmm-settings-pane-cancel" data-action="cancel-changes" data-tooltip="${tip("SETTINGS-PANE.cancel")}" aria-label="${tip("SETTINGS-PANE.cancel")}">
          <i class="fa-solid fa-xmark" inert></i>
        </button>`;
    }
    const label = tip(this.#editing ? "SETTINGS-PANE.done-editing" : "SETTINGS-PANE.edit");
    return `
      <button type="button" class="dmm-settings-pane-edit" data-action="toggle-edit" data-tooltip="${label}" aria-label="${label}" aria-pressed="${this.#editing}">
        <i class="fa-solid fa-pen" inert></i>
      </button>`;
  }

  async _replaceHTML(result, content) {
    // Re-rendering rebuilds the list, so keep its scroll position.
    const scroll = content.querySelector(".dmm-settings-pane-list")?.scrollTop ?? 0;
    content.innerHTML = result;
    content.querySelectorAll("[data-action]").forEach((el) => {
      el.addEventListener("click", (ev) => this._onAction(ev));
    });
    const search = content.querySelector('input[name="query"]');
    const clear = content.querySelector(".dmm-settings-pane-clear");
    const setQuery = (value) => {
      this.#query = value;
      clear.hidden = !value;
      this.#applyFilter(content);
    };
    search.addEventListener("input", () => setQuery(search.value));
    clear.addEventListener("click", () => {
      search.value = "";
      setQuery("");
      search.focus();
    });
    this.#applyFilter(content);
    content.querySelector(".dmm-settings-pane-list").scrollTop = scroll;
  }

  async _onAction(ev) {
    const { action, category, key, module } = ev.currentTarget.dataset;
    if (action === "open-category") await openCategory(category);
    else if (action === "open-menu") await openMenu(key);
    else if (action === "toggle-module") this.#toggleModule(module);
    else if (action === "toggle-edit") this.#toggleEdit();
    else if (action === "cancel-changes") this.#cancelChanges();
    else if (action === "apply-changes") await this.#applyChanges();
  }

  /** Stage one module on or off, along with its dependencies. */
  #toggleModule(id) {
    const modules = this.#modules();
    const summary = modules.get(id);
    if (!summary) return;
    const result = stageToggle(modules, this.#pending, id, !effectiveState(summary, this.#pending));
    if (result.missing.length) {
      ui.notifications.warn(
        game.i18n.format("SETTINGS-PANE.missing-deps", { name: summary.title, ids: result.missing.join(", ") }),
      );
      return;
    }
    this.#pending = result.pending;
    if (result.changed.length) {
      const names = result.changed.map((other) => modules.get(other).title).join(", ");
      ui.notifications.info(game.i18n.format("SETTINGS-PANE.also-switched", { names }));
    }
    this.render();
  }

  #toggleEdit() {
    this.#editing = !this.#editing;
    this.render();
  }

  #cancelChanges() {
    this.#pending = new Map();
    this.render();
  }

  /** Write the staged changes the way Manage Modules does, then offer a reload. */
  async #applyChanges() {
    const configuration = configurationAfter(this.#modules(), this.#pending);
    try {
      await game.settings.set("core", "moduleConfiguration", configuration);
    } catch (err) {
      console.error("DMM Quality of Life | Settings pane: couldn't save module changes", err);
      ui.notifications.error("SETTINGS-PANE.apply-failed", { localize: true });
      return;
    }
    this.#pending = new Map();
    this.render();
    foundry.applications.settings.SettingsConfig.reloadConfirm({ world: true });
  }

  /** Hide rows that don't match the search box, and disabled modules outside edit mode. */
  #applyFilter(root) {
    for (const li of root.querySelectorAll(".dmm-settings-pane-category")) {
      const row = this.#rows[li.dataset.index];
      li.hidden = (row.disabled && !this.#editing) || !matchesQuery(row, this.#query);
    }
  }
}
