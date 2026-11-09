# Tasks

No `[lightmapper]` tasks: this change does not touch the upstream C header and
does not bump `thirdparty/lightmapper`. The site consumes the existing
separate-asset package.

## 1. Site scaffold and tooling

- [x] 1.1 Create `site/package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json`, `vitest.config.ts`, `index.html`, `src/main.ts`, `src/app.ts`, `src/router.ts`, `src/chrome.ts`, `src/dom.ts` and `src/styles.css`; verify `npm ci --prefix site` and `npm run check --prefix site` succeed on the empty app.
- [x] 1.2 Add the site dependencies `lightmapper-wasm: file:..`, `xatlas-wasm`, `three`, `highlight.js`, Vite, Vitest and `@types/three`; verify the lockfile is checked in and the root `package.json` still has no runtime dependencies.
- [x] 1.3 Add `/site/node_modules` and `/site/dist` to `.gitignore`; verify `git status` does not show either directory.

## 2. Scene contract and geometry

- [x] 2.1 Add `src/demos/types.ts`, `sections.ts`, `coverage.ts` and `sources.ts` with the `SceneDefinition`/`SceneMesh` contract and the technique sections `ambient`, `gi`, `emissive`, `multi-object`; verify `npm run check --prefix site` succeeds.
- [x] 2.2 Add `src/demos/geometry.ts` with world-space quad, box, sphere, cylinder, torus and plane helpers that emit positions, indices and normals (split faces for hard edges, shared vertices for smooth surfaces); verify a geometry unit test covers finite positions/normals, non-empty indices and expected triangle counts.
- [x] 2.3 Add `src/demos/ao-studio.ts`, `cornell-box.ts`, `emissive-alcove.ts` and `tabletop-atlas.ts` using the shared helpers and metadata; verify the scene validation test builds every module, rejects non-finite values and confirms the tabletop scene contains at least four lit meshes plus an emitter.
- [x] 2.4 Add `src/demos/index.ts` with the four-entry catalog and `src/demos/sources.ts` raw-source imports; verify the catalog test checks unique kebab-case ids, non-empty metadata, valid sections and a source entry for every scenario.

## 3. xatlas unwrap pipeline

- [x] 3.1 Add `src/atlas/types.ts`, `stats.ts` and `unwrap.ts`: add every lit mesh to one xatlas atlas, copy positions/normals through `xref`, normalize UVs with the `[0,1)` clamp and return per-object geometry plus atlas metadata; verify `npm run check --prefix site` succeeds.
- [x] 3.2 Add `test/atlas.test.ts` covering every catalog scene: non-empty atlas, finite values, UVs in `[0,1)`, non-degenerate triangles, correct output-mesh count for the tabletop scene and emitters excluded from atlas charts; verify `npm test --prefix site` passes.
- [x] 3.3 Add a negative test for a UV exactly at the atlas edge and a UV outside the atlas, proving the clamp prevents the lightmapper's `1.0 -> 0.0` wrap and that invalid input is rejected; verify the test fails against a deliberately unclamped helper.

## 4. Raw WebGL bake harness

- [x] 4.1 Add `src/bake/types.ts` with `BakeScene`, `BakeObject`, `BakeOptions`, `BakeResult`, `BakeStats` and progress stages; verify `npm run check --prefix site` succeeds.
- [x] 4.2 Add `src/bake/gl.ts` and `src/bake/shaders.ts` with shader compilation, VAO/buffer helpers and the lit/emissive bake shader; verify a headless harness page compiles the program and reports a GL error as a clear failure.
- [x] 4.3 Add `src/bake/harness.ts` with own/caller-provided context creation, `createLightmapperModule` initialization, per-object `lmSetGeometry`, the shared-atlas bounce loop, full-scene drawing, one upload per bounce, dilation/smoothing, statistics and readback; verify the harness headless test bakes a lit quad plus an emissive ceiling and returns finite, non-zero output.
- [x] 4.4 Add the two-object shared-atlas harness test: two lit quads with separate atlas regions, assert both regions are non-zero and the upload happens once per bounce; verify `npm run test:harness --prefix site` passes.
- [x] 4.5 Add progress, yielding and cancellation coverage: assert monotonic progress, an abort during a bake rejects with an abort error and the next bake starts cleanly; verify `npm run test:harness --prefix site` passes.
- [x] 4.6 Add the package-shape audit test: the harness source imports only `lightmapper-wasm` and standard APIs, with no `three`, `xatlas-wasm` or `site/` import; verify the audit fails when a forbidden import is added.

