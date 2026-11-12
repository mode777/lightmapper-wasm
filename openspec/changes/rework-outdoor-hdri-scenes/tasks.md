# Tasks

## 1. Checked-in Pure Sky assets

- [x] 1.1 Add `site/src/assets/environments/kloofendal_48d_partly_cloudy_puresky_1k.hdr` (1,435,119 bytes, MD5 `c69498687e876bf68d2a8b8a62234eb9`) and `site/src/assets/environments/qwantani_dusk_2_puresky_1k.hdr` (1,166,018 bytes, MD5 `d400530e33f683654e70b4a087b6fe8d`), delete the non-pure-sky `kloofendal_48d_partly_cloudy_1k.hdr`, and rewrite `site/src/assets/environments/README.md` with source, Poly Haven API endpoint, author, CC0, size, MD5, resolution, Pure Sky content and refresh commands for all three assets. Verify: `npm run fetch:hdri --prefix site -- --check` passes and the directory contains exactly the three referenced files.
- [x] 1.2 Extend the `ASSETS` table and usage text in `site/scripts/fetch-hdri.mjs` to the three assets with their sizes and MD5s. Verify: `npm run fetch:hdri --prefix site -- --check` and `npm run fetch:hdri --prefix site -- --check --asset=qwantani_dusk_2_puresky` pass offline, and an unknown `--asset` id fails with a clear message.

## 2. Remove the procedural sky scene and code path

- [x] 2.1 Delete `site/src/demos/sun-sky-outdoor.ts`, `site/src/environment/sky.ts` and `site/test/sky.test.ts`; remove the scene from `demos/index.ts`, `demos/sources.ts`, `coverage.ts` (`EXPECTED_SCENARIO_IDS`) and the `sources` coverage test; drop the `{ kind: "sky" }` union member from `demos/types.ts`; update the `sections.ts` environment description; in `demo-page.ts` remove the generator import, the environment-kind branch, the generator error path and `PREVIEW_ATLAS_CAPS`. Verify: `npm run check --prefix site` passes and a repository search finds no `sun-sky`, `createProceduralSkyEnvironment`, `generateProceduralSky` or `kind: "sky"` references outside archived planning.
- [x] 2.2 Replace the site generator import in `site/test/harness-page.ts` with a test-local `sunEnvironment({ direction, color, angularRadius, intensity })` equirect builder and port the sun-direction, intensity-scaling, occlusion, H64/H128 consistency and sky-fill checks to it. Verify: `CHROME_SHELL_PATH=… npm run test:harness --prefix site` passes without importing `src/environment/sky.ts`.
- [x] 2.3 Update the site scripts: remove the `sun-sky-outdoor` entries from `scripts/source-hash.mjs`, replace the procedural build check in `scripts/check-build.mjs` with the three-asset HDRI assertion, and update `scripts/bake-smoke.mjs` to expect seven cards, an environment filter containing `hdri-studio`, `hdri-outdoor` and `hdri-dusk`, a `hdri-dusk` preview bake, no `sun-sky-outdoor` route bake, and a not-found check for the removed route. Verify: `SITE_BASE=/lightmapper-wasm/ npm run build --prefix site && npm run build:check --prefix site` and `CHROME_SHELL_PATH=… npm run test:smoke --prefix site` pass.
- [x] 2.4 Update `site/test/scenes.test.ts` (remove the procedural scene cases, add dusk/pure-sky assertions), `site/test/environment.test.ts` (three asset URL cases) and any catalog/thumbnail/source test that names the removed scene or the old asset; assert the sampling budget for both outdoor HDRI scenes. Verify: `npm test --prefix site` passes and reports the seven-scenario catalog.

## 3. Dusk scene and Pure Sky outdoor swap

