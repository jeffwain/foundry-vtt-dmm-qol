/**
 * Sidebar Tabs settings.
 *
 * Hide/show and reorder the buttons of two bars: the tabs of the right-hand
 * sidebar, and the top-level scene controls on the left. Each bar gets a
 * Configure-Settings entry that opens a dialog with a checkbox and drag grip
 * per button. The GM's choices are world defaults; a player can override them
 * for their own screen (stored per-client) or reset back to the GM's.
 *
 * One button per bar is never hideable: the Settings tab (hiding it would lock
 * you out of this UI) and Token Controls (the layer Foundry opens on).
 */

import CONSTANTS from "../shared/constants.js";
import SettingsGroupDialog, { escapeHTML } from "../shared/settings-dialog.js";
import { applyOrder } from "./order.js";
import { resolveValues } from "../shared/overrides.js";

// Fallback core sidebar tabs (used only if the live nav can't be read).
const CORE_TABS = [
	{ name: "chat", icon: "fa-solid fa-comments" },
	{ name: "combat", icon: "fa-solid fa-swords" },
	{ name: "scenes", icon: "fa-solid fa-map" },
	{ name: "actors", icon: "fa-solid fa-users" },
	{ name: "items", icon: "fa-solid fa-suitcase" },
	{ name: "journal", icon: "fa-solid fa-book-open" },
	{ name: "tables", icon: "fa-solid fa-table-list" },
	{ name: "cards", icon: "fa-solid fa-cards" },
	{ name: "playlists", icon: "fa-solid fa-music" },
	{ name: "compendium", icon: "fa-solid fa-atlas" },
	{ name: "macros", icon: "fa-solid fa-code" },
];

