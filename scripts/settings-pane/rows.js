/**
 * Pure helpers for the Settings pane. Kept free of Foundry globals so they
 * can be tested with node.
 */

/**
 * One row per Configure Settings category, in the modal's own order.
 *
 * @param {Record<string, {id:string, label:string, entries:object[]}>} categories
 *   Output of SettingsConfig#_prepareCategoryData.
 * @param {(a:object, b:object) => number} compare  SettingsConfig#_sortCategories.
 * @param {(text:string) => string} [localize]  Menu names can be i18n keys.
 * @returns {Array<{id:string, label:string, settingCount:number, menus:Array<{key:string, label:string, icon:string}>}>}
 */
export function paneRows(categories, compare, localize = (text) => text) {
  return Object.values(categories ?? {})
    .sort(compare)
    .map((category) => {
      const entries = category.entries ?? [];
      return {
        id: category.id,
        label: category.label,
        settingCount: entries.filter((entry) => !entry.menu).length,
        menus: entries
          .filter((entry) => entry.menu)
          .map((entry) => ({ key: entry.key, label: localize(entry.label ?? entry.key), icon: entry.icon ?? "" })),
      };
    });
}

/**
 * Whether a row matches the search box. Matches the category name or any of
 * its menu names, ignoring case.
 *
 * @param {{label:string, menus:Array<{label:string}>}} row
 * @param {string} query
 * @returns {boolean}
 */
export function matchesQuery(row, query) {
  const needle = String(query ?? "").trim().toLowerCase();
  if (!needle) return true;
  return [row.label, ...row.menus.map((menu) => menu.label)].some((text) => String(text).toLowerCase().includes(needle));
}
