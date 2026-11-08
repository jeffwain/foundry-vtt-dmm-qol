# Build and Release instructions

## Development

```bash
npm install       # also provides Fuse.js for npm run vendor
npm run verify    # checks vendored files match node_modules, then runs the tests
```

Tests cover the pure helpers across `scripts/` and `tools/`. Foundry-coupled code is verified in-app.

Third-party browser code lives in `scripts/token-images/vendor/` and is copied from `node_modules` by `npm run vendor`. Don't edit it by hand. To update Fuse.js, run `npm install fuse.js@latest`, then `npm run vendor`.

## Releasing

`module.json`'s `version` and URLs are filled in at release during the build. Not listing on the Foundry module registry yet.

1. On GitHub, draft a new release with a tag (`v1.2.3`) and publish.
2. The Release workflow runs the checks, builds `module.json` and `module.zip` for that version, and attaches them to the release.

To check a build locally: `npm run build -- v1.2.3`, then look in `dist/`.