## 5. Three.js display layer

- [x] 5.1 Add `src/display/materials.ts` and `src/display/three.ts`: create a linear `THREE.DataTexture` from `BakeResult`, lit/emissive materials, lit/unlit/wireframe modes, orbit controls, resize and ACES tone mapping; verify `npm run check --prefix site` succeeds.
- [x] 5.2 Add a display test or headless render check proving the texture dimensions/data match the result, a later bounce updates the same texture, and float-linear filtering falls back to nearest when unsupported; verify the check passes in headless Chrome.
- [x] 5.3 Add the display import-boundary test: the display layer never imports the bake harness and never calls `lmCreate`, `lmBegin` or `lmEnd`; verify the test fails when a bake call is added.
- [x] 5.4 Add resource-lifecycle coverage: disposing the display releases the renderer, texture, materials, geometries and controls, and repeated navigation leaves no active render loop; verify the test passes.

## 6. Gallery, demo page and bake controls

- [x] 6.1 Implement `src/gallery.ts` with the hero, technique filters, four cards, metadata, thumbnail fallback and `#/p/<id>` links; verify the gallery renders all four scenarios and filtering narrows the set.
- [x] 6.2 Implement `src/demo-page.ts` with 3D/Atlas/Code tabs, the bake harness and display wiring, quality/bounce controls, bake/cancel actions, progress, statistics, lightmap PNG download and scene metadata; verify the Cornell box and tabletop preview routes complete a draft bake with `data-bake-state="done"`.
- [x] 6.3 Implement the Atlas view with the baked lightmap and chart-colored UV layout, and the Code view with the exact raw scene module source and a copy action; verify switching tabs does not re-bake and the displayed source matches `sources.ts`.
- [x] 6.4 Implement `?preview=1` mode: hide header, tabs, aside, meta bar and footer, fix the stage to 16:10 and force draft quality; verify the preview route screenshots only the stage.
- [x] 6.5 Implement capability and asset failure states: no WebGL2, missing `EXT_color_buffer_float`, lightmapper asset failure and xatlas asset failure show a named error and disable bake controls; verify each state with a forced test hook.

## 7. Thumbnails

- [x] 7.1 Add `scripts/capture-thumbnails.mjs` using `vite preview` on a free port and `puppeteer-core`, waiting for `data-bake-state="done"` and writing 640×400 CSS / DPR 2 WebP images plus `manifest.json` with source hashes; verify a manual capture writes four images and the manifest.
- [x] 7.2 Add `test/thumbnails.test.ts` covering manifest settings, one non-empty WebP per scenario, source-hash drift, orphan images and the CSS fallback; verify `npm test --prefix site` passes and a changed scene fails the drift test.
- [x] 7.3 Document the recapture rule in `site/README.md`: scene changes require recapture; viewport/lighting/material/preview CSS changes require a `PREVIEW_VERSION` bump; verify the documented command runs as written.

## 8. Site validation, build check and smoke

- [x] 8.1 Add `scripts/check-build.mjs` verifying `site/dist/index.html`, the `SITE_BASE` path, a hashed `lightmapper.wasm` and `xatlas.wasm`, and that the built JavaScript references both; verify it fails when either wasm asset is removed.
- [x] 8.2 Add `scripts/bake-smoke.mjs` opening the Cornell box and tabletop preview routes in headless Chrome, waiting for done, asserting finite/non-zero statistics and failing on page errors; verify `npm run test:smoke --prefix site` passes with `CHROME_SHELL_PATH` set.
- [x] 8.3 Add the site `test`/`check`/`build`/`build:check`/`test:harness`/`test:smoke` scripts and run the full site pipeline with `SITE_BASE=/lightmapper-wasm/`; verify all commands exit zero.

