/**
 * Footer buttons and a row context menu for dnd5e's request card.
 *
 * Rolls call the actor's roll method directly, with the dialog skipped, rather
 * than the card's request handler, which always opens the dialog unless a
 * modifier key is held. The result message carries the same
 * `flags.dnd5e.requestResult` flag the handler sets, so dnd5e links it to the
 * card the same way (on the active GM's client).
 */

import { rowsToRoll, keptSetIndex, resetTarget, removeTarget } from "./targets.js";

/** Request handlers we can roll for, mapped to the Actor5e roll method. */
const ROLLERS = {
  skill: "rollSkill",
  save: "rollSavingThrow",
  // Tidy 5e's group sheet posts ability checks with its own handler.
  "tidy5e-sheet.ability": "rollAbilityCheck",
};

/** How long a footer roll waits for dnd5e to link its result before moving on. */
const LINK_TIMEOUT_MS = 5000;

/** Request cards a footer button is rolling for, so a re-render keeps the buttons disabled. */
const rolling = new Set();

/**
 * Add the footer buttons and row menu to a rendered request card.
 *
 * @param {ChatMessage} message
 * @param {HTMLElement} html  The whole message element.
 */
export function enhanceRequestCard(message, html) {
  if (message.type !== "request" || !ROLLERS[message.system.handler]) return;
  const card = html.querySelector(".chat-card");
  if (!card) return;
  const rows = requestRows(message);
  addFooter(message, card, rows);
  addRowMenu(message, html, rows);
}

/* ── Rows ────────────────────────────────────────────────────────────────── */

/** Who may roll a row. Matches dnd5e's own check for showing the row's button. */
function canRollTarget(target, actor) {
  if (game.user.isGM) return true;
  if (target.user) return target.user.id === game.user.id;
  return actor.isOwner;
}

/**
 * The card's targets with what the footer and menu need to know about each.
 *
 * @param {ChatMessage} message
 * @returns {Array<import("./targets.js").RequestRow & {target: object, actor: Actor}>}
 */
function requestRows(message) {
  return message.system.targets.flatMap((target) => {
    const actor = fromUuidSync(target.actor);
    if (!actor) return [];
    return [{
      uuid: target.actor,
      target,
      actor,
      completed: !!target.result,
      canRoll: canRollTarget(target, actor),
      playerOwned: actor.hasPlayerOwner,
    }];
  });
}

function findRow(message, uuid) {
  return requestRows(message).find((row) => row.uuid === uuid);
}

/* ── Rolling ─────────────────────────────────────────────────────────────── */

/** dnd5e only links results to the card on the active GM's client. */
function requireActiveGM() {
  if (game.users.activeGM) return true;
  ui.notifications.warn("GROUP-ROLLS.no-gm", { localize: true });
  return false;
}

/**
 * Roll the card's check for one actor, without the dialog.
 *
 * @param {ChatMessage} request
 * @param {Actor} actor
 * @returns {Promise<ChatMessage|null>}  The result message.
 */
async function rollFor(request, actor) {
  const method = ROLLERS[request.system.handler];
  const data = {};
  foundry.utils.setProperty(data, "flags.dnd5e.requestResult", { actorUuid: actor.uuid, requestId: request.id });
  const rolls = await actor[method]({ ...request.system.data }, { configure: false }, { data });
  return rolls?.[0]?.parent ?? null;
}

/**
 * Wait until the card points at `resultId` for this actor. dnd5e rewrites the
 * whole targets array from its current copy each time, so rolling the next
 * actor before this lands would wipe this result.
 */
function waitForLink(request, actorUuid, resultId) {
  const isLinked = () =>
    request.system.targets.find((target) => target.actor === actorUuid)?.result?.id === resultId;
  if (isLinked()) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      Hooks.off("updateChatMessage", hookId);
      clearTimeout(timer);
      resolve();
    };
    const hookId = Hooks.on("updateChatMessage", (message) => {
      if (message.id === request.id && isLinked()) finish();
    });
    const timer = setTimeout(finish, LINK_TIMEOUT_MS);
  });
}

