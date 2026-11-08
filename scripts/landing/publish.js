/**
 * Publishing the landing page background.
 *
 * The login page loads no module code, so the only way to change it is to
 * write into the world manifest. While a world is active, Foundry's /setup
 * route accepts an "editWorld" action from any GAMEMASTER (no admin password),
 * and World.update merges the posted fields into world.json rather than
 * replacing it, so a partial update carrying just the background is safe.
 *
 * One client does the writing: the designated active GM. Otherwise every GM who
 * logs in would race to publish.
 *
 * Every entry point takes an optional `overrides` object keyed the same way as
 * the settings, so the dialog can re-roll against unsaved edits
 * without committing them.
 */

import CONSTANTS from "../shared/constants.js";
import { DEFAULTS, KEYS } from "./keys.js";
import { scanImages } from "../shared/files.js";
import { enabledImages, isRotationBackground, pickBackground } from "./render.js";

const MODULE = CONSTANTS.MODULE_NAME;

/** Read one of this feature's settings. */
function setting(key) {
  return game.settings.get(MODULE, key);
}

/**
 * Resolve the effective configuration: overrides win over stored settings.
 * @param {object} [overrides]  Partial map of setting key -> value.
 */
function config(overrides = {}) {
  const get = (key) => (key in overrides ? overrides[key] : setting(key));
  return {
    imageFolder: get(KEYS.IMAGE_FOLDER) || DEFAULTS.IMAGE_FOLDER,
    images: get(KEYS.IMAGES),
  };
}

/** Whether the world's current background is one this feature put there. */
function backgroundIsOurs() {
  const cfg = config();
  return isRotationBackground(game.world.background, cfg.imageFolder, cfg.images);
}

/**
 * The images currently in rotation: ticked, and still present on disk.
 * @param {object} [overrides]
 * @returns {Promise<string[]>}
 */
export async function imagesInRotation(overrides = {}) {
  const cfg = config(overrides);
  return enabledImages(await scanImages(cfg.imageFolder), cfg.images);
}

/**
 * POST an editWorld update to the /setup route.
 * @param {object} changes  Partial world fields.
 * @returns {Promise<boolean>}
 */
async function submitWorldUpdate(changes) {
  try {
    const response = await foundry.utils.fetchJsonWithTimeout(foundry.utils.getRoute("setup"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "editWorld", id: game.world.id, ...changes }),
    });
    if (response?.error) throw new Error(response.error);
    game.world.updateSource(response);
    return true;
  } catch (err) {
    console.error("dmm-quality-of-life | landing: editWorld failed", err);
    ui.notifications.error(game.i18n.format("LANDING.publish-failed", { error: err.message ?? err }));
    return false;
  }
}

/**
 * Pick a background from the rotation and write it into the world manifest.
 *
 * @param {object} [options]
 * @param {boolean} [options.reroll=true]  Pick a fresh background.
 * @param {boolean} [options.notify=true]  Show a confirmation notification.
 * @param {object} [options.overrides]     Unsaved values to publish instead of settings.
 * @returns {Promise<boolean>}             Whether anything was written.
 */
export async function publishLandingPage({ reroll = true, notify = true, overrides = {} } = {}) {
  if (!game.user?.isGM) return false;

  const rotation = await imagesInRotation(overrides);
  if (!rotation.length) return false;

  const current = game.world.background ?? "";
  const background = reroll
    ? pickBackground(rotation, { exclude: current })
    : rotation.includes(current)
      ? current
      : pickBackground(rotation);
  if (!background || background === current) return false;

  const ok = await submitWorldUpdate({ background });
  if (ok && notify) ui.notifications.info(game.i18n.localize("LANDING.published"));
  return ok;
}

/**
 * Swap to a different background.
 *
 * @param {object} [overrides]
 * @returns {Promise<string|null>}  The new background, or null if none was set.
 */
export async function rerollBackground(overrides = {}) {
  if (!game.user?.isGM) return null;

  const rotation = await imagesInRotation(overrides);
  if (!rotation.length) return null;

  const current = game.world.background ?? "";
  const background = pickBackground(rotation, { exclude: current });
  if (!background) return null;
  if (background === current) return background;

  return (await submitWorldUpdate({ background })) ? background : null;
}

/**
 * Restore the background captured before our first publish.
 *
 * Leaves a background alone if it isn't one of ours: if someone set one by
 * hand after we published, that wins.
 *
 * @param {object} [options]
 * @param {boolean} [options.notify=true]
 * @returns {Promise<boolean>}
 */
export async function restoreOriginal({ notify = true } = {}) {
  if (!game.user?.isGM) return false;
  if (!backgroundIsOurs()) return false;

  // background is a FilePathField with blank:false / nullable:true. An empty
  // string fails validation, so send null.
  const ok = await submitWorldUpdate({ background: setting(KEYS.SAVED_BACKGROUND) || null });
  if (ok && notify) ui.notifications.info(game.i18n.localize("LANDING.restored"));
  return ok;
}

/**
 * Remember the world's own background so "disable" can put it back. Skipped
 * when the current background is already one of ours.
 */
export async function captureOriginal() {
  if (backgroundIsOurs()) return;

  // World.background falls back to the system's background when the world has
  // none of its own. Capturing that would bake a system path into world.json on
  // restore, so treat the inherited value as "no background".
  const background = game.world.background ?? "";
  const inherited = background && background === game.system?.background;

  await game.settings.set(MODULE, KEYS.SAVED_BACKGROUND, inherited ? "" : background);
}

/**
 * World-load entry point. Runs on exactly one client.
 */
export async function syncOnReady() {
  if (game.users.activeGM !== game.user) return;

  if (!game.settings.get(MODULE, KEYS.ENABLED)) {
    await restoreOriginal({ notify: false });
    return;
  }

  await captureOriginal();

  const isReload = sessionStorage.getItem("dmm-landing-synced");
  sessionStorage.setItem("dmm-landing-synced", "true");

  await publishLandingPage({ reroll: !isReload, notify: false });
}
