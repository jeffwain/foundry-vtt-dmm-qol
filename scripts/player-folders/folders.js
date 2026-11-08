/**
 * Pure helpers for Player Image Folders. Kept free of Foundry globals so they
 * can be tested with node.
 */

import { normalizeFolder, folderChain } from "../shared/files.js";
import { SEARCH_KINDS } from "./keys.js";

export { folderChain };

/** File-picker field names that hold token art (token config and prototype token). */
const TOKEN_FIELD = /(^|\.)(texture\.src|ring\.subject\.texture)$/;

/** Whether a <file-picker> field name is a token image field. */
export function isTokenField(name) {
  return TOKEN_FIELD.test(String(name ?? ""));
}

/** Whether `path` is `root` or somewhere inside it. */
export function isWithin(path, root) {
  const p = normalizeFolder(path);
  const r = normalizeFolder(root);
  if (!r) return false;
  return p === r || p.startsWith(`${r}/`);
}

/**
 * The suggested folder layout behind the dialog's Recommended Folders button.
 * Unlisted sheet types fall back to the Sheet Image defaults; search uses each
 * browse folder.
 * @returns {Record<string, {browse?:string, upload?:string}>}  A fresh object.
 */
export function recommendedFolders() {
  return {
    "pc-token": { browse: "assets/tokens/characters", upload: "assets/tokens/characters" },
    "other-token": { browse: "assets/tokens", upload: "assets/tokens/npcs" },
    image: { browse: "assets/portraits" },
    "image-character": { browse: "assets/tokens/characters", upload: "assets/tokens/characters" },
    "image-npc": { upload: "assets/tokens/characters" },
    header: { browse: "assets/backgrounds", upload: "assets/backgrounds" },
  };
}

/**
 * The folders that apply to one picker request, or null when none are set.
 *
 * Sheet-type entries (e.g. "image-character") override the kind's defaults one
 * field at a time, so an override can set just a browse or just an upload folder.
 *
 * @param {Record<string, {browse?:string, upload?:string}>} config  The saved setting.
 * @param {string} kind       "pc-token", "other-token", "image" or "header".
 * @param {string|null} [docType]  Sheet type, for the per-type overrides.
 * @returns {{browse:string, upload:string, roots:string[]}|null}
 */
export function resolveFolders(config, kind, docType = null) {
  const base = config?.[kind] ?? {};
  const override = (docType && config?.[`${kind}-${docType}`]) || {};
  const browse = normalizeFolder(override.browse || base.browse);
  if (!browse) return null;
  const upload = normalizeFolder(override.upload || base.upload);
  const roots = upload && !isWithin(upload, browse) ? [browse, upload] : [browse];
  return { browse, upload, roots };
}

/**
 * The folders the Token HUD image search walks for one kind. By default that's
 * the browse folder; unticking "Search the browse folder" (searchBrowse: false)
 * uses the kind's own list instead.
 *
 * @param {Record<string, object>} config  The saved setting.
 * @param {string} kind  "pc-token", "other-token" or "image".
 * @returns {{source:string, text:string, bucket?:string}[]}
 */
export function resolveSearchPaths(config, kind) {
  const entry = config?.[kind] ?? {};
  if (entry.searchBrowse === false) return (entry.search ?? []).filter((path) => path?.text);
  const browse = normalizeFolder(entry.browse);
  return browse ? [{ source: "data", text: browse }] : [];
}

/** Which kinds each tag from the old Token Images path editor fed. */
const OLD_TAG_KINDS = {
  token: ["pc-token", "other-token"],
  portrait: ["image"],
  both: ["pc-token", "other-token", "image"],
};

/**
 * Move the old tagged Token Images search paths into the folder config, as
 * each kind's own search list. A kind that already has its own list is left alone.
 *
 * @param {Record<string, object>} config  The saved folder setting.
 * @param {{type?:string, source?:string, text:string, bucket?:string}[]} oldPaths
 * @returns {Record<string, object>}  A new config; the input is not changed.
 */
export function migrateSearchPaths(config, oldPaths) {
  const out = structuredClone(config ?? {});
  for (const kind of OLD_TAG_KINDS.both) {
    if (out[kind]?.searchBrowse !== undefined) continue;
    const search = (oldPaths ?? [])
      .filter((path) => path?.text && OLD_TAG_KINDS[path.type || "both"]?.includes(kind))
      .map(({ source = "data", text, bucket }) => (source === "s3" && bucket ? { source, text, bucket } : { source, text }));
    if (search.length) out[kind] = { ...out[kind], searchBrowse: false, search };
  }
  return out;
}

/**
 * Keep a browse target inside the allowed folders. Anything outside goes back
 * to the first one.
 *
 * @param {string} target
 * @param {string[]} roots
 * @returns {string}
 */
export function clampTarget(target, roots) {
  const t = normalizeFolder(target);
  return roots.some((root) => isWithin(t, root)) ? t : roots[0];
}

/**
 * Whether the Token HUD image search has any folder to look in, for any kind.
 * @param {Record<string, object>} config  The saved setting.
 */
export function hasSearchFolders(config) {
  return SEARCH_KINDS.some((kind) => resolveSearchPaths(config, kind).length > 0);
}
