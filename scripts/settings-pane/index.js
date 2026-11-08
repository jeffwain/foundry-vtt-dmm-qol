/**
 * Settings pane — a sidebar tab that lists every Configure Settings category
 * and its submenus, as a shortcut into the modal.
 *
 * Core builds its sidebar from Sidebar.TABS and the ui.* apps from CONFIG.ui,
 * both after init, so registering here gives a real tab (pop-out included).
 */

import SettingsPane, { TAB_NAME } from "./pane.js";

Hooks.once("init", () => {
  const Sidebar = CONFIG.ui.sidebar;
  // Rebuild the tab list so this one sits just above core's Settings tab.
  const { settings, ...rest } = Sidebar.TABS;
  Sidebar.TABS = {
    ...rest,
    // gmOnly: core skips the tab unless game.user.isGM, which includes Assistant GMs.
    [TAB_NAME]: { tooltip: "SETTINGS-PANE.title", icon: "fa-solid fa-sliders", gmOnly: true },
    ...(settings ? { settings } : {}),
  };
  CONFIG.ui[TAB_NAME] = SettingsPane;
});
