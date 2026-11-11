# Tasks

## 1. Confirm the published package matches the frozen copy

- [x] 1.1 Pack `lightmap-studio@0.1.0` into a scratch directory (`npm pack`) and record the tarball file list, packed size, `exports` and `dependencies` (`lightmapper-wasm@^0.2.0`, `xatlas-wasm@^0.2.0`); verify the tarball ships `dist/index.js`, `dist/index.d.ts`, `README.md` and `LICENSE` and no source, tests or lockfile
- [x] 1.2 Compare the published `dist/index.js` and `dist/index.d.ts` with the local `studio/dist/` build (`sha256sum`); verify both pairs are byte-identical so removing the local copy changes no behavior
- [x] 1.3 Check every `lightmap-studio` import in `site/src` against the published declarations (`createStudio`, `isAbortError`, `StudioError`, `BakeInput`, `BakeResult`, `EmissiveMeshInput`, `EmissiveObject`, `MeshInput`, `Studio`, `StudioProgress`, `UnwrappedObject`, `UnwrappedScene`, `HemisphereWeight`, `validateEnvironment`, `EnvironmentInput`, `Vec3`); verify each name is exported

## 2. Switch the showcase to the registry package

- [x] 2.1 Change `site/package.json` to `lightmap-studio: ^0.1.0`, keep `lightmapper-wasm: file:..`, and add `overrides: { "lightmap-studio": { "lightmapper-wasm": "$lightmapper-wasm" } }`; verify the manifest is valid JSON and `npm install --prefix site` succeeds
- [x] 2.2 Regenerate `site/package-lock.json` and verify it resolves `lightmap-studio` from the npm tarball (not a link), keeps `xatlas-wasm` from the registry, and contains exactly one `node_modules/lightmapper-wasm` entry linked to `..` with no nested studio copy
- [x] 2.3 Add `site/test/studio-dependency.test.ts` asserting the `^0.1.0` range, the tarball resolution, the single local wrapper link and the absence of a nested wrapper; verify `npm test --prefix site` passes and, after temporarily setting the spec back to `file:../studio`, that the test fails with the local-resolution message before reverting
- [x] 2.4 Update the `site/vite.config.ts` comments to say the studio is a registry dependency while the wrapper stays a local link, keeping the existing `optimizeDeps.exclude` and `server.fs.allow` behavior; verify `npm run dev --prefix site` serves the gallery and `npm run build --prefix site` emits the hashed wasm assets
- [x] 2.5 Run `npm run check --prefix site`, `npm test --prefix site`, `npm run test:harness --prefix site`, `npm run test:smoke --prefix site` and `SITE_BASE=/lightmapper-wasm/ npm run build:check --prefix site` with headless Chrome; verify all pass against the installed registry package

## 3. Remove the local studio package and root wiring

- [x] 3.1 Delete `studio/` (source, tests, scripts, lockfile and build output) and remove the `studio/node_modules` and `studio/dist` entries from `.gitignore`; verify `git status` shows the deletions and no ignored studio artifacts remain
- [x] 3.2 Remove the `build:studio` and `test:studio` scripts from the root `package.json`; verify `npm run` lists no studio prefixes and `npm run typecheck` still passes
- [x] 3.3 Replace `test/studio-pack.test.mjs` with `test/pack-boundary.test.mjs` (script `test:pack`) asserting the root exports, zero runtime dependencies, and that the tarball excludes `studio/` and `site/`; verify `npm run test:pack` passes and `npm pack --dry-run` shows no studio or site files

## 4. Update CI and remote verification

- [x] 4.1 Remove the studio install, build, typecheck, unit, consumer and headless steps from `.github/workflows/publish.yml` (build-and-publish and site jobs), keeping the root `dist` build, the site install and the site suites; verify the workflow still parses (`python3 -c 'import yaml,sys; yaml.safe_load(open(".github/workflows/publish.yml"))'`) and no `--prefix studio` reference remains
- [x] 4.2 Remove the studio install/build/typecheck/unit/consumer/headless blocks from `scripts/verify-remote.sh` so the site install follows the root `dist` build and golden bake; verify `bash -n scripts/verify-remote.sh` passes and the script contains no `--prefix studio` command

## 5. Documentation, ADR and roadmap

- [x] 5.1 Add AD-027 to the index and body of `docs/decisions.md` (the showcase consumes the published studio and the local copy is removed) and mark the stage-3 handoff in AD-021/AD-025 complete without superseding them; verify every cited ADR ID exists and the AD-027 text matches the implemented dependency shape
- [x] 5.2 Update `docs/wasm-improvements.md`: mark row 16 `consume-lightmap-studio` implemented with `lightmap-studio@^0.1.0`, add the §7.16 change record, update the repository-split table and the current-state and next-change text; verify no "stage 3 planned", `file:../studio` or "frozen local copy" claim remains
- [x] 5.3 Update `AGENTS.md`, `README.md`, `WASM_SETUP.md`, `site/README.md` and `openspec/config.yaml` to describe the registry studio, the removed local package and the new build order; verify every documented command runs and no `build:studio`, `test:studio`, `--prefix studio` or local-link instruction remains (`grep`)

## 6. Integration verification

- [x] 6.1 Run the root suites (`npm test`, `npm run test:dist`, `npm run test:loader`, `npm run test:consumer`, `npm run test:pack`, `npm run typecheck`); verify the packaged consumer still emits one hashed wasm asset and the root tarball stays dependency-free
- [x] 6.2 Run `npm run test:bake`, `npm run test:shader` and `npm run test:readback` with headless Chrome; verify the golden bake, the 64/64 sampling probe and the readback-state probe pass unchanged
- [x] 6.3 Run the full site pipeline (`check`, `test`, `test:harness`, `test:smoke`, `SITE_BASE=/lightmapper-wasm/ build` and `build:check`); verify exactly one hashed `lightmapper.wasm` and `xatlas.wasm` are emitted and the seven scenarios still bake
- [x] 6.4 Confirm no scene source or thumbnail changed: verify `site/public/thumbnails` and `PREVIEW_VERSION` are untouched and the site smoke/harness results match the pre-change run
- [x] 6.5 Run `npm run verify:remote`; verify the remote pipeline builds the wasm, runs the root and site suites against the registry studio, and completes without any studio build
- [x] 6.6 Run `npx @fission-ai/openspec@latest validate --all --strict`; verify the change and the synced specs validate

## Workflow follow-up

- Archive the change after the review requirements are satisfied and the archived specs describe the registry consumption.
