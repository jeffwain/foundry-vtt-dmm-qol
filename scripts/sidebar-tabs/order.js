/**
 * Pure ordering helpers for the Sidebar Tabs dialog and live sidebar.
 */

/**
 * Re-sort `names` to follow the saved `order`. Names missing from the saved
 * order (a module added a tab since) keep their current position; the sorted
 * names fill the slots the ordered ones occupied.
 * @param {string[]} names Current order.
 * @param {string[]} [order] Saved order.
 * @returns {string[]}
 */
export function applyOrder(names, order = []) {
	const rank = new Map();
	for (const name of order) if (!rank.has(name)) rank.set(name, rank.size);

	const sorted = names.filter((n) => rank.has(n)).sort((a, b) => rank.get(a) - rank.get(b));
	let next = 0;
	return names.map((n) => (rank.has(n) ? sorted[next++] : n));
}
