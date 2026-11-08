/**
 * Sidebar Tabs — hide/show and reorder the right sidebar's tabs and the left
 * scene controls' top-level buttons.
 * Self-registers its settings and applies the hidden sets and order on import.
 */

import { BARS, applyBar, registerSceneControlsSettings, registerSidebarTabsSettings } from "./settings.js";
import { registerSidebarTweaksMenu } from "./tweaks.js";

// Menu order in Configure Settings is set in module.js.
Hooks.once("init", () => {
	registerSidebarTabsSettings();
	registerSidebarTweaksMenu();
	registerSceneControlsSettings();

	// Registered here rather than at import so it runs after the
	// renderSceneControls hooks of features that add buttons (X-Card).
	Hooks.on("renderSceneControls", () => applyBar(BARS.controls));
});

// Re-apply whenever the sidebar (re)renders, and once on ready for first paint.
Hooks.on("renderSidebar", () => applyBar(BARS.tabs));
Hooks.once("ready", () => {
	applyBar(BARS.tabs);
	applyBar(BARS.controls);
});
