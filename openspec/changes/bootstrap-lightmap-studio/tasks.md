# Tasks

## 1. Publish the `lightmapper-wasm` dependency floor (`[lightmapper-wasm]`)

- [x] 1.1 Confirm `Main` contains `lmSeed` in `src/index.js` and `types/index.d.ts` and `_srand` in the wasm export list; rebuild `dist/` with Emscripten 3.1.64 via `npm run check:emsdk`, `npm run configure:wasm`, `npm run build:wasm` and `npm run build:dist`; verify `dist/index.js` exports `lmSeed` and the wasm includes `_srand`
- [x] 1.2 Run `npm test`, `npm run typecheck`, `npm run test:dist`, `npm run test:loader` and `npm run test:consumer`; verify all pass against the rebuilt artifact
- [x] 1.3 Bump the root package version to `0.2.0` and regenerate the lockfile; verify `npm pack --dry-run` reports the new version and the tarball contains `dist/index.js` with `lmSeed` plus the rebuilt `dist/lightmapper.wasm`
- [x] 1.4 Run `npm run test:bake` and `npm run verify:remote`; verify the golden lightmap and statistics are unchanged and record the wasm/glue byte sizes (expected wasm delta from 44,136 to 44,686 bytes)
- [x] 1.5 Create the `v0.2.0` GitHub release on `Main` through the existing publish workflow; verify `npm view lightmapper-wasm@0.2.0 version` resolves, install the registry tarball in a scratch directory and confirm the installed entry exports both `createLightmapperModule` and `lmSeed`

## 2. Extract the standalone repository (`[lightmap-studio]`)

- [x] 2.1 Re-check that the unscoped npm name is available (`npm view lightmap-studio` returns `E404`); if it is taken, stop and re-plan instead of changing the package identity
- [x] 2.2 Run `git subtree split -P studio -b bootstrap/lightmap-studio` in this repository; verify the split branch has `package.json`, `src/`, `test/`, `scripts/`, `README.md` and `LICENSE` at its root and that the studio introduction commit is in its history
- [x] 2.3 Create the public `mode777/lightmap-studio` repository, push the split branch to `Main`, and set `Main` as the default branch; verify the files appear at the repository root with no `studio/` prefix
- [x] 2.4 Replace the private package metadata: name `lightmap-studio`, version `0.1.0`, remove `private`, add `repository`/`homepage`/`bugs`/`keywords`/`publishConfig`, and keep the `dist` export and `files` whitelist; verify `npm pack --dry-run` contains no private or staging metadata
- [x] 2.5 Replace `lightmapper-wasm: file:..` with `lightmapper-wasm@^0.2.0`, keep `xatlas-wasm@^0.2.0`, and regenerate the lockfile; verify `npm ci` resolves both from the registry, no `file:`/`link:`/workspace dependency remains and the dependency graph has no three.js
- [x] 2.6 Run `npm run build` and `npm run typecheck`; verify `dist/index.js` and `dist/index.d.ts` are emitted and the documented exports resolve from `dist`

## 3. Make the standalone tests checkout-independent (`[lightmap-studio]`)

- [x] 3.1 Remove `REPO_ROOT` and the parent `fs.allow` entry from `scripts/headless-test.mjs` and resolve the dependencies from the package's own `node_modules`; verify `npm run test:headless` passes from a copy of the repository placed outside this workspace with no parent checkout
- [x] 3.2 Rework `scripts/consumer-test.mjs` to `npm pack` the package, install the tarball plus Vite 6.4.5 into a scratch directory, build a consumer importing `lightmap-studio`, and assert that both `lightmapper.wasm` and `xatlas.wasm` are emitted; verify the built page loads in headless Chrome and the scratch install contains no repository-relative dependency
- [x] 3.3 Add a `test:pack` script that lists the tarball and asserts `dist/index.js`, `dist/index.d.ts`, `README.md` and `LICENSE` are present while `src/`, `test/`, `scripts/`, `.github/`, `tsconfig.json` and the lockfile are absent; verify it fails when a source path is temporarily added to `files`
- [x] 3.4 Update the unit, loader and unwrap suites for the extracted layout and add a loader assertion that the installed `lightmapper-wasm` exposes `lmSeed`; verify `npm test` passes and fails when the dependency floor is lowered in a scratch manifest
- [x] 3.5 Add `.github/workflows/ci.yml` for pushes and pull requests: Node 24, `npm ci`, build, typecheck, unit suites, packed consumer, tarball layout and headless bake with pinned `chrome-headless-shell@131.0.6778.264`; verify the workflow lints and a fresh CI run is green with no Emscripten or parent checkout

