/**
 * Activity Defaults — tweaks to dnd5e's activity usage dialog.
 *
 * Leaves the "Place Measured Template" box unchecked by default when an item
 * or spell is used. dnd5e fills `usageConfig.create.measuredTemplate` with
 * `??=` before firing `dnd5e.preUseActivity`, so we overwrite it here and the
 * dialog renders with the box unchecked. Users can still tick it manually.
 */

import CONSTANTS from "../shared/constants.js";

const SETTING_KEY = "ad-template-unchecked";

Hooks.once("init", () => {
	game.settings.register(CONSTANTS.MODULE_NAME, SETTING_KEY, {
		name: "ACTIVITY-DEFAULTS.template-unchecked-name",
		hint: "ACTIVITY-DEFAULTS.template-unchecked-hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
	});
});

Hooks.on("dnd5e.preUseActivity", (activity, usageConfig) => {
	if (!game.settings.get(CONSTANTS.MODULE_NAME, SETTING_KEY)) return;
	if (!activity.target?.template?.type) return;
	usageConfig.create ??= {};
	usageConfig.create.measuredTemplate = false;
});
