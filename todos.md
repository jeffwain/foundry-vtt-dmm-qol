## Refinement
- [x] Display the list of saved folders beneath the button to Configure Search Paths as a reference.


## New features
- [x] Create a new module that lets me hide/show individual tabs in the Foundry Sidebar. The settings button should open a modal with a big list of checkboxes.
- [ ] Replace Monk's TokenBar's bar with a nicer party bar that docks like Calendaria. Keep TokenBar for everything else. Notes below.


## Party bar (replacing Monk's TokenBar's bar)
Researched 2026-11-07 against Monk's TokenBar 14.01, dnd5e 6.1.0 and Calendaria 1.4.8. Read from the code; nothing was run in Foundry.

Open questions before designing:
- What each token shows: portrait, HP, AC, passive Perception, conditions, inspiration?
- Which actions go on the bar: request roll, movement, XP, contested roll?
- GM only, or players too?

How to hook in:
- Turn on TokenBar's `disable-tokenbar` setting. That stops only the bar; chat cards, combat-end XP, movement enforcement, the lootables scene button and Active Tiles actions keep working.
- Public API on `game.MonksTokenBar`: `requestRoll(tokens, opts)` (`silent`/`fastForward` post the card directly), `requestContestedRoll(a, b, opts)`, `assignXP(tokens, opts)`, `convertToLootable(tokens, opts)`, `changeMovement(mode, tokens?)`.
- The movement and request-roll buttons live only on TokenBar's bar (`getButtons` in `systems/base-rolls.js`), so ours needs its own.
- Movement state (internal, not API): world setting `monks-tokenbar.movement` and token flag `flags.monks-tokenbar.movement`. Refresh on `updateSetting` and `updateToken`.
- Quirk: `changeGlobalMovement` clears per-token overrides only for tokens on TokenBar's own bar. With it off, clear `flags.monks-tokenbar.movement` on our tokens before calling `changeMovement`.

Docking like Calendaria: snap zones near screen edges and corners, offset by the sidebar's width unless overlap is allowed; the HUD pins when dropped in one, and position is saved per user.

TokenBar bugs a new bar won't fix (all in `systems/dnd5e-rolls.js`, checked against dnd5e 6.1.0):
- Initiative: builds `{createCombatants, rerollInitiative, initiativeOptions}` but never passes it; `actor.rollInitiative` gets `{event}` and returns a Combat, not a Roll, so the result likely never reaches the card.
- Tools: the request list keys tools by `_stats.compendiumSource`, but the roll looks them up by `core.sourceId` or slugified name, so compendium tools likely fail with "no tool". `item.rollToolCheck` takes one argument, so the dialog and message options are dropped.
- Modifier labels: `getValue` reads saves from `system.saves.*` and checks from `system.attributes.*`; dnd5e keeps both under `system.abilities.*`, so only skills show a +N.
- Advantage buttons: never set `advantage` in the roll config; depends on dnd5e reading modifier keys off the jQuery event (unverified).

TokenBar parts, for reference: the bar (`apps/tokenbar.js`), movement control, Request Roll (`apps/savingthrow.js`), Contested Roll, Assign XP, Lootables, Edit Stats / Pick Icon / Reset Position, Token Config fields, combat tracker buttons, Active Tiles actions, Dice So Nice hook, per-system roll adapters (`systems/`).
