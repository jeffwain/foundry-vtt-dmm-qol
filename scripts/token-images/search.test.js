/**
 * Tests for Token Image Search.
 * Run with: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  getFileName,
  getFolderPath,
  isImage,
  isVideo,
  makeCandidate,
  collectFromDigCache,
  tokenizeQuery,
  rankCandidates,
  buildFuse,
  wildcardImages,
} from "./search.js";

test("getFileName and getFolderPath decode URIs, normalize slashes, and strip query strings", () => {
  assert.equal(getFileName("tokens/monsters/goblins/Goblin%20Warrior.v1.webp?sig=123#top"), "Goblin Warrior.v1");
  assert.equal(getFolderPath("tokens\\monsters\\goblins\\Goblin%20Warrior.webp?sig=123"), "tokens/monsters/goblins");
  assert.equal(getFileName("standalone.png"), "standalone");
  assert.equal(getFolderPath("standalone.png"), "");
  assert.equal(getFileName(""), "");
  assert.equal(getFolderPath(""), "");
  // A stray % is not a valid escape; the path comes back undecoded instead of throwing.
  assert.equal(getFileName("tokens/100%25%/hero.png"), "hero");
});

test("isImage and isVideo recognise extensions including avif and presigned S3 URLs", () => {
  assert.equal(isImage("tokens/hero.avif"), true);
  assert.equal(isImage("https://bucket.s3.amazonaws.com/tokens/hero.WEBP?X-Amz-Signature=abc"), true);
  assert.equal(isVideo("tokens/loop.webm?v=2"), true);
  assert.equal(isImage("tokens/folder.with.dots/noext"), false);
  assert.equal(isVideo("tokens/notes.txt"), false);
});

test("makeCandidate precomputes lowercased name, folder, and combined full path", () => {
  const c = makeCandidate("assets/Tokens/Goblins/Chief_01.PNG");
  assert.deepEqual(c, {
    path: "assets/Tokens/Goblins/Chief_01.PNG",
    name: "Chief_01",
    nameLC: "chief_01",
    folder: "assets/Tokens/Goblins",
    folderLC: "assets/tokens/goblins",
    fullLC: "assets/tokens/goblins/chief_01",
  });
});

test("tokenizeQuery splits on whitespace, underscores, and hyphens", () => {
  assert.deepEqual(tokenizeQuery("goblin_warrior - boss  01"), ["goblin", "warrior", "boss", "01"]);
  assert.deepEqual(tokenizeQuery("   "), []);
});

test("rankCandidates orders exact -> prefix -> name substring -> multi-token name -> folder/path", () => {
  const candidates = [
    makeCandidate("tokens/goblins/warrior.webp"),            // folder match for "goblin"
    makeCandidate("tokens/monsters/hobgoblin_captain.webp"), // name substring match for "goblin"
    makeCandidate("tokens/monsters/goblin_archer.webp"),     // prefix match for "goblin"
    makeCandidate("tokens/monsters/goblin.webp"),            // exact match for "goblin"
  ];

  const { out } = rankCandidates(candidates, "goblin", 10);
  assert.deepEqual(
    out.map((c) => c.path),
    [
      "tokens/monsters/goblin.webp",
      "tokens/monsters/goblin_archer.webp",
      "tokens/monsters/hobgoblin_captain.webp",
      "tokens/goblins/warrior.webp",
    ]
  );
});

test("rankCandidates matches multi-word queries across snake_case file names and folder/file splits", () => {
  const candidates = [
    makeCandidate("tokens/goblins/warrior_01.webp"),         // tokens split across folder + name
    makeCandidate("tokens/monsters/goblin_01_warrior.webp"), // all tokens in name
    makeCandidate("tokens/monsters/goblin_warrior.webp"),    // exact after separator normalization? no, nameLC is goblin_warrior
    makeCandidate("tokens/monsters/orc_warrior.webp"),       // partial only (excluded)
  ];

  const { out } = rankCandidates(candidates, "Goblin Warrior", 10);
  assert.deepEqual(
    out.map((c) => c.path),
    [
      "tokens/monsters/goblin_01_warrior.webp",
      "tokens/monsters/goblin_warrior.webp",
      "tokens/goblins/warrior_01.webp",
    ]
  );
});

test("rankCandidates respects the result limit and deduplicates paths", () => {
  const candidates = [
    makeCandidate("tokens/goblin_1.webp"),
    makeCandidate("tokens/goblin_1.webp"),
    makeCandidate("tokens/goblin_2.webp"),
    makeCandidate("tokens/goblin_3.webp"),
  ];
  const { out } = rankCandidates(candidates, "goblin", 2);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((c) => c.path), ["tokens/goblin_1.webp", "tokens/goblin_2.webp"]);
});

test("collectFromDigCache extracts matching media and reports empty paths for fallback walk", () => {
  const cache = {
    _fileIndexCache: {
      "warrior.webp": ["assets/tokens/PC%20Art/warrior.webp", "other/folder/warrior.webp"],
      "readme.txt": ["assets/tokens/PC%20Art/readme.txt"],
    },
  };
  const found = [];
  const dataPaths = [
    { source: "data", text: "assets/tokens/PC Art" },
    { source: "data", text: "assets/tokens/missing" },
  ];

  const empty = collectFromDigCache(cache, dataPaths, found);
  assert.equal(found.length, 1);
  assert.equal(found[0].path, "assets/tokens/PC%20Art/warrior.webp");
  assert.equal(found[0].name, "warrior");
  assert.equal(found[0].folder, "assets/tokens/PC Art");
  assert.deepEqual(empty, [{ source: "data", text: "assets/tokens/missing" }]);
});

test("buildFuse loads the vendored Fuse and tolerates typos, ranking name over folder", async () => {
  const candidates = [
    makeCandidate("tokens/goblins/warrior.webp"),
    makeCandidate("tokens/monsters/goblin_chief.webp"),
    makeCandidate("tokens/monsters/orc.webp"),
  ];
  const fuse = await buildFuse(candidates, 0.3);
  const paths = fuse.search("gobln").map((r) => r.item.path);
  assert.deepEqual(paths, ["tokens/monsters/goblin_chief.webp", "tokens/goblins/warrior.webp"]);
});

/** Wildcard files the fake server knows about, keyed by actor id. */
const serverImages = new Map();
globalThis.CONFIG = {
  ux: {
    FilePicker: {
      async requestTokenImages(actorId) {
        if (!serverImages.has(actorId)) throw new Error("socket");
        return [...serverImages.get(actorId)];
      },
    },
  },
};

