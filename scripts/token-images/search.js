/**
 * Token Image Search
 *
 * The image search behind the Token HUD "alternate images" button:
 *   - walk a configurable list of paths (local data, S3, ForgeVTT)
 *   - collect image/video files
 *   - rank them against a search string, with Fuse.js for typo tolerance
 *
 * GM-only, single result set.
 *
 * The paths come from the Search Folder of each kind in Image Folders
 * (player-folders): PC tokens, other tokens, or portraits / sheet images.
 *
 * Performance: the candidate file list (and its Fuse index) is built once and
 * cached per kind, then reused across searches until that kind's search
 * paths, fuzziness, or the Dig Down cache change. When the optional
 * "Dig Down – Advanced Search" (fuzzy-foundry) module is installed, active,
 * and the integration setting is on, local ("data") paths are served from its
 * prebuilt, disk-persisted file index instead of being re-walked — the
 * difference between instant and unusable on large (tens of thousands) libraries.
 * Non-local sources (S3/Forge) always fall back to a direct recursive walk.
 */

import CONSTANTS from "../shared/constants.js";
import { KEYS } from "../player-folders/keys.js";
import { resolveSearchPaths } from "../player-folders/folders.js";

// Loaded on first fuzzy search; most searches never need it.
let fuseModule = null;
const loadFuse = () => (fuseModule ??= import("./vendor/fuse.basic.mjs").then((m) => m.default));

const MEDIA_KIND = new Map([
  ...["jpg", "jpeg", "png", "svg", "webp", "gif", "avif"].map((ext) => [ext, "image"]),
  ...["mp4", "ogg", "webm", "m4v"].map((ext) => [ext, "video"]),
]);

/** Maximum concurrent FilePicker.browse calls when walking folder trees. */
const WALK_CONCURRENCY = 6;

