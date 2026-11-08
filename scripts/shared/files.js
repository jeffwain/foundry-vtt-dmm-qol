/**
 * Data-folder and path helpers shared across features.
 *
 * Thin wrappers over Foundry's FilePicker for browsing and uploading. A missing
 * folder is a normal state here (assets/fonts/ may never have been created), so
 * scans resolve to an empty list rather than throwing.
 */

export const IMAGE_EXTENSIONS = [".webp", ".png", ".jpg", ".jpeg", ".gif", ".avif", ".svg"];
export const FONT_EXTENSIONS = [".woff2", ".woff", ".ttf", ".otf"];

/** The FilePicker subclass this world is actually configured to use. */
function filePicker() {
  return foundry.applications.apps.FilePicker.implementation;
}

/** Filename portion of a Data path, for display. */
export function basename(path) {
  return String(path ?? "").split("/").pop() ?? "";
}

/** Lowercased extension of a path, including the dot. "" when there is none. */
export function extensionOf(path) {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

/** Normalize a user-entered folder path: no leading or trailing slashes. */
export function normalizeFolder(folder) {
  return String(folder ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

/**
 * Every folder from `folder` down, shortest first, so each can be created in
 * turn. "a/b/c" gives ["a", "a/b", "a/b/c"].
 *
 * @param {string} folder
 * @returns {string[]}
 */
export function folderChain(folder) {
  const parts = normalizeFolder(folder).split("/").filter(Boolean);
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

/** Create each missing level of a Data folder. Existing levels just error. */
export async function ensureFolder(FP, folder) {
  for (const level of folderChain(folder)) {
    try {
      await FP.createDirectory("data", level);
    } catch {
      // Already exists, the usual case.
    }
  }
}

const SCAN_CACHE = new Map();

/** Clear the in-memory cache of scanned folders. */
export function clearFileCache() {
  SCAN_CACHE.clear();
}

/**
 * List files in a Data folder, filtered by extension.
 *
 * @param {string} folder            Data-relative folder, e.g. "assets/landing".
 * @param {string[]} extensions      Allowed extensions, lowercased with dots.
 * @param {object} [options]
 * @param {boolean} [options.force]  Bypass the cache.
 * @returns {Promise<string[]>}      Sorted Data-relative file paths; [] if the folder is missing.
 */
export async function scanFolder(folder, extensions, { force = false } = {}) {
  const target = normalizeFolder(folder);
  if (!target) return [];

  const cacheKey = `${target}|${extensions.join(",")}`;
  if (!force && SCAN_CACHE.has(cacheKey)) return SCAN_CACHE.get(cacheKey);

  try {
    const result = await filePicker().browse("data", target, { extensions });
    const files = result?.files ?? [];
    const filtered = files.filter((f) => extensions.includes(extensionOf(f))).sort((a, b) => a.localeCompare(b));
    SCAN_CACHE.set(cacheKey, filtered);
    return filtered;
  } catch (err) {
    // Missing folder, or no browse permission. Both mean "nothing to offer".
    console.debug(`dmm-quality-of-life | could not browse "${target}"`, err);
    return [];
  }
}

/** List image files in a folder. */
export function scanImages(folder, options) {
  return scanFolder(folder, IMAGE_EXTENSIONS, options);
}

/** List font files in a folder. */
export function scanFonts(folder, options) {
  return scanFolder(folder, FONT_EXTENSIONS, options);
}

/**
 * Upload a file into a Data folder, creating the folder (and any parent levels) if needed.
 *
 * @param {string} folder   Data-relative destination folder.
 * @param {File} file       File from an <input type="file">.
 * @returns {Promise<string|null>}  The stored path, or null when the upload failed.
 */
export async function uploadTo(folder, file) {
  const target = normalizeFolder(folder);
  if (!target || !file) return null;

  const FP = filePicker();
  await ensureFolder(FP, target);

  const response = await FP.upload("data", target, file);
  clearFileCache();
  return response?.path ?? null;
}