/** Mirrors v14 Actor: the wildcard list is cached in a true private field. */
class FakeActor {
  #tokenImages;
  constructor(id, randomImg) {
    this.id = id;
    this.pack = null;
    this.prototypeToken = { randomImg, texture: { src: "tokens/goblins/*" } };
  }
  async getTokenImages() {
    if (!this.prototypeToken.randomImg) return [this.prototypeToken.texture.src];
    try {
      this.#tokenImages ??= await CONFIG.ux.FilePicker.requestTokenImages(this.id, { pack: this.pack });
    } catch {
      this.#tokenImages = [];
    }
    return this.#tokenImages;
  }
}

test("wildcardImages returns null when the prototype token has no wildcard", async () => {
  serverImages.set("plain", ["tokens/goblins/a.webp"]);
  assert.equal(await wildcardImages(new FakeActor("plain", false)), null);
  assert.equal(await wildcardImages(null), null);
});

test("wildcardImages turns the resolved wildcard set into candidates, skipping non-media", async () => {
  serverImages.set("goblin", ["tokens/goblins/Goblin%20A.webp", "tokens/goblins/b.webm", "tokens/goblins/notes.txt"]);
  const found = await wildcardImages(new FakeActor("goblin", true));
  assert.deepEqual(found.map((c) => c.path), ["tokens/goblins/Goblin%20A.webp", "tokens/goblins/b.webm"]);
  assert.equal(found[0].name, "Goblin A");
});

test("wildcardImages with force skips the actor's private cache so new art is picked up", async () => {
  serverImages.set("lion", ["tokens/lions/a.webp"]);
  const actor = new FakeActor("lion", true);
  await wildcardImages(actor);
  serverImages.get("lion").push("tokens/lions/new.webp");
  assert.equal((await wildcardImages(actor)).length, 1);
  assert.equal((await wildcardImages(actor, { force: true })).length, 2);
});

test("wildcardImages treats a failed lookup as no wildcard set", async () => {
  assert.equal(await wildcardImages(new FakeActor("missing", true)), null);
  assert.equal(await wildcardImages(new FakeActor("missing", true), { force: true }), null);
});
