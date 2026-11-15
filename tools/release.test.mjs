import test from "node:test";
import assert from "node:assert/strict";

import {
  bump, compareVersions, baseVersion, resolveVersion, fill, setManifestVersion,
  parseNotes, draftNotes, finishNotes, releaseBody, pickEditor, config, MANIFEST_MARKER,
  parseCommits, formatCommits, describeCompat, compatAnswer, systemIds, setCompatibility,
  FOUNDRY_VERSION, SYSTEM_VERSION,
} from "./release.mjs";

test("bump raises the chosen part and resets the ones below it", () => {
  assert.equal(bump("v0.1.9", "patch"), "0.1.10");
  assert.equal(bump("1.2.3", "minor"), "1.3.0");
  assert.equal(bump("v1.2.3", "major"), "2.0.0");
  assert.throws(() => bump("v1.2", "patch"));
  assert.throws(() => bump("1.2.3", "huge"));
});

test("bump of a pre-release finishes it rather than skipping a version", () => {
  assert.equal(bump("v1.2.3-beta.1", "patch"), "1.2.3");
  assert.equal(bump("v1.2.3-beta.1", "minor"), "1.3.0");
});

test("compareVersions orders numerically and puts pre-releases first", () => {
  assert.ok(compareVersions("0.10.0", "0.9.0") > 0);
  assert.ok(compareVersions("v1.0.0", "1.0.0") === 0);
  assert.ok(compareVersions("1.0.0-beta.2", "1.0.0") < 0);
  assert.ok(compareVersions("1.0.0-beta.10", "1.0.0-beta.2") > 0);
});

test("baseVersion is the higher of the latest release and module.json", () => {
  assert.equal(baseVersion("v0.2.0", "1.0.0"), "1.0.0", "module.json ahead of releases");
  assert.equal(baseVersion("v1.2.0", "1.0.0"), "1.2.0");
  assert.equal(baseVersion("", "1.0.0"), "1.0.0");
  assert.equal(baseVersion("", undefined), null);
});

test("resolveVersion accepts names, menu numbers and exact versions", () => {
  for (const answer of ["patch", "1", " Patch "]) assert.equal(resolveVersion(answer, "1.0.0"), "1.0.1");
  assert.equal(resolveVersion("2", "1.0.0"), "1.1.0");
  assert.equal(resolveVersion("major", "1.0.0"), "2.0.0");
  assert.equal(resolveVersion("m", "1.0.0"), null, "minor and major share a first letter");
  assert.equal(resolveVersion("v2.0.0-rc.1", "1.0.0"), "2.0.0-rc.1");
  assert.equal(resolveVersion("4", "1.0.0"), null);
  assert.equal(resolveVersion("patch", null), null, "nothing to bump from");
  assert.equal(resolveVersion("1.0.0", null), "1.0.0");
});

test("fill substitutes tag and version", () => {
  assert.equal(fill("npm run build -- {tag} # {version}", "1.2.3"), "npm run build -- v1.2.3 # 1.2.3");
});

test("setManifestVersion changes only the version", () => {
  const json = '{\n  "id": "x",\n  "version": "1.0.0",\n  "compatibility": { "minimum": "13" }\n}\n';
  assert.equal(setManifestVersion(json, "1.1.0"), json.replace('"1.0.0"', '"1.1.0"'));
  assert.throws(() => setManifestVersion('{ "id": "x" }', "1.1.0"));
});

test("parseCommits splits log entries and ignores release commits", () => {
  const log = "Release v1.2.0\x1f\x1f\x1eFix issue #1\x1fDetails\x1fNote\x1eAnother fix\x1f\x1f";
  const commits = parseCommits(log);
  assert.deepEqual(commits, [
    { subject: "Fix issue #1", body: "Details", notes: "Note" },
    { subject: "Another fix", body: "", notes: "" },
  ]);
  assert.deepEqual(parseCommits(""), []);
});

