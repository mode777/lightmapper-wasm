# Tasks

## 1. Scaffold the private studio package

- [x] 1.1 Create `studio/package.json` as a private ESM package named `lightmap-studio` with `lightmapper-wasm: file:..`, `xatlas-wasm@0.2.0`, a `build` script and `dist` exports; verify `npm install --prefix studio` succeeds and `npm run build --prefix studio` emits `studio/dist/index.js` and `studio/dist/index.d.ts`
- [x] 1.2 Add `studio/tsconfig.json`, `.gitignore` entries for `studio/dist` and `studio/node_modules`, and the studio lockfile; verify a clean `npm ci --prefix studio` reproduces the install
- [x] 1.3 Add a root `build:studio` script that builds the root `dist` first, then the studio, and document it in `WASM_SETUP.md`; verify the command works from a clean checkout
- [x] 1.4 Add a studio import-boundary test that rejects imports from `site/`, `three` and demo modules; verify it fails on an intentional bad import and passes on the real source

## 2. Move the reusable pipeline into the studio

- [x] 2.1 Move `site/src/atlas/unwrap.ts`, `types.ts` and `stats.ts` into `studio/src/unwrap/` and preserve the `[0,1 - 1e-6]` clamp and `xref` pass-through; verify an unwrap test covers a multi-mesh atlas, edge clamping and a rejected invalid UV
- [x] 2.2 Move `site/src/bake/` into `studio/src/bake/` and keep it free of xatlas and three imports; verify the headless bake harness test still produces the same lightmap for the existing quadrature scene
- [x] 2.3 Move `site/src/environment/hdr.ts` into `studio/src/environment/` and keep the procedural sky in `site/`; verify decode, bottom-up row handling and the 128x64 prefilter with the existing environment test
- [x] 2.4 Remove the moved files from `site/`, update site imports to `lightmap-studio`, and keep the three display and demo code site-local; verify `npm run check --prefix site` and `npm test --prefix site` pass
- [x] 2.5 Add studio unit tests to CI and the remote verification script; verify both run the studio typecheck and tests in addition to the site suites

## 3. Implement the engine-agnostic API and lighting model

- [x] 3.1 Implement the public input/output types, `createStudio`, `unwrap` and `createEmissiveSphere`; verify type-level tests and an unwrap-only run in Node without WebGL
- [x] 3.2 Implement `bake` orchestration, result mapping and statistics; verify a headless bake returns one mesh per lit input, the expected RGBA dimensions and finite values
- [x] 3.3 Implement lighting normalization for environment, ambient, emitters and point lights, including the `power / (4 * pi^2 * radius^2)` proxy radiance and the default radius; verify the point-light falloff and returned-proxy tests
- [x] 3.4 Implement the `draft`, `preview` and `final` presets and explicit override precedence; verify each preset's atlas/hemisphere/bounce values and an override case
- [x] 3.5 Implement progress, `AbortSignal`, one-bake-at-a-time, idempotent `dispose` and the `StudioError` code mapping; verify abort, busy, dispose and cause-preservation tests
- [x] 3.6 Export `srand` from the wasm module, add `lmSeed(seed)` to the wrapper declarations and docs, and seed the lightmapper before each studio bake; verify `npm test`, `npm run typecheck` and the invalid-seed tests
- [x] 3.7 Add a deterministic asymmetric scene and a repeated-bake test; verify both runs have the same atlas metadata and identical lightmap values after the seed reset
- [x] 3.8 Add an engine-boundary test that consumes a result without three.js and confirms the package graph has no three dependency; verify it passes

## 4. Implement the studio loader

- [x] 4.1 Implement the `wasm.lightmapper` / `wasm.xatlas` option surface, `binary`/`url` handling and the `modules` injection point; verify unit tests for every precedence branch
- [x] 4.2 Implement lazy loading, delegated default resolution, preflight before the lightmapper fetch, and loader error messages; verify unwrap loads only xatlas, bake probes before fetching, and a missing asset names the file and dependency
- [x] 4.3 Verify injected modules are reused and survive studio disposal; verify repeated unwrap/bake does not refetch
- [x] 4.4 Add a Vite consumer test that builds a page importing the studio and confirm both `xatlas.wasm` and `lightmapper.wasm` are emitted; verify the built page loads both assets

## 5. Integrate the showcase as a studio consumer

- [x] 5.1 Update the three.js display to consume the studio result types and lightmap output; verify the `test:harness` suite still covers lit, unlit, wireframe, environment background and disposal
- [x] 5.2 Update the seven demo scenes to pass their existing bake values as explicit studio overrides and keep the procedural sky sample-local; verify every scene bakes and the checked-in thumbnails still match their source hashes
- [x] 5.3 Update the site import-boundary and catalog tests so the site contains no xatlas unwrap or lightmapper bake implementation; verify `npm run check --prefix site`, `npm test --prefix site`, `npm run test:harness --prefix site` and `npm run test:smoke --prefix site` pass
- [x] 5.4 Verify the production site build with `SITE_BASE=/lightmapper-wasm/ npm run build --prefix site` and `npm run build:check --prefix site`, including both hashed wasm assets

## 6. Update decisions, roadmap and context

- [x] 6.1 Add AD-021, AD-022 and AD-023 to `docs/decisions.md`, withdraw the AD-018/AD-019 reservation and remove the stale promotion references from AD-015/AD-016/AD-017/AD-020; verify no AD-018/AD-019 promotion text remains
- [x] 6.2 Replace roadmap rows 14-15 in `docs/wasm-improvements.md` with `isolate-lightmap-studio`, `bootstrap-lightmap-studio` and `consume-lightmap-studio`, and add the studio repository to the split table; verify the change sequence and status text match the implemented state
- [x] 6.3 Update `site/README.md` and the `openspec/config.yaml` context to describe the studio consumer boundary and the staged extraction; verify the project context no longer claims a `/bake` or `/three` promotion
- [x] 6.4 Add `studio/README.md` with the public API, lighting model, preset table, loader options and a three-free display recipe; verify every command and code sample in it matches the implemented surface

## 7. Integration and packaging checks

- [x] 7.1 Add a root package test asserting `npm pack` excludes `studio/`, its dependencies and its entries, and that the root exports and dependency graph are unchanged; verify `npm run test:dist` and the new pack test pass
- [x] 7.2 Add the studio to the repository CI and remote verification pipeline; verify the workflow definition and a local `npm run verify:remote` run are green
- [x] 7.3 Run the full suite (`npm test`, `npm run test:dist`, `npm run test:loader`, `npm run test:consumer`, `npm run typecheck`, studio checks, site checks and the headless bake); verify the golden lightmap and stats are unchanged or the delta is recorded in the change
- [x] 7.4 Confirm the root package remains dependency-free and the studio remains private; verify `package.json` audits and the root tarball before reporting implementation complete

## Workflow follow-up

- Run `npx @fission-ai/openspec@latest validate --all --strict` after implementation and before archiving.
- Archive the change only after the site consumes the private studio and the root tarball checks pass.
- Stage 2 (`bootstrap-lightmap-studio`) and stage 3 (`consume-lightmap-studio`) are separate changes and are not implemented here.
