/**
 * GM defaults with optional per-player overrides.
 *
 * The GM's value lives in a world setting. A player who is allowed to adjust
 * a value stores only the keys they changed in a client setting; anything
 * missing falls back to the GM's value.
 */

/**
 * @param {object} args
 * @param {boolean} args.isGM       GMs always see the world defaults they edit.
 * @param {object} args.world       The GM's values.
 * @param {object} [args.mine]      The player's overrides (may be partial or empty).
 * @returns {object} The values that apply to this user.
 */
export function resolveValues({ isGM, world, mine }) {
  if (isGM || !mine) return { ...world };
  const result = { ...world };
  for (const key of Object.keys(world)) {
    if (mine[key] !== undefined && mine[key] !== null) result[key] = mine[key];
  }
  return result;
}
