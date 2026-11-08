/**
 * Order of this module's Configure Settings menus.
 *
 * Core lists menus in the order they sit in game.settings.menus, which is
 * registration order. Re-inserting ours sets the order here, independent of
 * which feature happens to register first.
 */

/**
 * Re-insert one namespace's menus: the listed keys first, in list order, then
 * any unlisted ones in their original order. Other namespaces are untouched
 * relative to each other.
 * @param {Map<string, object>} menus  game.settings.menus
 * @param {string} namespace
 * @param {string[]} order  Menu keys without the namespace.
 */
export function orderMenus(menus, namespace, order) {
  const prefix = `${namespace}.`;
  const ours = [...menus.keys()].filter((key) => key.startsWith(prefix));
  const listed = order.map((key) => prefix + key).filter((key) => menus.has(key));
  const sorted = [...listed, ...ours.filter((key) => !listed.includes(key))];
  const entries = sorted.map((key) => [key, menus.get(key)]);
  for (const [key] of entries) menus.delete(key);
  for (const [key, value] of entries) menus.set(key, value);
}
