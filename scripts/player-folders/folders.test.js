/**
 * Tests for the Player Image Folders helpers.
 * Run with: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  isTokenField,
  isWithin,
  resolveFolders,
  resolveSearchPaths,
  migrateSearchPaths,
  clampTarget,
  folderChain,
  recommendedFolders,
  hasSearchFolders,
} from "./folders.js";

test("isTokenField matches token config and prototype token image fields only", () => {
  assert.equal(isTokenField("texture.src"), true);
  assert.equal(isTokenField("prototypeToken.texture.src"), true);
  assert.equal(isTokenField("ring.subject.texture"), true);
  assert.equal(isTokenField("img"), false);
  assert.equal(isTokenField("background.src"), false);
  assert.equal(isTokenField(undefined), false);
});

test("isWithin matches the folder and its subfolders, not lookalike siblings", () => {
  assert.equal(isWithin("assets/tokens", "assets/tokens"), true);
  assert.equal(isWithin("assets/tokens/PCs/", "/assets/tokens"), true);
  assert.equal(isWithin("assets/tokens-old", "assets/tokens"), false);
  assert.equal(isWithin("assets", "assets/tokens"), false);
  assert.equal(isWithin("assets/tokens", ""), false);
});

test("resolveFolders returns null until a browse folder is set", () => {
  assert.equal(resolveFolders({}, "token"), null);
  assert.equal(resolveFolders({ token: { upload: "assets/tokens/PCs" } }, "token"), null);
  assert.equal(resolveFolders(undefined, "token"), null);
});

test("resolveFolders only adds the upload folder as a root when it sits outside browse", () => {
  assert.deepEqual(resolveFolders({ token: { browse: "assets/tokens/", upload: "assets/tokens/PCs" } }, "token"), {
    browse: "assets/tokens",
    upload: "assets/tokens/PCs",
    roots: ["assets/tokens"],
  });
  assert.deepEqual(resolveFolders({ image: { browse: "assets/portraits", upload: "uploads/portraits" } }, "image").roots, [
    "assets/portraits",
    "uploads/portraits",
  ]);
});

test("resolveFolders lets a sheet-type override replace single fields", () => {
  const config = {
    image: { browse: "assets/sheets", upload: "assets/sheets/PCs" },
    "image-npc": { browse: "assets/sheets/npcs" },
  };
  assert.deepEqual(resolveFolders(config, "image", "npc"), {
    browse: "assets/sheets/npcs",
    upload: "assets/sheets/PCs",
    roots: ["assets/sheets/npcs", "assets/sheets/PCs"],
  });
  assert.equal(resolveFolders(config, "image", "character").browse, "assets/sheets");
  assert.equal(resolveFolders(config, "image", null).browse, "assets/sheets");
});

test("clampTarget keeps allowed targets and sends the rest to the first root", () => {
  const roots = ["assets/tokens", "uploads/tokens"];
  assert.equal(clampTarget("assets/tokens/PCs", roots), "assets/tokens/PCs");
  assert.equal(clampTarget("/uploads/tokens/", roots), "uploads/tokens");
  assert.equal(clampTarget("assets", roots), "assets/tokens");
  assert.equal(clampTarget("", roots), "assets/tokens");
});

test("folderChain lists each level to create, shortest first", () => {
  assert.deepEqual(folderChain("/assets/tokens/PCs/"), ["assets", "assets/tokens", "assets/tokens/PCs"]);
  assert.deepEqual(folderChain(""), []);
});

test("resolveSearchPaths searches the browse folder unless the kind has its own list", () => {
  assert.deepEqual(resolveSearchPaths({ "pc-token": { browse: "/assets/tokens/PCs/" } }, "pc-token"), [
    { source: "data", text: "assets/tokens/PCs" },
  ]);
  assert.deepEqual(resolveSearchPaths({}, "pc-token"), []);
  const own = {
    image: {
      browse: "assets/portraits",
      searchBrowse: false,
      search: [{ source: "data", text: "art/portraits" }, { source: "data", text: "" }, { source: "s3", text: "p", bucket: "b" }],
    },
  };
  assert.deepEqual(resolveSearchPaths(own, "image"), [
    { source: "data", text: "art/portraits" },
    { source: "s3", text: "p", bucket: "b" },
  ]);
  assert.deepEqual(resolveSearchPaths({ image: { browse: "assets/portraits", searchBrowse: false } }, "image"), []);
});

test("migrateSearchPaths files old tagged paths under the kinds they fed", () => {
  const old = [
    { type: "token", source: "data", text: "art/tokens" },
    { type: "portrait", source: "data", text: "art/portraits" },
    { type: "both", source: "s3", text: "shared", bucket: "art" },
    { source: "data", text: "untagged" },
    { type: "token", source: "data", text: "" },
  ];
  const before = { "pc-token": { browse: "assets/pcs" } };
  const out = migrateSearchPaths(before, old);
  assert.deepEqual(out["pc-token"], {
    browse: "assets/pcs",
    searchBrowse: false,
    search: [
      { source: "data", text: "art/tokens" },
      { source: "s3", text: "shared", bucket: "art" },
      { source: "data", text: "untagged" },
    ],
  });
  assert.deepEqual(out["other-token"].search, out["pc-token"].search);
  assert.deepEqual(out.image.search, [
    { source: "data", text: "art/portraits" },
    { source: "s3", text: "shared", bucket: "art" },
    { source: "data", text: "untagged" },
  ]);
  assert.deepEqual(before, { "pc-token": { browse: "assets/pcs" } });
});

test("migrateSearchPaths leaves kinds that already chose their search folders", () => {
  const config = { image: { searchBrowse: false, search: [{ source: "data", text: "mine" }] } };
  assert.deepEqual(migrateSearchPaths(config, [{ type: "portrait", text: "old" }]).image, config.image);
  assert.deepEqual(migrateSearchPaths({}, []), {});
});

test("recommendedFolders sets the house layout and leaves other sheet types to the defaults", () => {
  const config = recommendedFolders();
  assert.deepEqual(resolveFolders(config, "pc-token"), {
    browse: "assets/tokens/characters",
    upload: "assets/tokens/characters",
    roots: ["assets/tokens/characters"],
  });
  assert.deepEqual(resolveFolders(config, "other-token"), {
    browse: "assets/tokens",
    upload: "assets/tokens/npcs",
    roots: ["assets/tokens"],
  });
  assert.deepEqual(resolveFolders(config, "image"), { browse: "assets/portraits", upload: "", roots: ["assets/portraits"] });
  // Character sheets browse and upload character tokens.
  assert.equal(resolveFolders(config, "image", "character").browse, "assets/tokens/characters");
  assert.equal(resolveFolders(config, "image", "character").upload, "assets/tokens/characters");
  // NPC sheets keep the portrait browse folder but upload to character tokens.
  assert.equal(resolveFolders(config, "image", "npc").browse, "assets/portraits");
  assert.equal(resolveFolders(config, "image", "npc").upload, "assets/tokens/characters");
  assert.equal(resolveFolders(config, "image", "vehicle").upload, "");
  assert.equal(resolveFolders(config, "header").browse, "assets/backgrounds");
  assert.equal(resolveFolders(config, "header").upload, "assets/backgrounds");
  // Search uses each browse folder.
  assert.deepEqual(resolveSearchPaths(config, "other-token"), [{ source: "data", text: "assets/tokens" }]);
});

test("recommendedFolders returns a fresh object each time", () => {
  const a = recommendedFolders();
  a["pc-token"].browse = "changed";
  assert.equal(recommendedFolders()["pc-token"].browse, "assets/tokens/characters");
});

test("hasSearchFolders is false until some kind has a folder for the HUD search", () => {
  assert.equal(hasSearchFolders({}), false);
  assert.equal(hasSearchFolders(undefined), false);
  // Upload-only and header folders don't give the search anything.
  assert.equal(hasSearchFolders({ "pc-token": { upload: "assets/up" }, header: { browse: "assets/bg" } }), false);
  // An unticked search list with no paths searches nothing.
  assert.equal(hasSearchFolders({ image: { browse: "assets/portraits", searchBrowse: false, search: [] } }), false);
  assert.equal(hasSearchFolders({ "other-token": { browse: "assets/tokens" } }), true);
  assert.equal(hasSearchFolders({ image: { searchBrowse: false, search: [{ source: "s3", text: "art", bucket: "b" }] } }), true);
  assert.equal(hasSearchFolders(recommendedFolders()), true);
});
