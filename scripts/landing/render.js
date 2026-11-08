/**
 * Landing page background rotation — pure functions.
 *
 * The login page (/join) loads no module scripts or styles, so all this
 * feature can change there is the world background. This file holds the logic
 * for picking it.
 *
 * Nothing here touches Foundry globals, which keeps it unit testable via
 * `node --test`.
 */

/**
 * Intersect a freshly scanned folder listing with the stored enabled set.
 *
 * Scanning at publish time means images deleted from disk since they were
 * ticked simply drop out, rather than becoming a broken background URL.
 *
 * @param {string[]} scanned  Paths currently present in the folder.
 * @param {string[]} enabled  Paths the user ticked.
 * @returns {string[]}        Enabled paths that still exist, in folder order.
 */
export function enabledImages(scanned, enabled) {
  const wanted = new Set(Array.isArray(enabled) ? enabled : []);
  return (Array.isArray(scanned) ? scanned : []).filter((p) => wanted.has(p));
}

/**
 * Choose one background at random, avoiding an immediate repeat when possible.
 *
 * @param {string[]} images
 * @param {object} [options]
 * @param {() => number} [options.random]   Injectable for tests.
 * @param {string} [options.exclude]        Current background, avoided if there is an alternative.
 * @returns {string}                        Chosen path, or "" when there is nothing to choose from.
 */
export function pickBackground(images, { random = Math.random, exclude = "" } = {}) {
  const list = (Array.isArray(images) ? images : []).filter(Boolean);
  if (!list.length) return "";

  const withoutCurrent = list.filter((i) => i !== exclude);
  const pool = withoutCurrent.length ? withoutCurrent : list;

  // Math.random() can theoretically return values that floor to pool.length.
  const index = Math.min(Math.floor(random() * pool.length), pool.length - 1);
  return pool[index];
}

/**
 * Whether a background was set by this feature: it's one of the ticked images
 * or sits in the rotation folder. Used so turning the feature off only undoes
 * our own background, never one set by hand.
 *
 * @param {string} background  The world's current background path.
 * @param {string} folder      The rotation folder, Data-relative.
 * @param {string[]} images    The ticked images.
 * @returns {boolean}
 */
export function isRotationBackground(background, folder, images) {
  const path = String(background ?? "");
  if (!path) return false;
  if (Array.isArray(images) && images.includes(path)) return true;
  const dir = String(folder ?? "").replace(/\/+$/, "");
  return Boolean(dir) && path.startsWith(`${dir}/`);
}