## 4. Release automation and published documentation (`[lightmap-studio]`)

- [x] 4.1 Add `.github/workflows/release.yml` for `v*` tags: run the CI gates, compare the tag version with `package.json`, then publish with `npm publish --provenance --access public` using OIDC and a `NPM_TOKEN` fallback only if required; verify a matching tag passes the guard, a mismatched tag fails before publish, and a failed gate publishes nothing
- [x] 4.2 Rewrite `README.md` for a published package: `npm install lightmap-studio`, quick start, lighting model, presets, loader options, dependency wasm assets, the three-free display recipe and the pre-1.0 versioning note; verify every documented export exists in `dist/index.d.ts` and no "private stage", `file:../studio` or "not published" text remains
- [x] 4.3 Tag `v0.1.0` and run the release workflow; verify `npm view lightmap-studio@0.1.0` resolves, the registry tarball matches the packed layout, and a clean scratch Vite install emits both wasm assets and completes a headless bake

## 5. Update the parent repository decisions, roadmap and staging note (`[lightmapper-wasm]`)

- [x] 5.1 Add AD-025 (standalone repository, `lightmap-studio@0.1.0`, frozen local copy, stage-3 handoff) and AD-026 (tag/version guard, CI gate, provenance, `lightmapper-wasm@^0.2.0` dependency floor) to the index and body of `docs/decisions.md`; verify every cited ADR exists and AD-021/AD-024 are implemented rather than superseded
- [x] 5.2 Update `docs/wasm-improvements.md`: mark row 15 `bootstrap-lightmap-studio` implemented with the published `0.1.0` package, keep row 16 planned, update the repository split table and the current-state text; verify no "stage 2 planned" or "studio not published" wording remains
- [x] 5.3 Add the canonical-repository and frozen-copy note to `studio/README.md`, and update `openspec/config.yaml` and `site/README.md` only where they still describe stage 2 as planned; verify `studio/src`, `studio/package.json` and `site/package.json` have no functional change and the site still links `file:../studio`
- [x] 5.4 Run `npm run test:pack`, `npm run typecheck` and the site check/test/harness/smoke suites; verify the root tarball still excludes `studio/`, the root exports and dependency graph are unchanged, and the showcase consumes the local studio copy

## 6. Integration and handoff verification

- [x] 6.1 In a fresh clone of `mode777/lightmap-studio`, run `npm ci`, build, typecheck, unit suites, packed consumer, tarball layout and headless bake; verify all commands pass without this repository, Emscripten or a sibling checkout
- [x] 6.2 Install `lightmap-studio@0.1.0` from the registry into a clean scratch application, build it with Vite and run the headless page; verify both wasm assets are emitted, `lmSeed` is exercised, and a repeated bake of the deterministic scene produces identical atlas metadata and lightmap values
- [x] 6.3 Run the full parent verification: `npm run test`, `npm run test:dist`, `npm run test:loader`, `npm run test:consumer`, `npm run typecheck`, the golden bake, `npm run verify:remote`, and the site check/test/harness/smoke plus `SITE_BASE=/lightmapper-wasm/ npm run build --prefix site` and `npm run build:check --prefix site`; verify the golden is unchanged and the showcase still resolves the local studio
- [x] 6.4 Record the published versions (`lightmapper-wasm@0.2.0`, `lightmap-studio@0.1.0`), artifact sizes and the new repository URL in the change notes; confirm stage 3 (`consume-lightmap-studio`) remains planned and no functional work was duplicated between the two studio copies
- [x] 6.5 Run `npx @fission-ai/openspec@latest validate --all --strict`; verify the change and all main specs validate cleanly

## Workflow follow-up

- Archive the change only after the standalone package and the `lightmapper-wasm@0.2.0` release are published and the parent showcase still passes against the local studio copy.
- Stage 3 (`consume-lightmap-studio`) is a separate change: it removes the local `studio/`, switches `site/` to the registry package and deletes the `file:../studio` link. Do not start it here.
