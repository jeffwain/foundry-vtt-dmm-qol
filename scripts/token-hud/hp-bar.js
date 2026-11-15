/**
 * Which token bar holds HP, and its input in the token HUD.
 *
 * Core Foundry: HP is bar1, as before. With Bar Brawl a token can have any
 * number of bars under any IDs, so HP is the bar tracking the system's
 * primary token attribute (attributes.hp in dnd5e), falling back to bar1.
 */

/**
 * @param {{id: string, attribute?: string, hideHud?: boolean}[]} bars Bar Brawl bars, in order.
 * @param {string|null|undefined} hpAttribute The system's primary token attribute.
 * @returns {string} The bar ID to treat as HP.
 */
export function pickHpBarId(bars, hpAttribute) {
  if (hpAttribute) {
    const shown = bars.filter((bar) => bar.attribute === hpAttribute);
    // Prefer one with a HUD input, so there is something to focus.
    const bar = shown.find((b) => !b.hideHud) ?? shown[0];
    if (bar) return bar.id;
  }
  return "bar1";
}

function barBrawl() {
  const module = game.modules.get("barbrawl");
  return module?.active ? module.api : null;
}

/** @param {TokenDocument} doc */
export function hpBarId(doc) {
  const api = barBrawl();
  if (!api) return "bar1";
  return pickHpBarId(api.getBars(doc), game.system.primaryTokenAttribute);
}

/** @param {TokenDocument} doc @returns {{value: number}|null} */
export function hpBarAttribute(doc) {
  return doc.getBarAttribute(hpBarId(doc));
}

/**
 * The HP input in an open token HUD. Bar Brawl swaps core's bar boxes for its
 * own, naming each input after its bar ID.
 * @param {HTMLElement} hud
 * @param {TokenDocument} doc
 * @returns {HTMLInputElement|null}
 */
export function findHpInput(hud, doc) {
  if (!hud) return null;
  if (!barBrawl()) return hud.querySelector(".attribute.bar1 input");
  return hud.querySelector(`.attribute input[name="${CSS.escape(hpBarId(doc))}"]`);
}

/**
 * Calls back with the HP input once it is in the HUD. Bar Brawl adds its
 * inputs after an async template render, so they can arrive after
 * renderTokenHUD and after TokenHUD#bind resolves.
 * @param {HTMLElement} hud
 * @param {TokenDocument} doc
 * @param {(input: HTMLInputElement) => void} callback
 */
export function whenHpInput(hud, doc, callback) {
  const found = findHpInput(hud, doc);
  if (found || !hud) {
    if (found) callback(found);
    return;
  }
  const observer = new MutationObserver(() => {
    const input = findHpInput(hud, doc);
    if (!input) return;
    stop();
    callback(input);
  });
  // Give up if it never shows, e.g. the HP bar is hidden from the HUD.
  const timer = setTimeout(() => stop(), 1000);
  function stop() {
    observer.disconnect();
    clearTimeout(timer);
  }
  observer.observe(hud, { childList: true, subtree: true });
}