## 9. CI and Pages deployment

- [x] 9.1 Add an `actions/upload-artifact` step to the build workflow for the tested `dist` directory; verify the artifact name is stable and the workflow still runs the existing build, typecheck, smoke, golden, dist, loader and consumer tests.
- [x] 9.2 Add a `site` job that downloads the `dist` artifact, runs `npm ci --prefix site`, `npm run check --prefix site`, `npm test --prefix site`, the harness test, the smoke test and `SITE_BASE=/lightmapper-wasm/ npm run build --prefix site` plus `build:check`; verify the job definition matches the local commands.
- [x] 9.3 Add a `deploy` job for `Main` push and manual dispatch with `pages: write`, `id-token: write`, the `github-pages` environment, `actions/configure-pages`, `upload-pages-artifact` and `deploy-pages`; verify a pull request does not deploy and a failed build does not deploy.
- [x] 9.4 Document the required repository setting: Pages source must be GitHub Actions, and the deployed URL is `https://mode777.github.io/lightmapper-wasm/`; verify the README instructions match the workflow.

## 10. Documentation and ADRs

- [x] 10.1 Add `site/README.md` covering local run, build, tests, the scene contract, the xatlas pipeline and `[0,1)` clamp, the harness/display boundaries, thumbnails, deployment and licensing; verify every documented command runs as written.
- [x] 10.2 Update root `README.md` with a Showcase section, the Pages URL, the `site/` directory, the four scenarios and the note that the site is not part of the npm package; verify the links resolve.
- [x] 10.3 Update `AGENTS.md` with `site/` in the repository map, the site build/test commands and the showcase boundary; verify the commands match `site/package.json`.
- [x] 10.4 Add AD-015 (separate showcase consumer deployed from the tested artifact) and AD-016 (xatlas-everywhere lightmap UVs) to `docs/decisions.md`, citing AD-004, AD-006, AD-009 and AD-013; verify no accepted ADR is altered or contradicted.
- [x] 10.5 Update `docs/wasm-improvements.md` with roadmap rows 10–13 (`add-showcase-site`, `add-hdri-environment-baking`, `promote-bake-harness`, `add-three-adapter`), their ADRs, dependencies and status, plus a short showcase subsection; verify the table matches `design.md` D11.
- [x] 10.6 Update `openspec/config.yaml` context and apply guidance to describe the showcase, the harness/display promotion path and the current separate-asset layout (the stale SINGLE_FILE-only guidance must be corrected); verify `npx @fission-ai/openspec@latest validate --all --strict` passes.

## 11. Integration verification

- [x] 11.1 Extend `scripts/verify-remote.sh` to install the site, run its typecheck/tests/harness/smoke and build with `SITE_BASE=/lightmapper-wasm/` after the root build; verify the script exits zero on the verification box.
- [x] 11.2 Run the root pipeline (`npm test`, `npm run test:bake`, `npm run test:dist`, `npm run test:loader`, `npm run test:consumer`, `npm run typecheck`) and the full site pipeline; verify all exit zero.
- [x] 11.3 Review the four thumbnails and the live preview routes at desktop and narrow widths; verify no layout overflow, no blank canvas and no console errors.
- [x] 11.4 Confirm the package tarball still excludes `site/` and the root package has no runtime dependencies; verify with `npm pack --dry-run` and `package.json` inspection.
- [x] 11.5 Run `npx @fission-ai/openspec@latest validate --all --strict`; verify the change and the existing specs pass.

## Workflow follow-up

- Commit the change to `Main` with a concise imperative subject after verification.
- Push to `Main` and confirm the Pages deployment succeeds.
- Archive the change after the review requirements are satisfied.
- Start `add-hdri-environment-baking` (change 2, AD-017) only after this change is archived.
