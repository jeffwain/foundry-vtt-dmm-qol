/**
 * Pure helpers for group roll request cards. Kept free of Foundry globals so
 * they can be tested with node.
 */

/**
 * @typedef {object} RequestRow
 * @property {string} uuid          Actor UUID of the row.
 * @property {boolean} completed    The row already has a result.
 * @property {boolean} canRoll      The current user may roll for this row.
 * @property {boolean} playerOwned  A player (not just the GM) owns the actor.
 */

/**
 * Actor UUIDs a footer button should roll: pending rows the user may roll,
 * limited to NPCs (actors no player owns) when `npcOnly` is set.
 *
 * @param {RequestRow[]} rows
 * @param {{npcOnly?: boolean}} [options]
 * @returns {string[]}
 */
export function rowsToRoll(rows, { npcOnly = false } = {}) {
  return rows
    .filter((row) => !row.completed && row.canRoll && !(npcOnly && row.playerOwned))
    .map((row) => row.uuid);
}

/**
 * Which set of d20 results to keep when a roll gets advantage or
 * disadvantage after the fact. A tie keeps the earliest set, so the original
 * roll stands, as dnd5e's own advantage handler does.
 *
 * @param {number[]} totals  Total of each set; the original roll first.
 * @param {boolean} advantage  Keep the highest (true) or lowest (false).
 * @returns {number}  Index of the kept set, or -1 when there are none.
 */
export function keptSetIndex(totals, advantage) {
  let kept = -1;
  totals.forEach((total, index) => {
    if (kept < 0 || (advantage ? total > totals[kept] : total < totals[kept])) kept = index;
  });
  return kept;
}

/**
 * Clear one target's result.
 *
 * @param {Array<{actor:string, result:string|null}>} targets  Source data (toObject) of system.targets.
 * @param {string} uuid  Actor UUID of the row.
 * @returns {{targets: object[], resultId: string|null}|null}  New targets and the cleared result's id,
 *   or null when no target matches.
 */
export function resetTarget(targets, uuid) {
  const index = targets.findIndex((target) => target.actor === uuid);
  if (index < 0) return null;
  const resultId = targets[index].result ?? null;
  const next = targets.map((target, i) => (i === index ? { ...target, result: null } : target));
  return { targets: next, resultId };
}

/**
 * Drop one target from the card.
 *
 * @param {Array<{actor:string, result:string|null}>} targets  Source data (toObject) of system.targets.
 * @param {string} uuid  Actor UUID of the row.
 * @returns {{targets: object[], resultId: string|null}|null}  New targets and the dropped row's result id,
 *   or null when no target matches.
 */
export function removeTarget(targets, uuid) {
  const index = targets.findIndex((target) => target.actor === uuid);
  if (index < 0) return null;
  const resultId = targets[index].result ?? null;
  return { targets: targets.filter((_, i) => i !== index), resultId };
}
