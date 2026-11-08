/**
 * Work out which kind of image a FilePicker is being opened for.
 *
 * Core and Tidy open pickers with no hint of what they're for (no document,
 * no field), so we watch clicks instead. A capture listener notes what was
 * clicked just before the picker is constructed, and the picker takes that
 * note in its constructor.
 */

import { isTokenField } from "./folders.js";

/** A note older than this didn't open the picker being built now. */
const MAX_AGE_MS = 1500;

let pending = null;

/** The ApplicationV2 instance an element sits in. */
function appFor(el) {
  const id = el.closest(".application")?.id;
  return id ? foundry.applications.instances.get(id) : null;
}

/**
 * @param {EventTarget} target
 * @returns {{kind:string, docType?:string|null}|null}
 */
function detect(target) {
  if (!(target instanceof Element)) return null;

  // Token config and prototype token: the <file-picker> on the image field.
  // Both config apps expose the actor, so player characters can get their own folders.
  const field = target.closest("file-picker");
  if (field) {
    if (!isTokenField(field.getAttribute("name"))) return null;
    return { kind: appFor(field)?.actor?.type === "character" ? "pc-token" : "other-token" };
  }

  // Sheet image (actor portrait, item image): core, dnd5e and Tidy all mark it data-edit="img".
  const img = target.closest('[data-edit="img"]');
  if (img) {
    const doc = appFor(img)?.document;
    if (doc?.documentName === "Item") return { kind: "image", docType: "item" };
    return doc?.documentName === "Actor" ? { kind: "image", docType: doc.type } : null;
  }

  // Tidy Theme Settings: the search button beside the header/sidebar background input.
  const button = target.closest("button");
  const input = button?.closest(".form-fields")?.querySelector("input[id]");
  const id = input?.id ?? "";
  if (id.endsWith("-actor-header-background") || id.endsWith("-item-sidebar-background")) return { kind: "header" };
  return null;
}

/** Start noting picker-opening clicks. */
export function listenForPickerClicks() {
  document.addEventListener(
    "click",
    (ev) => {
      const found = detect(ev.target);
      pending = found ? { ...found, at: performance.now() } : null;
    },
    true,
  );
}

/** Take the note for the picker being built now, if there is a fresh one. */
export function takePickerRequest() {
  const note = pending;
  pending = null;
  if (!note || performance.now() - note.at > MAX_AGE_MS) return null;
  return note;
}
