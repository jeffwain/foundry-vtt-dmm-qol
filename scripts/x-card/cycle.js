/**
 * Pure helpers for the X-Card font cycle. Kept free of Foundry globals so
 * they can be tested with node.
 */

/**
 * The fonts the card cycles through: the ticked ones that are still enabled.
 * A ticked font that was switched off stays saved, so ticking it on again in
 * the file list brings it back.
 *
 * @param {string[]} ticked     Families ticked for the X-Card.
 * @param {Set<string>} enabled Families currently enabled.
 * @returns {string[]}
 */
export function cardFamilies(ticked, enabled) {
  const list = Array.isArray(ticked) ? ticked : [];
  return [...new Set(list)].filter((family) => enabled.has(family));
}

/**
 * The font after `current`, wrapping round. A font no longer in the list
 * starts the cycle over.
 *
 * @param {string[]} families
 * @param {string} current
 * @returns {string}  "" when the list is empty.
 */
export function nextFamily(families, current) {
  if (!families.length) return "";
  const index = families.indexOf(current);
  return families[(index + 1) % families.length];
}

/**
 * A random font to open on, different from the last one shown so two
 * presses in a row don't look the same.
 *
 * @param {string[]} families
 * @param {string} previous
 * @param {() => number} [random]  Returns [0, 1); injectable for tests.
 * @returns {string}  "" when the list is empty.
 */
export function pickStart(families, previous, random = Math.random) {
  const choices = families.length > 1 ? families.filter((family) => family !== previous) : families;
  if (!choices.length) return "";
  return choices[Math.floor(random() * choices.length)];
}