test("formatCommits formats titles and indents bodies/notes", () => {
  const commits = [
    { subject: "Fix token images", body: "", notes: "" },
    { subject: "- Already a bullet", body: "Line 1\nLine 2", notes: "" },
    { subject: "Note with git note", body: "Body", notes: "Extra note" },
  ];
  assert.equal(
    formatCommits(commits),
    "- Fix token images\n- Already a bullet\n  Line 1\n  Line 2\n- Note with git note\n  Body\n\n  Extra note",
  );
  assert.equal(formatCommits([]), "");
});

const LOG = "# v1.0.1\n\n- Fixed a thing\n\n# v1.0.0 — first\n\n- Hello\n";
const released = new Set(["1.0.0", "1.0.1"]);

test("parseNotes finds version headings, including ones with trailing text", () => {
  const { preamble, sections } = parseNotes(`draft\r\n\r\n${LOG}`);
  assert.equal(preamble, "draft\n\n");
  assert.deepEqual(sections.map((s) => s.version), ["1.0.1", "1.0.0"]);
  assert.equal(sections[1].heading, "# v1.0.0 — first");
});

test("draftNotes moves text above the first heading under the new version", () => {
  assert.equal(
    draftNotes(`## New\n- Faster census\n\n${LOG}`, "1.1.0", released),
    `# v1.1.0\n\n## New\n- Faster census\n\n${LOG}`,
  );
});

test("draftNotes picks up an unreleased heading from a cancelled run", () => {
  const cancelled = `# v1.0.2\n\n- Drafted earlier\n\n${LOG}`;
  assert.equal(draftNotes(cancelled, "1.1.0", released), `# v1.1.0\n\n- Drafted earlier\n\n${LOG}`);
  assert.equal(draftNotes(cancelled, "1.0.2", released), cancelled, "same version, nothing moves");
});

test("draftNotes populates commit notes when draft is empty", () => {
  const notes = draftNotes(LOG, "1.1.0", released, "- Fix foo\n- Fix bar");
  assert.equal(
    notes,
    `# v1.1.0\n\n- Fix foo\n- Fix bar\n\n# v1.0.1\n\n- Fixed a thing\n\n# v1.0.0 — first\n\n- Hello\n`,
  );
});

test("draftNotes appends commit notes when draft exists without duplicating", () => {
  const withDraft = `## Highlights\nAwesome\n\n${LOG}`;
  const notes = draftNotes(withDraft, "1.1.0", released, "- Fix foo");
  assert.equal(
    notes,
    `# v1.1.0\n\n## Highlights\nAwesome\n\n- Fix foo\n\n# v1.0.1\n\n- Fixed a thing\n\n# v1.0.0 — first\n\n- Hello\n`,
  );

  const alreadyHas = `## Highlights\n- Fix foo\n\n${LOG}`;
  const notes2 = draftNotes(alreadyHas, "1.1.0", released, "- Fix foo");
  assert.equal(
    notes2,
    `# v1.1.0\n\n## Highlights\n- Fix foo\n\n# v1.0.1\n\n- Fixed a thing\n\n# v1.0.0 — first\n\n- Hello\n`,
  );
});