const FilePickerImpl = () => foundry.applications.apps.FilePicker.implementation;

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/** decodeURI, but a malformed escape leaves the path as it was. */
function tryDecode(path) {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

function stripQueryAndHash(path) {
  const idx = path.search(/[?#]/);
  return idx === -1 ? path : path.slice(0, idx);
}

/**
 * Split a decoded, forward-slashed path into its directory and file-name stem.
 * @param {string} cleanPath  Decoded path with query/hash stripped and `/` slashes.
 * @returns {{name:string, folder:string}}
 */
function splitDecodedPath(cleanPath) {
  const slashIdx = cleanPath.lastIndexOf("/");
  const folder = slashIdx === -1 ? "" : cleanPath.slice(0, slashIdx);
  const base = slashIdx === -1 ? cleanPath : cleanPath.slice(slashIdx + 1);
  const dotIdx = base.lastIndexOf(".");
  const name = dotIdx > 0 ? base.slice(0, dotIdx) : base;
  return { name, folder };
}

export function getFileName(path) {
  if (!path) return "";
  const clean = stripQueryAndHash(tryDecode(String(path))).replace(/\\/g, "/");
  return splitDecodedPath(clean).name;
}

/**
 * The directory portion of a path (everything before the final slash), decoded
 * for display/search. e.g. "tokens/monsters/goblins/warrior_01.png" -> the
 * "tokens/monsters/goblins" part. Used so a search can match on folder names,
 * not just the file name.
 */
export function getFolderPath(path) {
  if (!path) return "";
  const clean = stripQueryAndHash(tryDecode(String(path))).replace(/\\/g, "/");
  return splitDecodedPath(clean).folder;
}

/**
 * Build a search candidate from a raw path. Precomputes the lowercased name,
 * folder, and combined path once (at enumeration time) so per-keystroke
 * matching is a plain `includes()` with no repeated `decodeURI()` or
 * `toLowerCase()` over the whole library.
 *
 * @param {string} rawPath
 * @param {string} [preDecoded]  Optional already-decoded, slash-normalized path.
 */
export function makeCandidate(rawPath, preDecoded) {
  const clean =
    preDecoded ?? stripQueryAndHash(tryDecode(String(rawPath ?? ""))).replace(/\\/g, "/");
  const { name, folder } = splitDecodedPath(clean);
  const nameLC = name.toLowerCase();
  const folderLC = folder.toLowerCase();
  return {
    path: rawPath,
    name,
    nameLC,
    folder,
    folderLC,
    fullLC: folderLC ? `${folderLC}/${nameLC}` : nameLC,
  };
}

function getExtension(path) {
  if (!path) return "";
  const clean = stripQueryAndHash(String(path));
  const dot = clean.lastIndexOf(".");
  const slash = Math.max(clean.lastIndexOf("/"), clean.lastIndexOf("\\"));
  return dot > slash ? clean.slice(dot + 1).toLowerCase() : "";
}

/** "image", "video", or undefined for anything else. */
const mediaKind = (path) => MEDIA_KIND.get(getExtension(path));

export const isImage = (path) => mediaKind(path) === "image";
export const isVideo = (path) => mediaKind(path) === "video";
const isMedia = (path) => mediaKind(path) !== undefined;

// ---------------------------------------------------------------------------
// Source walking
// ---------------------------------------------------------------------------

/**
 * Browse a single directory on the given source.
 */
function browseDir(source, text, bucket) {
  if (source === "s3") {
    return FilePickerImpl().browse("s3", text, bucket ? { bucket } : {});
  }
  return FilePickerImpl().browse(source, text);
}

/**
 * Recursively collect media files reachable from one or more configured paths
 * using a bounded concurrency pool of `browse` requests.
 * @param {Array<{text:string, source?:string, bucket?:string}>} roots  Configured search paths.
 * @param {Array} found  Accumulator.
 */
async function walkPaths(roots, found) {
  const queue = roots.map((p) => ({
    source: p.source || "data",
    text: p.text,
    bucket: p.bucket,
  }));
  if (!queue.length) return;

  let active = 0;
  let index = 0;

  await new Promise((resolve) => {
    const pump = () => {
      if (index >= queue.length && active === 0) {
        resolve();
        return;
      }
      while (active < WALK_CONCURRENCY && index < queue.length) {
        const item = queue[index++];
        active++;
        browseDir(item.source, item.text, item.bucket)
          .then((listing) => {
            if (!listing || listing.target === ".") return;
            for (const src of listing.files || []) {
              // Keep the raw path Foundry returned — that's the form texture.src expects.
              // makeCandidate() decodes internally for the display/search fields only.
              if (isMedia(src)) found.push(makeCandidate(src));
            }
            for (const dir of listing.dirs || []) {
              queue.push({ source: item.source, text: dir, bucket: item.bucket });
            }
          })
          .catch(() => {
            console.warn(`${CONSTANTS.MODULE_NAME} | Search path not found: ${item.source}:${item.text}`);
          })
          .finally(() => {
            active--;
            pump();
          });
      }
    };
    pump();
  });
}

/**
 * The search paths set for one kind ("pc-token", "other-token" or "image").
 * @returns {{source:string, text:string, bucket?:string}[]}
 */
export function searchPathsFor(kind) {
  return resolveSearchPaths(game.settings.get(CONSTANTS.MODULE_NAME, KEYS.FOLDERS), kind);
}

/**
 * Validate a single configured path by walking it directly through the
 * FilePicker (ground truth — deliberately bypasses the Dig Down index) and
 * counting the media files under it. Used by the settings UI so the user can
 * confirm a folder actually resolves and has content before saving.
 * @param {{text:string, source?:string, bucket?:string}} path
 * @param {number} [cap=2000]  Stop counting past this many (keeps big libraries snappy).
 * @returns {Promise<{ok:boolean, count:number, capped?:boolean, error?:"not-found"|"empty"|string}>}
 */
export async function validateSearchPath(path, cap = 2000) {
  const source = path?.source || "data";
  if (!path?.text) return { ok: false, count: 0, error: "empty" };

  let count = 0;
  let capped = false;

  // Browse the root first so a missing top-level folder reports "not-found".
  let rootListing;
  try {
    rootListing = await browseDir(source, path.text, path.bucket);
  } catch (err) {
    return { ok: false, count: 0, error: "not-found" };
  }

  if (!rootListing || rootListing.target === ".") {
    return { ok: false, count: 0, error: "empty" };
  }

  const queue = [];
  const consumeListing = (listing) => {
    for (const src of listing.files || []) {
      if (isMedia(src) && ++count >= cap) {
        capped = true;
        return;
      }
    }
    for (const dir of listing.dirs || []) {
      queue.push(dir);
    }
  };

  consumeListing(rootListing);

  if (!capped && queue.length) {
    let active = 0;
    let index = 0;
    await new Promise((resolve) => {
      const pump = () => {
        if (capped || (index >= queue.length && active === 0)) {
          if (active === 0) resolve();
          return;
        }
        while (!capped && active < WALK_CONCURRENCY && index < queue.length) {
          const dir = queue[index++];
          active++;
          browseDir(source, dir, path.bucket)
            .then((listing) => {
              if (!capped && listing && listing.target !== ".") consumeListing(listing);
            })
            .catch(() => {})
            .finally(() => {
              active--;
              pump();
            });
        }
      };
      pump();
    });
  }

  return { ok: count > 0, count, capped, error: count ? undefined : "empty" };
}

// ---------------------------------------------------------------------------
// Dig Down (fuzzy-foundry) optional integration
// ---------------------------------------------------------------------------

/**
 * Resolve the live Dig Down file index, or null when it can't (or shouldn't) be
 * used. Guards on: the integration setting, the module being active, and the
 * cache actually being present and populated (it builds asynchronously and can
 * be null when the feature is disabled in Dig Down itself).
 * @returns {object|null} The FilePickerDeepSearch instance, or null.
 */
function digDownCache() {
  if (!game.settings.get(CONSTANTS.MODULE_NAME, "ti-use-dig-down")) return null;
  if (!game.modules.get("fuzzy-foundry")?.active) return null;
  const cache = globalThis.canvas?.deepSearchCache;
  const index = cache?._fileIndexCache;
  if (!index || typeof index !== "object" || Object.keys(index).length === 0) return null;
  return cache;
}

/**
 * Decode and normalize a path: forward slashes, no leading "./" or "/", and no
 * trailing slashes. Preserves original casing so `collectFromDigCache` can
 * pass the decoded path straight into `makeCandidate` without decoding twice.
 */
function decodeCleanPath(p) {
  return stripQueryAndHash(tryDecode(String(p ?? "")))
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .replace(/\/+$/, "");
}

/**
 * Normalize a path/prefix for case-insensitive comparison. Configured paths are
 * typed by hand (may contain literal spaces) while the cache stores URL-encoded
 * paths; decoding both sides lets prefix matching line up.
 */
function normalizePath(p) {
  return decodeCleanPath(p).toLowerCase();
}

/**
 * Pull candidates from the Dig Down index for all given local ("data") paths in
 * a single pass. Returns the subset of `dataPaths` that matched nothing so the
 * caller can fall back to walking them directly.
 * @param {object} cache  FilePickerDeepSearch instance.
 * @param {Array<{text:string}>} dataPaths  Configured local paths to include.
 * @param {Array<{path:string,name:string}>} found  Accumulator.
 * @returns {Array<{text:string}>}  Paths that had zero matches in the index.
 */
export function collectFromDigCache(cache, dataPaths, found) {
  const entries = dataPaths
    .map((path) => ({ path, prefix: `${normalizePath(path.text)}/` }))
    .filter((e) => e.prefix !== "/");
  if (!entries.length) return [];

  const matched = new Set();
  const index = cache._fileIndexCache;
  for (const fileName in index) {
    for (const rawPath of index[fileName]) {
      if (!isMedia(rawPath)) continue;
      const decoded = decodeCleanPath(rawPath);
      const norm = decoded.toLowerCase();
      let hit = false;
      for (const entry of entries) {
        if (norm.startsWith(entry.prefix)) {
          matched.add(entry.path);
          hit = true;
        }
      }
      if (hit) found.push(makeCandidate(rawPath, decoded));
    }
  }
  return entries.filter((e) => !matched.has(e.path)).map((e) => e.path);
}

/**
 * Walk the given search paths and return a de-duplicated image list. Local ("data") paths are served from the Dig Down
 * index when available; everything else (and all paths without Dig Down) is
 * walked recursively via the FilePicker.
 *
 * Fallback: a "data" path that the Dig Down index yields nothing for is walked
 * directly. The index and a hand-typed path can disagree on form (URL-encoding,
 * a Forge/S3 URL prefix, a folder Dig Down hasn't indexed, or a noscan'd dir),
 * and without this fallback such a path would silently return zero results.
 * @param {{text:string, source?:string, bucket?:string}[]} paths  From searchPathsFor().
 * @param {object|null} [cache]  Dig Down cache from digDownCache(), or null.
 * @returns {Promise<Array<{path:string,name:string}>>}
 */
async function collectAllImages(paths, cache) {
  const found = [];

  // Partition the configured paths: only local "data" sources line up with the
  // Dig Down index (relative paths). S3/Forge store absolute URLs there, so we
  // always walk those directly.
  const dataPaths = [];
  const toWalk = [];
  for (const path of paths) {
    if (!path?.text) continue;
    if (cache && (path.source || "data") === "data") dataPaths.push(path);
    else toWalk.push(path);
  }

  // Scan Dig Down once for all local paths; any prefix that came back empty is
  // queued for a direct walk instead.
  if (cache && dataPaths.length) {
    const emptyPaths = collectFromDigCache(cache, dataPaths, found);
    for (const path of emptyPaths) {
      console.warn(
        `${CONSTANTS.MODULE_NAME} | Dig Down index had nothing under "${path.text}"; walking it directly.`
      );
      toWalk.push(path);
    }
  }
  if (toWalk.length) await walkPaths(toWalk, found);

  // De-duplicate by path.
  const seen = new Set();
  return found.filter((img) => {
    if (seen.has(img.path)) return false;
    seen.add(img.path);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Candidate cache
// ---------------------------------------------------------------------------

/**
 * Per-kind cache of the built candidate list and its (lazily built) Fuse
 * index. Keyed by kind ("pc-token" / "other-token" / "image"). Rebuilt only when
 * that kind's search paths, fuzziness, or the Dig Down cache identity change — so the
 * expensive enumeration happens once, not per keystroke. `fuse` starts null and
 * is only built the first time a search actually needs fuzzy augmentation.
 * @type {Map<string, {pathsKey:string, threshold:number, digRef:object|null, candidates:Array, fuse:object|null, pending:Promise|null}>}
 */
const _searchCache = new Map();

/** Invalidate all cached candidate lists (e.g. when search paths are edited). */
export function clearSearchCache() {
  _searchCache.clear();
}

/**
 * Return the cached {candidates, fuse} for a kind, rebuilding if stale.
 * Deduplicates concurrent calls for the same kind while a scan is in flight.
 */
async function getSearchData(kind) {
  const key = kind;
  const paths = searchPathsFor(kind);
  const pathsKey = JSON.stringify(paths);
  const threshold = game.settings.get(CONSTANTS.MODULE_NAME, "ti-fuzzy-threshold") ?? 0.3;
  const cache = digDownCache();

  const cached = _searchCache.get(key);
  if (cached && cached.pathsKey === pathsKey && cached.threshold === threshold && cached.digRef === cache) {
    if (cached.pending) await cached.pending;
    return cached;
  }

  // Fuse is built lazily (see getFuse) — the common case is satisfied by the
  // substring pass and never touches it, so we don't pay the index-build cost
  // (which is significant on tens-of-thousands-file libraries) up front.
  const entry = { pathsKey, threshold, digRef: cache, candidates: [], fuse: null, pending: null };
  entry.pending = collectAllImages(paths, cache)
    .then((candidates) => {
      entry.candidates = candidates;
      entry.pending = null;
    })
    .catch((err) => {
      if (_searchCache.get(key) === entry) _searchCache.delete(key);
      throw err;
    });

  _searchCache.set(key, entry);
  await entry.pending;
  return entry;
}

/**
 * A Fuse index over candidates, weighted so file-name matches rank above
 * folder-name matches. `threshold` is the Search Fuzziness setting (0–1).
 */
export async function buildFuse(candidates, threshold) {
  const Fuse = await loadFuse();
  return new Fuse(candidates, {
    keys: [
      { name: "name", weight: 0.7 },
      { name: "folder", weight: 0.3 },
    ],
    includeScore: true,
    minMatchCharLength: 1,
    ignoreLocation: true,
    threshold,
  });
}

/** Build the entry's Fuse index once, on the first search the fast passes can't fill. */
async function getFuse(entry) {
  entry.fuse ??= await buildFuse(entry.candidates, entry.threshold);
  return entry.fuse;
}

// ---------------------------------------------------------------------------
// Public search API
// ---------------------------------------------------------------------------

/**
 * Split a lowercased query into individual search terms on spaces, hyphens, or
 * underscores so a multi-word actor name like "Goblin Warrior" can match
 * `goblin_warrior_01.webp` or `goblins/warrior.webp` without needing Fuse.
 * @param {string} q  Lowercased search string.
 * @returns {string[]}
 */
export function tokenizeQuery(q) {
  return q.split(/[\s_-]+/).filter(Boolean);
}

/**
 * Rank candidates using fast in-memory substring and token passes before
 * falling back to Fuse:
 *   1. Exact file-name match (`goblin` == `goblin.png`)
 *   2. File-name prefix match (`goblin` -> `goblin_archer.png` before `hobgoblin.png`)
 *   3. File-name contiguous substring match (`goblin` -> `hobgoblin.png`)
 *   4. All query tokens present in the file name (`goblin warrior` -> `goblin_warrior_01.png`)
 *   5. Folder substring match or all query tokens across `folder/name` (`goblin warrior` -> `goblins/warrior.png`)
 *
 * @param {Array} candidates
 * @param {string} search
 * @param {number} limit
 * @returns {{out: Array, seen: Set<string>}}
 */
export function rankCandidates(candidates, search, limit) {
  const q = search.trim().toLowerCase();
  const tokens = tokenizeQuery(q);
  const multiToken = tokens.length > 1;
  const seen = new Set();
  const out = [];

  const push = (img) => {
    if (seen.has(img.path)) return false;
    out.push(img);
    seen.add(img.path);
    return out.length >= limit;
  };

  const prefixHits = [];
  const nameSubstringHits = [];
  const nameTokenHits = [];
  const folderOrPathHits = [];

  for (const img of candidates) {
    if (img.nameLC === q) {
      if (push(img)) return { out, seen };
    } else if (img.nameLC.startsWith(q)) {
      prefixHits.push(img);
    } else if (img.nameLC.includes(q)) {
      nameSubstringHits.push(img);
    } else if (multiToken && tokens.every((t) => img.nameLC.includes(t))) {
      nameTokenHits.push(img);
    } else if (
      img.folderLC.includes(q) ||
      (multiToken && tokens.every((t) => (img.fullLC ?? `${img.folderLC}/${img.nameLC}`).includes(t)))
    ) {
      folderOrPathHits.push(img);
    }
  }

  for (const bucket of [prefixHits, nameSubstringHits, nameTokenHits, folderOrPathHits]) {
    for (const img of bucket) {
      if (push(img)) return { out, seen };
    }
  }

  return { out, seen };
}

/**
 * Search one kind's image paths. Uses a cached candidate list, then ranked
 * substring/token passes (exact -> prefix -> name substring -> name tokens ->
 * folder/path matches), and finally fuzzy matches for typo/partial tolerance.
 * The Fuse index is only built/consulted when the fast passes don't fill the limit.
 * @param {string} search  Search text. Empty string returns the first N images.
 * @param {string} kind  "pc-token", "other-token" or "image".
 * @returns {Promise<Array<{path:string,name:string}>>}  Ranked matches.
 */
export async function searchImages(search, kind) {
  const limit = game.settings.get(CONSTANTS.MODULE_NAME, "ti-result-limit") ?? 100;
  const entry = await getSearchData(kind);
  const { candidates } = entry;

  const trimmed = search?.trim() ?? "";
  if (!trimmed) return candidates.slice(0, limit);

  const { out, seen } = rankCandidates(candidates, trimmed, limit);
  if (out.length >= limit) return out;

  // Fuzzy augmentation for anything the substring/token passes missed (lazy index).
  const fuse = await getFuse(entry);
  for (const r of fuse.search(trimmed)) {
    if (!seen.has(r.item.path)) {
      out.push(r.item);
      seen.add(r.item.path);
      if (out.length >= limit) break;
    }
  }

  return out;
}

/**
 * The images an actor's wildcard token art resolves to, as search candidates.
 * Foundry expands the wildcard server-side and caches the list on the actor
 * until reload, in a private field we can't clear. So `force` asks the server
 * directly, the same request getTokenImages() makes, to pick up new art.
 * @param {Actor|null} actor
 * @param {{force?: boolean}} [options]
 * @returns {Promise<Array|null>}  null when there's no wildcard set to show.
 */
export async function wildcardImages(actor, { force = false } = {}) {
  if (!actor?.prototypeToken?.randomImg) return null;
  try {
    const paths = force
      ? await CONFIG.ux.FilePicker.requestTokenImages(actor.id, { pack: actor.pack })
      : await actor.getTokenImages();
    const found = paths.filter(isMedia).map((p) => makeCandidate(p));
    return found.length ? found : null;
  } catch (err) {
    console.error(`${CONSTANTS.MODULE_NAME} | Could not resolve wildcard token images`, err);
    return null;
  }
}