- [x] 3.1 Point `site/src/demos/hdri-outdoor.ts` at the Pure Sky Kloofendal asset and update its title/description to say the background has no baked terrain; keep the mesh set, camera, prefilter radius, smoothing and cosine weighting. Verify: the scene test asserts the Pure Sky URL and the source hash for `hdri-outdoor` changes.
- [x] 3.2 Add `site/src/demos/hdri-dusk.ts` with the design's eight-mesh courtyard, dusk-tuned albedos and camera, and the 1024²/H64/two-bounce/black-ambient/cosine/`prefilterRadius: 3`/twelve-smoothing preset; register it in `demos/index.ts`, `demos/sources.ts` and `coverage.ts`. Verify: `npm test --prefix site` validates its geometry, emitter-free environment, source coverage and six-texel sampling budget at H64/H128, and `npm run check --prefix site` passes.
- [x] 3.3 Add the dusk scene to the catalog metadata tests and the `environment` section coverage expectations, and confirm `PREVIEW_VERSION` stays 1 because the preview viewport, lighting, materials and CSS are unchanged. Verify: `npm test --prefix site` passes the section counts, catalog order and manifest-version assertions.

## 4. Thumbnails

- [x] 4.1 Recapture all seven previews on the verification box with `CHROME_SHELL_PATH`, delete `site/src/assets/previews/sun-sky-outdoor.webp`, add `hdri-dusk.webp`, and commit the regenerated `manifest.json` in catalog order. Inspect the dusk and outdoor images for the warm dusk fill, soft shadows and a background with no baked terrain. Verify: `npm test --prefix site` passes the manifest dimensions, source-hash, catalog-order and orphan-image checks.

## 5. Decisions, roadmap and documentation

- [x] 5.1 Add AD-028 to `docs/decisions.md` recording the HDRI-only showcase policy, the Pure Sky asset choice, the removed procedural generator and dusk scene scope; state that it extends AD-017 and retires AD-020's procedural-scene smoothing clause without superseding AD-020. Verify: the ADR log is sequential, AD-020 remains accepted and unchanged, and no accepted decision is contradicted.
- [x] 5.2 Update `docs/wasm-improvements.md` with roadmap row 17 (`rework-outdoor-hdri-scenes`, AD-028), the current-state seven-scenario prose, the three-asset description and a 7.17 implementation section; add a note to 7.12 that its scene was later removed. Update the showcase sentence in `openspec/config.yaml` to the HDRI-only catalog. Verify: the docs describe the implemented HDRI-only catalog, and no current-state paragraph still claims a procedural-sky scene.
- [x] 5.3 Update the scenario table, HDRI environment section, procedural-sky subsection removal, preview/thumbnail notes and HDRI refresh commands in `site/README.md`, and the showcase scenario list in the root `README.md`. Verify: both documents list `hdri-dusk` and the three assets, contain no `sun-sky-outdoor` or procedural-sky instructions, and the documented commands match the scripts.

## 6. Integration verification

- [x] 6.1 Run the site gate from the repository root: `npm run check --prefix site`, `npm test --prefix site`, `npm run test:harness --prefix site`, `npm run test:smoke --prefix site`, `SITE_BASE=/lightmapper-wasm/ npm run build --prefix site` and `npm run build:check --prefix site` with `CHROME_SHELL_PATH` set. Verify: every suite is green and the build check reports three HDRI assets.
- [x] 6.2 Run `npm run verify:remote` for the root, studio and site pipeline on the verification box; re-run the golden bake only if the diff unexpectedly touches the root package. Verify: the full pipeline passes with no change to the root wasm/dist layout, loader behavior or package consumption.
- [x] 6.3 Run `npx @fission-ai/openspec@latest validate --all --strict` and `npx @fission-ai/openspec@latest status --change rework-outdoor-hdri-scenes`. Verify: validation is clean and every planning artifact is complete.
- [x] 6.4 Commit to `Main` with a concise imperative subject and push after 6.1–6.3 are green. Verify: `git status` is clean, the commit contains only this change's implementation and planning files, and `origin/Main` is fast-forwarded.

## Workflow follow-up

- Archive the change after review, confirming `docs/decisions.md` and `docs/wasm-improvements.md` describe the implemented state and the three checked-in thumbnails/assets match their hashes.
