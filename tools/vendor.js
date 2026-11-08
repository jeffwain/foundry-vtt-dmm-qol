/**
 * Copies third-party browser builds from node_modules into the module, since
 * Foundry loads files straight from the module folder with no bundler.
 *
 *   npm run vendor            copy the files
 *   node tools/vendor.js --check   fail if the copies don't match node_modules
 *
 * To update a library: `npm install fuse.js@latest`, then `npm run vendor`.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const FILES = [
  ["node_modules/fuse.js/dist/fuse.basic.mjs", "scripts/token-images/vendor/fuse.basic.mjs"],
  ["node_modules/fuse.js/LICENSE", "scripts/token-images/vendor/fuse.LICENSE"],
];

// Git may check text files out with CRLF on Windows, so compare without them.
const text = (path) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const check = process.argv.includes("--check");
let stale = 0;

for (const [from, to] of FILES) {
  const src = join(root, from);
  const dest = join(root, to);
  if (!existsSync(src)) {
    console.error(`Missing ${from}. Run npm install first.`);
    process.exit(1);
  }
  if (check) {
    if (!existsSync(dest) || text(src) !== text(dest)) {
      console.error(`${to} doesn't match ${from}. Run npm run vendor.`);
      stale++;
    }
  } else {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    console.log(`${from} -> ${to}`);
  }
}

if (stale) process.exit(1);
