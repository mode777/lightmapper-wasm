# Tasks

## 1. Scene input model

- [x] 1.1 In `site/src/demos/types.ts`, replace `BakePreset` and `EnvironmentBakeOptions` with `SceneDefinition { meta, environment?, build(), bake(environment?: EnvironmentInput): BakeInput }` and move `toMeshInput` / `toEmissiveInput` from `site/src/demo-page.ts` into `site/src/demos/studio-input.ts`; verify with `npm run check --prefix site` that the only remaining errors are in the seven scene modules and `demo-page.ts` (the expected migration list).
- [x] 1.2 Migrate all seven scene modules (`ao-studio`, `cornell-box`, `emissive-alcove`, `tabletop-atlas`, `hdri-studio`, `hdri-outdoor`, `hdri-dusk`) to return a real `BakeInput` from `bake(environment)`, moving the ambient, atlas size, bounce count, hemisphere weight, prefilter radius and option values out of the deleted preset; verify with `npm run check --prefix site` that every scene compiles and that no scene module imports a removed type.
- [x] 1.3 Make `site/src/demo-page.ts` pass the scene input to the studio unchanged (`scenario.bake(loadedEnvironment)`, `studio.bake(bakeInput)`), delete the input-assembly block, initialize the bounce control and preview atlas cap from that input, and keep the quality and bounce controls as explicit `options` overrides; verify with `npm run check --prefix site` and by confirming the page still reaches `data-bake-state="done"` for all seven routes via `npm run test:smoke --prefix site`.
- [x] 1.4 Make `site/src/gallery.ts` read the atlas size, bounce count and configured-bounce total from the scene input through a memoized helper instead of `scenario.bake`; verify the card text and totals are unchanged in `npm test --prefix site` catalog coverage.
- [x] 1.5 Rewrite the preset-field assertions in `site/test/scenes.test.ts` and `site/test/catalog.test.ts` against `bake(null)` and `bake(environment)` so ambient, environment descriptor, hemisphere weight, prefilter radius, atlas size and bounce assertions keep their current coverage; verify with `npx vitest run test/scenes.test.ts test/catalog.test.ts` from `site/`.
- [x] 1.6 Prove the refactor did not change a bake: record `window.__showcase.stats` (mean, max, nonBlackRatio, bounces, atlas) for all seven scenes before the refactor, re-record after, and require exact equality; verify with the smoke run in `npm run test:smoke --prefix site` and a short stats diff noted in the change.

## 2. Thumbnails

- [x] 2.1 Recapture all seven thumbnails with `npm run capture:thumbnails --prefix site` on the verification box and commit the images with `manifest.json`; verify the seven WebP files are byte-identical to the previously checked-in files, that only the manifest source hashes changed, that `PREVIEW_VERSION` is unchanged, and that `npm test --prefix site` thumbnail checks pass.

## 3. Code view

- [x] 3.1 Add `site/src/demos/example.ts` with the fixed usage header (`createStudio`, `studio.bake(input)`, `result.lightmap`) and add `codeFor(id) = header + "\n\n" + SCENE_SOURCES[id]` to `site/src/demos/sources.ts`; verify with a unit test that the header names identifiers exported by the installed `lightmap-studio` package, so a studio rename fails the test rather than leaving stale copy.
- [x] 3.2 Render the Code view as two labeled blocks (usage header, `<id>.ts` scene input) and make the copy action copy header plus scene source; update `site/scripts/bake-smoke.mjs` to compare the panel text against `codeFor(id)` and to exercise the copy path, then verify with `CHROME_SHELL_PATH=… npm run test:smoke --prefix site`.
- [x] 3.3 Update `site/test/sources.test.ts` to assert the rendered text equals the header plus the file on disk, keep `SCENE_SOURCES` verbatim coverage, and confirm `example.ts` is not added to `SHARED_FILES`/`SHARED_SOURCE_FILES` in `site/scripts/source-hash.mjs` and `site/src/demos/coverage.ts`; verify with `npx vitest run test/sources.test.ts test/thumbnails.test.ts` from `site/`.
- [x] 3.4 Document the new Code view contract in `site/README.md` (what the two blocks show, that quality and bounce controls are runtime overrides, and that the header is not part of the thumbnail hash); verify the described commands and file names match the implementation.

## 4. Decisions and roadmap

- [x] 4.1 Add the next sequential ADR to `docs/decisions.md` recording that the showcase Code view teaches the studio input contract, citing AD-027 as implemented and AD-015 as extended without superseding it; verify the ID is sequential, the header anchor follows the existing pattern, and no accepted ADR text changes.
- [x] 4.2 Add a roadmap row for this change to `docs/wasm-improvements.md` with its ADR reference and status, and update the showcase paragraph in the root `README.md` to describe the Code view as the scene's studio input plus usage header; verify both documents describe the implemented state and that no other roadmap row changes status.
- [x] 4.3 Update the showcase paragraph in `openspec/config.yaml`'s project context only if it becomes stale (it describes the site's consumption model); verify the change is limited to the minimum necessary and does not add artifact rules.

## 5. Integration verification

- [x] 5.1 Run the full site suite with `npm run check --prefix site`, `npm test --prefix site`, `CHROME_SHELL_PATH=… npm run test:harness --prefix site` and `CHROME_SHELL_PATH=… npm run test:smoke --prefix site`; verify every suite passes and that the harness and display behavior are unchanged.
- [x] 5.2 Run `SITE_BASE=/lightmapper-wasm/ npm run build --prefix site && SITE_BASE=/lightmapper-wasm/ npm run build:check --prefix site` and verify the build still emits the hashed `lightmapper.wasm` and `xatlas.wasm` assets and passes the layout check.
- [x] 5.3 Run `npm run verify:remote` on the full pipeline and verify the root, site and headless suites are green before pushing to `Main`.

## Workflow follow-up

- Archive the change after review, confirming the thumbnails match their source hashes, `PREVIEW_VERSION` is unchanged and the ADR log describes the implemented state.