/** Roll every pending row the user may roll, or only the NPC ones. */
async function rollPending(message, { npcOnly }) {
  if (rolling.has(message.id) || !requireActiveGM()) return;
  const uuids = rowsToRoll(requestRows(message), { npcOnly });
  if (!uuids.length) return;
  rolling.add(message.id);
  try {
    for (const uuid of uuids) {
      const actor = fromUuidSync(uuid);
      if (!actor) continue;
      try {
        const result = await rollFor(message, actor);
        if (result) await waitForLink(message, uuid, result.id);
      } catch (err) {
        // Keep going so one broken actor doesn't stop the rest.
        console.error(`DMM Quality of Life | Group Rolls: roll failed for ${actor.name}`, err);
      }
    }
  } finally {
    rolling.delete(message.id);
    // The last re-render happened mid-roll, with the buttons disabled.
    ui.chat?.updateMessage(message);
  }
}

/* ── Footer ──────────────────────────────────────────────────────────────── */

function rollButton(label, tooltip, disabled, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.disabled = disabled;
  // An empty data-tooltip shows the aria-label, as dnd5e's own row buttons do.
  button.dataset.tooltip = "";
  button.setAttribute("aria-label", game.i18n.localize(tooltip));
  button.innerHTML = `<i class="fa-solid fa-dice-d20" inert></i><span>${game.i18n.localize(label)}</span>`;
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    const buttons = [...button.parentElement.querySelectorAll("button")];
    for (const el of buttons) el.disabled = true;
    try {
      await onClick();
    } finally {
      // Re-enable after an early exit (no GM online); a re-render replaces these anyway.
      for (const el of buttons) el.disabled = false;
    }
  });
  return button;
}

/** "NPC" shows only while an NPC row is still pending; nothing shows once every row is done. */
function addFooter(message, card, rows) {
  if (!rowsToRoll(rows).length) return;
  const busy = rolling.has(message.id);
  const footer = document.createElement("div");
  footer.className = "dmm-group-roll-buttons";
  if (rowsToRoll(rows, { npcOnly: true }).length) {
    footer.append(rollButton("GROUP-ROLLS.roll-npc", "GROUP-ROLLS.roll-npc-hint", busy,
      () => rollPending(message, { npcOnly: true })));
  }
  footer.append(rollButton("GROUP-ROLLS.roll-all", "GROUP-ROLLS.roll-all-hint", busy,
    () => rollPending(message, { npcOnly: false })));
  card.append(footer);
}

/* ── Row menu ────────────────────────────────────────────────────────────── */

/** Delete a superseded result message, if this user may. */
async function deleteResult(resultId) {
  const result = resultId && game.messages.get(resultId);
  if (result?.canUserModify(game.user, "delete")) await result.delete();
}

async function updateTargets(message, change) {
  if (!change) return;
  await message.update({ "system.targets": change.targets });
  await deleteResult(change.resultId);
}

/** The result message's d20 roll, if it was rolled normally and this user may change it. */
function upgradableRoll(result) {
  if (!result?.isOwner) return null;
  const roll = result.rolls.find((r) => r.validD20Roll);
  const normal = CONFIG.Dice.D20Roll.ADV_MODE.NORMAL;
  return (roll && (roll.options.advantageMode ?? normal) === normal) ? roll : null;
}

/** Show the extra dice: Dice So Nice if it's on, otherwise core's dice sound. */
async function showExtraDice(result, extras) {
  if (game.dice3d?.isEnabled?.()) {
    const whisper = result.whisper.length ? result.whisper : null;
    await Promise.all(extras.map((roll) => game.dice3d.showForRoll(roll, game.user, true, whisper, result.blind)));
  } else {
    foundry.audio.AudioHelper.play({ src: CONFIG.sounds.dice });
  }
}

/**
 * Give an already-rolled check advantage or disadvantage: roll the extra d20,
 * keep the higher or lower, and update the same message, the way
 * Ready Set Roll's retroactive advantage does.
 */