/** Localized label for a sidebar tab, falling back to a capitalized name. */
function tabLabel(name) {
	const key = `SIDEBAR-TABS.tab-${name}`;
	return game.i18n.has(key) ? game.i18n.localize(key) : name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * The bars this feature customizes. Each names its settings, where its
 * buttons live in the DOM, and the one button that can't be hidden or moved.
 */
export const BARS = {
	tabs: {
		hiddenKey: "st-hidden-tabs",
		orderKey: "st-tab-order",
		userKey: "st-user-tabs",
		navSelector: "#ui-right #sidebar #sidebar-tabs",
		buttonSelector: '[data-action="tab"][data-tab]',
		nameOf: (btn) => btn.dataset.tab,
		protectedName: "settings",
		protectedAt: "end",
		protectedFallback: { icon: "fa-solid fa-gears" },
		fallback: () => CORE_TABS.map((t) => ({ ...t, label: tabLabel(t.name) })),
	},
	controls: {
		hiddenKey: "st-hidden-controls",
		orderKey: "st-control-order",
		userKey: "st-user-controls",
		navSelector: "#scene-controls-layers",
		buttonSelector: "button[data-control]",
		nameOf: (btn) => btn.dataset.control,
		protectedName: "tokens",
		protectedAt: "start",
		protectedFallback: { icon: "fa-solid fa-user-alt" },
		fallback: () =>
			Object.values(ui.controls?.controls ?? {})
				.sort((a, b) => a.order - b.order)
				.map((c) => ({ name: c.name, icon: c.icon, label: game.i18n.localize(c.title) })),
	},
};

// Core's own button classes; whatever else is on a button is its icon.
const BUTTON_CLASSES = new Set(["control", "ui-control", "plain", "icon", "layer", "tool", "button", "toggle", "active"]);

/**
 * Every button of a bar, protected one included, read from the live DOM (so
 * icons and labels match this Foundry build, and buttons other features add
 * show up). Empty if the bar isn't rendered.
 * @returns {Array<{name:string, icon:string, label:string}>}
 */
function readLiveButtons(bar) {
	const nav = document.querySelector(bar.navSelector);
	const buttons = [];
	if (nav) {
		for (const btn of nav.querySelectorAll(bar.buttonSelector)) {
			const name = bar.nameOf(btn);
			if (!name) continue;
			// The icon is on the button's own class list (e.g. "ui-control plain
			// icon fa-solid fa-comments"), not a child <i>.
			const iconClasses = Array.from(btn.classList).filter((c) => !BUTTON_CLASSES.has(c));
			const icon = iconClasses.length ? iconClasses.join(" ") : "fa-solid fa-window-maximize";
			const tip = btn.dataset.tooltip || btn.getAttribute("aria-label");
			const label = tip ? (game.i18n.has(tip) ? game.i18n.localize(tip) : tip) : tabLabel(name);
			buttons.push({ name, icon, label });
		}
	}
	return buttons;
}

/**
 * The customizable buttons of a bar, minus the protected one. Falls back to
 * the bar's static list.
 * @returns {Array<{name:string, icon:string, label:string}>}
 */
export function getBarButtons(bar) {
	const live = readLiveButtons(bar).filter((b) => b.name !== bar.protectedName);
	if (live.length) return live;
	return bar.fallback().filter((b) => b.name !== bar.protectedName);
}

/** The bar's protected button, for showing as a locked row. */
function getProtectedButton(bar) {
	const name = bar.protectedName;
	return (
		readLiveButtons(bar).find((b) => b.name === name) ??
		bar.fallback().find((b) => b.name === name) ?? {
			name,
			icon: bar.protectedFallback.icon,
			label: tabLabel(name),
		}
	);
}

/** The GM's defaults for a bar. */
function getWorldState(bar) {
	return {
		hidden: game.settings.get(CONSTANTS.MODULE_NAME, bar.hiddenKey) || [],
		order: game.settings.get(CONSTANTS.MODULE_NAME, bar.orderKey) || [],
	};
}

/** What applies to this user: the GM's defaults, or the player's own override. */
export function getBarState(bar) {
	return resolveValues({
		isGM: game.user.isGM,
		world: getWorldState(bar),
		mine: game.settings.get(CONSTANTS.MODULE_NAME, bar.userKey),
	});
}

/**
 * Apply a bar's stored hidden set by toggling a CSS class on the <li> wrapping
 * each button.
 */
export function applyHidden(bar) {
	const hidden = new Set(getBarState(bar).hidden);
	const nav = document.querySelector(bar.navSelector);
	if (!nav) return;

	for (const btn of nav.querySelectorAll(bar.buttonSelector)) {
		const name = bar.nameOf(btn);
		const li = btn.closest("li") ?? btn;
		li.classList.toggle("dmm-st-hidden", hidden.has(name) && name !== bar.protectedName);
	}
}

/**
 * Reorder a bar's buttons to the stored order. Each moved button's <li> goes
 * into the slot another ordered button left, so the protected button and any
 * the stored order doesn't know about stay where they are.
 */
export function applyBarOrder(bar) {
	const order = getBarState(bar).order;
	const nav = document.querySelector(bar.navSelector);
	if (!nav || !order.length) return;

	const items = new Map();
	for (const btn of nav.querySelectorAll(bar.buttonSelector)) {
		items.set(bar.nameOf(btn), btn.closest("li") ?? btn);
	}

	const current = [...items.keys()];
	const wanted = applyOrder(current, order);
	if (wanted.every((name, i) => name === current[i])) return;

	// Park a marker in each slot, then drop the right button into each marker.
	const markers = current.map((name) => {
		const marker = document.createComment("dmm-st-slot");
		items.get(name).replaceWith(marker);
		return marker;
	});
	markers.forEach((marker, i) => marker.replaceWith(items.get(wanted[i])));
}

/** Apply a bar's order and hidden set. */
export function applyBar(bar) {
	applyBarOrder(bar);
	applyHidden(bar);
}

/**
 * Register the Sidebar Tabs menu and its client settings.
 */
export function registerSidebarTabsSettings() {
	game.settings.registerMenu(CONSTANTS.MODULE_NAME, "sidebar-tabs-menu", {
		name: "SIDEBAR-TABS.name",
		label: "SIDEBAR-TABS.label",
		hint: "SIDEBAR-TABS.hint",
		icon: "fas fa-table-columns",
		type: SidebarTabsConfig,
		restricted: false,
	});
	registerBarSettings(BARS.tabs);
}

/**
 * Register the Scene Controls menu and its client settings.
 */
export function registerSceneControlsSettings() {
	game.settings.registerMenu(CONSTANTS.MODULE_NAME, "scene-controls-menu", {
		name: "SCENE-CONTROLS.name",
		label: "SCENE-CONTROLS.label",
		hint: "SCENE-CONTROLS.hint",
		icon: "fa-solid fa-toolbox",
		type: SceneControlsConfig,
		restricted: false,
	});
	registerBarSettings(BARS.controls);
}

function registerBarSettings(bar) {
	// GM defaults.
	game.settings.register(CONSTANTS.MODULE_NAME, bar.hiddenKey, {
		scope: "world",
		config: false,
		type: Array,
		default: [],
		onChange: () => applyBar(bar),
	});

	game.settings.register(CONSTANTS.MODULE_NAME, bar.orderKey, {
		scope: "world",
		config: false,
		type: Array,
		default: [],
		onChange: () => applyBar(bar),
	});

	// A player's own { hidden, order }. Empty means follow the GM's defaults.
	game.settings.register(CONSTANTS.MODULE_NAME, bar.userKey, {
		scope: "client",
		config: false,
		type: Object,
		default: {},
		onChange: () => applyBar(bar),
	});
}

/**
 * Checkbox dialog: one row per customizable button. Checked = visible.
 * Subclasses set BAR and HINT.
 */
class BarConfig extends SettingsGroupDialog {
	static SETTING_KEYS = [];
	static BAR = BARS.tabs;
	static HINT = "SIDEBAR-TABS.dialog-hint";

	get bar() {
		return this.constructor.BAR;
	}

	_extraHTML() {
		const bar = this.bar;
		const state = getBarState(bar);
		const hidden = new Set(state.hidden);
		const buttons = getBarButtons(bar);
		const byName = new Map(buttons.map((b) => [b.name, b]));
		const ordered = applyOrder(
			buttons.map((b) => b.name),
			state.order,
		).map((name) => byName.get(name));
		const grip = escapeHTML(game.i18n.localize("SIDEBAR-TABS.drag-handle"));
		const rows = ordered
			.map(
				(b) => `
				<div class="dmm-st-row" data-tab="${escapeHTML(b.name)}">
					<label class="dmm-st-label">
						<input type="checkbox" name="${escapeHTML(b.name)}" ${hidden.has(b.name) ? "" : "checked"}/>
						<i class="${escapeHTML(b.icon)}"></i>
						<span>${escapeHTML(b.label)}</span>
					</label>
					<span class="dmm-st-grip" draggable="true" tabindex="0" role="button" aria-label="${grip}" data-tooltip="${grip}"><i class="fas fa-grip-vertical"></i></span>
				</div>`,
			)
			.join("");

		// The protected button gets a checked, disabled row with no grip, outside
		// the sortable list so nothing can be dragged past it.
		const locked = getProtectedButton(bar);
		const lockedRow = `
			<div class="dmm-st-row dmm-st-locked">
				<label class="dmm-st-label">
					<input type="checkbox" checked disabled/>
					<i class="${escapeHTML(locked.icon)}"></i>
					<span>${escapeHTML(locked.label)}</span>
				</label>
				<span class="dmm-st-lock" aria-hidden="true"><i class="fas fa-lock"></i></span>
			</div>`;
		const atStart = bar.protectedAt === "start";

		const hint = game.i18n.localize(game.user.isGM ? `${this.constructor.HINT}-gm` : this.constructor.HINT);
		const reset = game.user.isGM
			? ""
			: `<button type="button" data-action="reset"><i class="fas fa-rotate-left"></i> ${game.i18n.localize("SIDEBAR-TABS.reset")}</button>`;

		return `
			<p class="hint">${hint}</p>
			<div class="dmm-st-list">
			  ${atStart ? lockedRow : ""}
				${rows}
				${atStart ? "" : lockedRow}
			</div>

			${reset}`;
	}

	/** Drop the player's own layout so the GM's defaults apply again. */
	async _onExtraAction(action) {
		if (action !== "reset") return;
		await game.settings.set(CONSTANTS.MODULE_NAME, this.bar.userKey, {});
		ui.notifications.info(game.i18n.localize("DMM.SettingsSaved"));
		this.close();
	}

	async _replaceHTML(result, content) {
		await super._replaceHTML(result, content);
		this._bindReorder(content.querySelector(".dmm-st-list"));
	}

	/** Rows in their current dialog order. */
	_rows() {
		return Array.from(this.element.querySelectorAll(".dmm-st-row"));
	}

	/**
	 * Drag a row by its grip to reorder; the row follows the pointer live. The
	 * grip also takes ArrowUp/ArrowDown so the list works without a mouse.
	 */
	_bindReorder(list) {
		let dragged = null;

		list.addEventListener("dragstart", (ev) => {
			const grip = ev.target.closest?.(".dmm-st-grip");
			if (!grip) return;
			dragged = grip.closest(".dmm-st-row");
			const box = dragged.getBoundingClientRect();
			ev.dataTransfer.effectAllowed = "move";
			ev.dataTransfer.setData("text/plain", dragged.dataset.tab); // Firefox won't drag without data
			ev.dataTransfer.setDragImage(dragged, ev.clientX - box.left, ev.clientY - box.top);
			// Style after the browser has captured the drag image.
			requestAnimationFrame(() => dragged?.classList.add("dmm-st-dragging"));
		});

		list.addEventListener("dragover", (ev) => {
			if (!dragged) return;
			ev.preventDefault();
			const after = this._rows().find((row) => {
				if (row === dragged) return false;
				const box = row.getBoundingClientRect();
				return ev.clientY < box.top + box.height / 2;
			});
			if (after) {
				if (after.previousElementSibling !== dragged) after.before(dragged);
			} else if (list.lastElementChild !== dragged) {
				list.append(dragged);
			}
		});

		list.addEventListener("drop", (ev) => {
			if (dragged) ev.preventDefault();
		});

		list.addEventListener("dragend", () => {
			dragged?.classList.remove("dmm-st-dragging");
			dragged = null;
		});

		list.addEventListener("keydown", (ev) => {
			const grip = ev.target.closest?.(".dmm-st-grip");
			if (!grip || (ev.key !== "ArrowUp" && ev.key !== "ArrowDown")) return;
			ev.preventDefault();
			const row = grip.closest(".dmm-st-row");
			if (ev.key === "ArrowUp") row.previousElementSibling?.before(row);
			else row.nextElementSibling?.after(row);
			grip.focus();
		});
	}

	async _save() {
		const hidden = [];
		this.element.querySelectorAll('input[type="checkbox"][name]').forEach((cb) => {
			if (!cb.checked) hidden.push(cb.name);
		});
		const order = this._rows().map((row) => row.dataset.tab);
		if (game.user.isGM) {
			await game.settings.set(CONSTANTS.MODULE_NAME, this.bar.orderKey, order);
			await game.settings.set(CONSTANTS.MODULE_NAME, this.bar.hiddenKey, hidden);
		} else {
			await game.settings.set(CONSTANTS.MODULE_NAME, this.bar.userKey, { hidden, order });
		}
		ui.notifications.info(game.i18n.localize("DMM.SettingsSaved"));
	}
}

class SidebarTabsConfig extends BarConfig {
	static DEFAULT_OPTIONS = {
		id: "dmm-sidebar-tabs",
		window: { title: "SIDEBAR-TABS.name", icon: "fas fa-table-columns" },
		position: { width: 360, height: "auto" },
	};
	static BAR = BARS.tabs;
	static HINT = "SIDEBAR-TABS.dialog-hint";
}

class SceneControlsConfig extends BarConfig {
	static DEFAULT_OPTIONS = {
		id: "dmm-scene-controls",
		window: { title: "SCENE-CONTROLS.name", icon: "fa-solid fa-toolbox" },
		position: { width: 360, height: "auto" },
	};
	static BAR = BARS.controls;
	static HINT = "SCENE-CONTROLS.dialog-hint";
}
