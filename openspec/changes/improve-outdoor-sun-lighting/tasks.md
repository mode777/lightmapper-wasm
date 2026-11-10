# Tasks

## 1. Wrapper cosine weight

- [x] 1.1 Add `lmw_cosine_weight` and `lmwSetCosineWeights` to `wasm/lightmapper_wasm.c`, using `lmSetHemisphereWeights(ctx, lmw_cosine_weight, NULL)`, and add `_lmwSetCosineWeights` to the `EXPORTED_FUNCTIONS` list in `wasm/CMakeLists.txt`. Verify the wasm rebuild succeeds and the export is present.
- [x] 1.2 Add `lmSetCosineWeights(ctx)` to `src/index.js` with the existing pointer, context-binding and error checks; add the method to `types/index.d.ts` and document the weight change in `LIGHTMAPPER.md`. Verify `npm run typecheck` passes.
- [x] 1.3 Extend `test/smoke.test.mjs` and `test/loader-asset.mjs` for the new method and export, and confirm the unbound-context error path. Verify `npm test` and `npm run test:loader` pass.
- [x] 1.4 Rebuild the default and single-file wasm flavors and `dist`; run `npm run test:dist` and `npm run test:consumer` to confirm the package layout and consumer path are unchanged. Verify both pass.

## 2. Harness weighting option

- [x] 2.1 Add `hemisphereWeight?: "uniform" | "cosine"` to the bake scene/option types, defaulting to `uniform`, and validate values other than those two. Verify `npm run check --prefix site` and a no-option regression test.
- [x] 2.2 Call the wrapper's `lmSetCosineWeights` on every lightmapper context created during a cosine bake, after `lmCreate` and before the first hemisphere pass. Verify a multi-object cosine bake configures every context and a uniform bake does not call the method.
- [x] 2.3 Add harness tests comparing uniform and cosine results for a low sun/bright-horizon scene, plus the invalid-option rejection and cancellation/disposal path. Verify the cosine result reduces grazing response and no stale weight leaks into a later bake.
- [x] 2.4 Add a site-side sampling-budget helper using `sunAngularDiameter / (90 / hemisphereSize)` and a test that requires at least six texels for an outdoor bake sun at standard H64 and high H128. Verify a below-budget descriptor fails with the computed coverage named.

## 3. Bake sun, prefilter, smoothing and quality

- [x] 3.1 Add a bake-only sun variant to the procedural sky: keep the display disk at `0.06 rad`, use a larger and softer bake lobe in the `0.09–0.12 rad` range with a `0.02–0.03 rad` soft edge, and preserve direction, colors, intensity and orientation. Verify the sky test and the sampling-budget check.
- [x] 3.2 Add a wider HDRI prefilter option for the outdoor bake copy while keeping the full decoded HDRI for display; leave `hdri-studio` on its current prefilter. Verify the environment test confirms the bake/display variants and unchanged studio behavior.
- [x] 3.3 Reduce the outdoor smoothing presets from the current 4 and 12 passes (start at 1–2 for `sun-sky-outdoor` and 2–4 for `hdri-outdoor`), keep dilation for chart borders, and keep standard H64/high H128/preview H32. Verify the one-soft-shadow and exposure checks at both H64 and H128.
- [x] 3.4 Add harness/site checks that the outdoor bake produces one soft directional shadow rather than multiple hemicube-shaped lobes, and that H64/H128 preserve the shadow direction and approximate softness. Verify the harness suite fails if the bake sun falls below the sampling budget.

## 4. Scenes, thumbnails and records

- [x] 4.1 Set `sun-sky-outdoor` to cosine weighting, its bake-sun radius/softness and its reduced smoothing; keep the display's `0.06 rad` disk. Verify the scene test, a stage capture, and the sampling budget.
- [x] 4.2 Set `hdri-outdoor` to cosine weighting, the wider bake prefilter and its reduced smoothing; keep the full HDRI background. Verify the scene/harness tests and a stage capture showing one dominant sun with soft cloud fill.
- [x] 4.3 Confirm `ao-studio`, `cornell-box`, `emissive-alcove`, `tabletop-atlas` and `hdri-studio` keep uniform weighting and their existing environment/smoothing presets. Verify their scene tests.
- [x] 4.4 Wire the scene `hemisphereWeight` and bake-environment options through `site/src/demo-page.ts`, and confirm the stage/statistics/smoke flow does not introduce a new bake stage. Verify `CHROME_SHELL_PATH=… npm run test:smoke --prefix site`.
- [x] 4.5 Recapture all seven thumbnails and update `site/src/assets/previews/manifest.json`; `site/src/demos/types.ts` is a shared source hash. Verify the thumbnail tests, manifest hashes and a visual check of the two outdoor images.
- [x] 4.6 Add AD-020 to `docs/decisions.md` for the well-sampled area sun and cosine weighting, and update `docs/wasm-improvements.md` with the roadmap row and revised showcase status. Verify AD-020 extends AD-017 without superseding it and AD-018/AD-019 remain reserved.
- [x] 4.7 Refresh the outdoor-lighting prose in `site/README.md`, `README.md` and the project context in `openspec/config.yaml`, including the softer-shadow trade-off and the partly cloudy HDRI policy. Verify the documented commands run as written.

## 5. Integration verification

- [x] 5.1 Rebuild the wasm and dist, then run `npm test`, `npm run test:dist`, `npm run test:shader`, `npm run test:readback`, `npm run test:loader`, `npm run test:consumer` and `npm run typecheck`. Verify all root checks pass.
- [x] 5.2 Run `npm run check --prefix site`, `npm test --prefix site`, `CHROME_SHELL_PATH=… npm run test:harness --prefix site` and `CHROME_SHELL_PATH=… npm run test:smoke --prefix site`. Verify the weighting, sampling-budget and outdoor preview checks pass.
- [x] 5.3 Run `SITE_BASE=/lightmapper-wasm/ npm run build --prefix site` and `SITE_BASE=/lightmapper-wasm/ npm run build:check --prefix site`. Verify the hashed wasm and xatlas assets are emitted and referenced.
- [x] 5.4 Run `npm run verify:remote` for the full wasm and site pipeline. Verify the golden bake, root tests, site suites and production build remain green.
- [x] 5.5 Confirm `thirdparty/lightmapper/lightmapper.h` and the submodule pointer are unchanged. Confirm the default entry, loader, tarball file list and `dist/` layout are unchanged apart from the additive wrapper method and its declarations.
- [x] 5.6 Run `npx @fission-ai/openspec@latest validate --all --strict` and verify the change and all specs validate.

## Workflow follow-up

- Archive `add-hdri-environment-baking` first, then `add-sun-sky-outdoor-lighting`, then this change, so the main specs contain the environment and seven-scenario requirements this design builds on.
- No `[lightmapper]` task or submodule bump is part of this change; the wasm shim is rebuilt in this repository.