async function upgradeResult(result, advantage) {
  const original = upgradableRoll(result);
  if (!original) return;
  const roll = CONFIG.Dice.D20Roll.fromData(original.toJSON());
  const d20 = roll.d20;
  const { ADV_MODE } = CONFIG.Dice.D20Roll;
  const mode = advantage ? ADV_MODE.ADVANTAGE : ADV_MODE.DISADVANTAGE;
  const extraCount = advantage && d20.options.elvenAccuracy ? 2 : 1;

  // Same per-die modifiers as the original, such as Halfling Lucky's r1=1 and Reliable Talent's min10.
  const dieModifiers = d20.modifiers.filter((m) => !/^(adv|dis|kh|kl)/i.test(m)).join("");
  const extras = [];
  for (let i = 0; i < extraCount; i++) {
    extras.push(await new foundry.dice.Roll(`1d${d20.faces}${dieModifiers}`).evaluate());
  }

  // One set per die; only active results count, as rerolled ones are already set aside.
  const sets = [d20.results.filter((r) => r.active), ...extras.map((extra) => extra.dice[0].results)];
  const kept = keptSetIndex(
    sets.map((set) => set.filter((r) => r.active).reduce((sum, r) => sum + r.result, 0)),
    advantage,
  );
  sets.forEach((set, index) => {
    if (index === kept) return;
    for (const r of set) {
      if (!r.active) continue;
      r.active = false;
      r.discarded = true;
    }
  });
  for (const extra of extras) d20.results.push(...extra.dice[0].results);

  // Match what a roll made with advantage looks like: the mode in options and an adv/dis modifier.
  d20.modifiers = d20.modifiers.filter((m) => !/^(adv|dis|kh|kl)/i.test(m));
  d20.modifiers.push(advantage ? (extraCount > 1 ? `adv${extraCount}` : "adv") : "dis");
  d20.number = extraCount + 1;
  d20.options.advantageMode = mode;
  roll.options.advantageMode = mode;
  roll._total = roll._evaluateTotal();
  roll.resetFormula();

  await showExtraDice(result, extras);
  const label = game.i18n.localize(advantage ? "DND5E.Advantage" : "DND5E.Disadvantage");
  await result.update({
    rolls: result.rolls.map((r) => (r === original ? roll : r).toJSON()),
    flavor: `${result.flavor ?? ""} (${label})`,
  });
}

function menuEntries(message) {
  const rowFor = (li) => findRow(message, li.dataset.uuid);
  const resultFor = (li) => rowFor(li)?.target.result ?? null;
  const canUpgrade = (li) => !!upgradableRoll(resultFor(li));
  return [
    {
      label: "GROUP-ROLLS.reset",
      icon: "fa-solid fa-arrow-rotate-left",
      visible: (li) => message.isOwner && !!rowFor(li)?.completed,
      onClick: (event, li) => updateTargets(message, resetTarget(message.system.toObject().targets, li.dataset.uuid)),
    },
    {
      label: "GROUP-ROLLS.reroll-advantage",
      icon: "fa-solid fa-circle-chevron-up",
      visible: canUpgrade,
      onClick: (event, li) => upgradeResult(resultFor(li), true),
    },
    {
      label: "GROUP-ROLLS.reroll-disadvantage",
      icon: "fa-solid fa-circle-chevron-down",
      visible: canUpgrade,
      onClick: (event, li) => upgradeResult(resultFor(li), false),
    },
    {
      label: "GROUP-ROLLS.remove",
      icon: "fa-solid fa-user-minus",
      visible: () => message.isOwner,
      onClick: (event, li) => updateTargets(message, removeTarget(message.system.toObject().targets, li.dataset.uuid)),
    },
  ];
}

/**
 * Only rows with at least one option get the menu. A matched row stops the
 * event, so an empty menu would also block core's message menu.
 */
function addRowMenu(message, html, rows) {
  let any = false;
  for (const row of rows) {
    if (!message.isOwner && !upgradableRoll(row.target.result)) continue;
    const li = html.querySelector(`.targets [data-uuid="${CSS.escape(row.uuid)}"]`);
    if (!li) continue;
    li.classList.add("dmm-group-roll-row");
    any = true;
  }
  if (!any) return;
  new foundry.applications.ux.ContextMenu(html, ".dmm-group-roll-row", menuEntries(message), {
    jQuery: false,
    fixed: true,
  });
}