test("draftNotes leaves a placeholder when there's no draft, and starts a new file", () => {
  assert.match(draftNotes(LOG, "1.1.0", released), /^# v1\.1\.0\n\n<!-- Notes for v1\.1\.0.*-->\n\n# v1\.0\.1\n/);
  assert.match(draftNotes("", "1.0.0", new Set()), /^# v1\.0\.0\n\n<!--.*-->\n$/);
});

test("finishNotes returns the section's notes without comments and tidies the file", () => {
  const edited = `# v1.1.0\n\n<!-- placeholder -->\n- New thing\n\n${LOG}`;
  assert.deepEqual(finishNotes(edited, "1.1.0"), { notes: "- New thing", text: `# v1.1.0\n\n- New thing\n\n${LOG}` });
  assert.deepEqual(finishNotes(`# v1.1.0\n\n<!-- x -->\n${LOG}`, "1.1.0"), { notes: "", text: `# v1.1.0\n\n${LOG}` });
  assert.equal(finishNotes(LOG, "1.1.0"), null, "heading removed while editing");
});

test("releaseBody puts the manifest marker below the notes", () => {
  assert.equal(releaseBody("- New thing"), `- New thing\n\n${MANIFEST_MARKER}\n`);
  assert.equal(releaseBody(""), `${MANIFEST_MARKER}\n`);
});

test("pickEditor takes the first usable editor and makes Zed and VS Code wait", () => {
  assert.equal(pickEditor({ configured: "zed" }), "zed --wait");
  assert.equal(pickEditor({ configured: "zed -w" }), "zed -w");
  assert.equal(pickEditor({ env: { EDITOR: "C:\\Zed\\bin\\Zed.exe" } }), "C:\\Zed\\bin\\Zed.exe --wait");
  const spaced = '"C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd"';
  assert.equal(pickEditor({ env: { EDITOR: spaced } }), `${spaced} --wait`);
  assert.equal(pickEditor({ env: { EDITOR: "/Applications/Zed.app/Contents/MacOS/cli" } }), "/Applications/Zed.app/Contents/MacOS/cli");
  assert.equal(pickEditor({ env: { VISUAL: "code", EDITOR: "vim" } }), "code --wait");
  assert.equal(pickEditor({ env: { EDITOR: "vim" }, gitEditor: "zed --wait" }), "vim");
  assert.equal(pickEditor({ gitEditor: "true", installed: ["zed"] }), "zed --wait", "git's 'no editor' is skipped");
  assert.equal(pickEditor({ env: { EDITOR: "  " } }), null);
});

test("pickEditor prefers LAUNCH_EDITOR and installed IDE over notepad", () => {
  assert.equal(pickEditor({ env: { LAUNCH_EDITOR: "zed" } }), "zed --wait");
  assert.equal(pickEditor({ env: { EDITOR: "notepad" }, installed: ["zed"] }), "zed --wait");
  assert.equal(pickEditor({ env: { EDITOR: "notepad.exe" }, installed: ["code"] }), "code --wait");
  assert.equal(pickEditor({ env: { EDITOR: "notepad" }, installed: [] }), "notepad");
});

test("config prefers npm scripts, falls back to repo files, and lets overrides win", () => {
  const npmRepo = config({ pkg: { scripts: { verify: "x", build: "y" } }, hasBuildScript: true, hasVerifyPs1: true, overrides: {} });
  assert.equal(npmRepo.verify, "npm run verify");
  assert.equal(npmRepo.build, "npm run build -- {tag}");

  const bare = config({ pkg: null, hasBuildScript: true, hasVerifyPs1: true, overrides: {} });
  assert.equal(bare.verify, "pwsh -NoProfile -File verify.ps1");
  assert.equal(bare.build, "node tools/build.mjs {tag}");

  const custom = config({ pkg: null, hasBuildScript: false, hasVerifyPs1: false, overrides: { branch: "release", build: "make {tag}" } });
  assert.deepEqual(custom, {
    branch: "release", verify: null, build: "make {tag}", workflow: "release.yml", editor: null, notes: "release-notes.md",
  });
});

test("describeCompat lists the fields that are set, in Foundry's order", () => {
  assert.equal(describeCompat({ verified: "14", minimum: "13" }), "minimum 13, verified 14");
  assert.equal(describeCompat({ minimum: "6.1.0", maximum: "6.1.x" }), "minimum 6.1.0, maximum 6.1.x");
  assert.equal(describeCompat({}), "not set");
  assert.equal(describeCompat(undefined), "not set");
});

test("compatAnswer keeps on Enter, clears on -, and rejects what isn't a version", () => {
  assert.deepEqual(compatAnswer("", "14", FOUNDRY_VERSION), { value: "14" });
  assert.deepEqual(compatAnswer("  ", undefined, FOUNDRY_VERSION), { value: undefined });
  assert.deepEqual(compatAnswer("-", "14", FOUNDRY_VERSION), { value: undefined });
  assert.deepEqual(compatAnswer("14.360", "14", FOUNDRY_VERSION), { value: "14.360" });
  assert.equal(compatAnswer("14.360.1", "14", FOUNDRY_VERSION), null, "Foundry builds have two parts");
  assert.equal(compatAnswer("v14", "14", FOUNDRY_VERSION), null);
  assert.deepEqual(compatAnswer("6.1.x", undefined, SYSTEM_VERSION), { value: "6.1.x" });
  assert.deepEqual(compatAnswer("6", undefined, SYSTEM_VERSION), { value: "6" });
  assert.equal(compatAnswer("latest", undefined, SYSTEM_VERSION), null);
});

test("systemIds takes the systems module.json already names, or the configured list", () => {
  const manifest = { relationships: { systems: [{ id: "dnd5e" }, { id: "pf2e" }] } };
  assert.deepEqual(systemIds(manifest), ["dnd5e", "pf2e"]);
  assert.deepEqual(systemIds(manifest, ["dnd5e"]), ["dnd5e"]);
  assert.deepEqual(systemIds({}), []);
});

test("setCompatibility updates Foundry and an existing system, leaving the rest alone", () => {
  const manifest = {
    id: "x",
    compatibility: { minimum: "13", verified: "13" },
    relationships: {
      systems: [{ id: "dnd5e", manifest: "https://example.com/system.json", compatibility: { minimum: "5.0.0" } }],
      requires: [{ id: "lib-wrapper" }],
    },
    url: "u",
  };
  const out = setCompatibility(manifest, {
    foundry: { minimum: "14", verified: "14.360" },
    systems: { dnd5e: { verified: "6.1.0", minimum: "6.0.0" } },
  });
  assert.deepEqual(out.compatibility, { minimum: "14", verified: "14.360" });
  assert.deepEqual(out.relationships.systems, [
    { id: "dnd5e", manifest: "https://example.com/system.json", compatibility: { minimum: "6.0.0", verified: "6.1.0" } },
  ]);
  assert.deepEqual(out.relationships.requires, [{ id: "lib-wrapper" }]);
  assert.deepEqual(Object.keys(out), ["id", "compatibility", "relationships", "url"]);
  assert.deepEqual(manifest.compatibility, { minimum: "13", verified: "13" }, "input not mutated");
});

test("setCompatibility adds a missing system right after compatibility", () => {
  const out = setCompatibility(
    { id: "x", compatibility: { minimum: "14" }, esmodules: [] },
    { systems: { dnd5e: { minimum: "6.1.0", verified: "6.1.0" } } },
  );
  assert.deepEqual(Object.keys(out), ["id", "compatibility", "relationships", "esmodules"]);
  assert.deepEqual(out.relationships, { systems: [{ id: "dnd5e", compatibility: { minimum: "6.1.0", verified: "6.1.0" } }] });
});

test("setCompatibility drops cleared fields and leaves untouched entries as they are", () => {
  const manifest = { compatibility: { minimum: "14", verified: "14", maximum: "14" } };
  assert.deepEqual(setCompatibility(manifest, { foundry: { minimum: "14", verified: "14" } }).compatibility,
    { minimum: "14", verified: "14" });
  assert.deepEqual(setCompatibility(manifest, {}), manifest);
  const cleared = setCompatibility({ relationships: { systems: [{ id: "dnd5e", compatibility: { minimum: "6" } }] } },
    { systems: { dnd5e: {} } });
  assert.deepEqual(cleared.relationships.systems, [{ id: "dnd5e" }], "still requires the system, no version range");
});
