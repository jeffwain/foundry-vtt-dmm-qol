/**
 * Sidebar Tweaks — one Configure Settings menu for small sidebar features that
 * live in other modules (e.g. Group Rolls' chat card extras, Placeables Tab clicks). Registered right
 * after the Sidebar Tabs menu so it sits under it in the list.
 *
 * Each feature still registers its own setting (config: false); this dialog
 * just shows them together.
 */

import CONSTANTS from "../shared/constants.js";
import SettingsGroupDialog from "../shared/settings-dialog.js";
import { KEYS as GROUP_ROLLS_KEYS } from "../group-rolls/keys.js";
import { KEYS as PLACEABLES_TAB_KEYS } from "../placeables-tab/keys.js";

const MODULE = CONSTANTS.MODULE_NAME;

class SidebarTweaksConfig extends SettingsGroupDialog {
	static MODULE = MODULE;
	static SETTING_KEYS = [
		GROUP_ROLLS_KEYS.ENABLED,
		PLACEABLES_TAB_KEYS.CENTER_ON_CLICK,
		PLACEABLES_TAB_KEYS.MIDDLE_CLICK_SHEET,
	];
	static DEFAULT_OPTIONS = {
		id: "dmm-sidebar-tweaks",
		classes: ["dmm-quality-of-life"],
		window: { title: "SIDEBAR-TWEAKS.name", icon: "fa-solid fa-sliders" },
	};
}

export function registerSidebarTweaksMenu() {
	game.settings.registerMenu(MODULE, "sidebar-tweaks-menu", {
		name: "SIDEBAR-TWEAKS.name",
		label: "SIDEBAR-TWEAKS.label",
		hint: "SIDEBAR-TWEAKS.hint",
		icon: "fa-solid fa-sliders",
		type: SidebarTweaksConfig,
		// GM only, because Group Rolls is world scope. The Placeables Tab ones
		// are per client, but that tab is mainly a GM tool.
		restricted: true,
	});
}
