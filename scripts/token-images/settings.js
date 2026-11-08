/**
 * Token Images settings.
 *
 * All world settings are registered with `config: false` and surfaced through a
 * single Configure-Settings entry (TokenImagesSettings). The folders the HUD
 * searches live in Image Folders (player-folders), as each kind's Search Folder;
 * this dialog links there and lists what each kind searches.
 */

import CONSTANTS from "../shared/constants.js";
import SettingsGroupDialog, { escapeHTML } from "../shared/settings-dialog.js";
import { KEYS, SEARCH_KINDS } from "../player-folders/keys.js";
import { migrateSearchPaths } from "../player-folders/folders.js";
import { openPlayerFolders } from "../player-folders/settings.js";
import { searchPathsFor, clearSearchCache } from "./search.js";

const MODULE = CONSTANTS.MODULE_NAME;

const TOKEN_IMAGE_KEYS = ["ti-enable-hud", "ti-fuzzy-threshold", "ti-result-limit"];

/**
 * Register all Token Images settings + the single consolidated menu.
 */
export function registerTokenImageSettings() {
  game.settings.registerMenu(MODULE, "token-images-menu", {
    name: "TOKEN-IMAGES.name",
    label: "TOKEN-IMAGES.label",
    hint: "TOKEN-IMAGES.hint",
    icon: "fas fa-images",
    type: TokenImagesSettings,
    restricted: true,
  });

  // The old tagged path list. Only read once, to move it into Image Folders.
  game.settings.register(MODULE, "ti-search-paths", {
    scope: "world",
    config: false,
    type: Array,
    default: [],
  });

  game.settings.register(MODULE, "ti-search-paths-migrated", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
  });

  game.settings.register(MODULE, "ti-enable-hud", {
    name: "TOKEN-IMAGES.enable-hud-name",
    hint: "TOKEN-IMAGES.enable-hud-hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE, "ti-fuzzy-threshold", {
    name: "TOKEN-IMAGES.fuzzy-name",
    hint: "TOKEN-IMAGES.fuzzy-hint",
    scope: "world",
    config: false,
    type: Number,
    range: { min: 0, max: 1, step: 0.05 },
    default: 0.3,
    onChange: () => clearSearchCache(),
  });

  game.settings.register(MODULE, "ti-result-limit", {
    name: "TOKEN-IMAGES.result-limit-name",
    hint: "TOKEN-IMAGES.result-limit-hint",
    scope: "world",
    config: false,
    type: Number,
    default: 100,
  });

  // Optional integration with "Dig Down – Advanced Search" (fuzzy-foundry).
  // Default on; lets the user force the integration off even when installed.
  game.settings.register(MODULE, "ti-use-dig-down", {
    name: "TOKEN-IMAGES.use-dig-down-name",
    hint: "TOKEN-IMAGES.use-dig-down-hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
    onChange: () => clearSearchCache(),
  });
}

/**
 * Move the old search paths into Image Folders, once per world. Run by a GM
 * at ready, since only GMs can write world settings.
 */
export async function migrateOldSearchPaths() {
  if (game.settings.get(MODULE, "ti-search-paths-migrated")) return;
  const old = game.settings.get(MODULE, "ti-search-paths") || [];
  if (old.length) {
    const folders = game.settings.get(MODULE, KEYS.FOLDERS) ?? {};
    await game.settings.set(MODULE, KEYS.FOLDERS, migrateSearchPaths(folders, old));
  }
  await game.settings.set(MODULE, "ti-search-paths-migrated", true);
}

/**
 * Single Configure-Settings entry that opens all Token Images settings, plus a
 * button to Image Folders, where the search folders are set.
 */
class TokenImagesSettings extends SettingsGroupDialog {
  static MODULE = MODULE;
  static SETTING_KEYS = TOKEN_IMAGE_KEYS;
  static DEFAULT_OPTIONS = {
    id: "dmm-token-images-settings",
    classes: ["dmm-quality-of-life"],
    window: { title: "TOKEN-IMAGES.name", icon: "fas fa-images" },
  };

  /** Only surface the Dig Down toggle when that module is actually installed. */
  get settingKeys() {
    const keys = [...TOKEN_IMAGE_KEYS];
    if (game.modules.get("fuzzy-foundry")) keys.push("ti-use-dig-down");
    return keys;
  }

  _extraHTML() {
    return `
			<div class="form-group">
				<label>${game.i18n.localize("TOKEN-IMAGES.search-paths-extra-label")}</label>
				<div class="form-fields">
					<button type="button" data-action="paths"><i class="fas fa-folder-tree"></i> ${game.i18n.localize("TOKEN-IMAGES.search-paths-label")}…</button>
				</div>
			</div>
				<div class="dmm-ti-saved-paths">${this._savedPathsListHTML()}</div>`;
  }

  /** Read-only summary of what each kind searches, for reference. */
  _savedPathsListHTML() {
    const sources = {
      data: game.i18n.localize("PLAYER-FOLDERS.source-data"),
      s3: game.i18n.localize("PLAYER-FOLDERS.source-s3"),
    };
    const items = SEARCH_KINDS.flatMap((kind) => {
      const label = escapeHTML(game.i18n.localize(`PLAYER-FOLDERS.kind-${kind}`));
      const paths = searchPathsFor(kind);
      if (!paths.length) {
        return [`<li><span class="ti-summary-type">${label}</span><span class="ti-summary-source">${escapeHTML(game.i18n.localize("TOKEN-IMAGES.search-paths-empty"))}</span></li>`];
      }
      return paths.map((p) => {
        const source = sources[p.source] ?? p.source ?? "data";
        const where = p.source === "s3" && p.bucket ? `${escapeHTML(p.bucket)}:${escapeHTML(p.text)}` : escapeHTML(p.text);
        return `<li><span class="ti-summary-type">${label}</span><span class="ti-summary-source">${escapeHTML(source)}</span><code>${where}</code></li>`;
      });
    });
    return `<ul class="dmm-ti-path-summary">${items.join("")}</ul>`;
  }

  /** Refresh only the saved-paths summary (called after Image Folders saves). */
  _refreshSavedPaths() {
    const el = this.element?.querySelector(".dmm-ti-saved-paths");
    if (el) el.innerHTML = this._savedPathsListHTML();
  }

  _onExtraAction(action) {
    if (action === "paths") openPlayerFolders({ onSave: () => this._refreshSavedPaths() });
  }
}
