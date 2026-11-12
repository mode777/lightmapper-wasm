# Design

## Context

See `proposal.md` — Why. The current state that shapes the approach:

- `site/src/demos/` has seven scenes. `hdri-studio` and `hdri-outdoor` load a
  checked-in HDRI; `sun-sky-outdoor` is the only scene using the site-local
  procedural generator `site/src/environment/sky.ts` through the
  `{ kind: "sky" }` member of `SceneEnvironment`.
- `site/src/demo-page.ts` resolves the environment kind, applies the bake-only
  sun variant, caps the `sun-sky-outdoor` preview atlas at 256² and has a
  generator-specific error path.
- The checked-in outdoor asset is the non-pure-sky
  `kloofendal_48d_partly_cloudy_1k.hdr`, which contains baked grass, rock and
  hills below the horizon in addition to the sky.
- Environment scenes use a 1024² atlas, black ambient, a full-resolution
  display background and a prefiltered 128 × 64 diffuse bake copy (AD-017);
  the outdoor scenes add cosine weighting and a six-texel H64/H128 sampling
  budget (AD-020).
- `docs/decisions.md` ends at AD-027. `docs/wasm-improvements.md` has roadmap
  rows 1–16 and per-change sections up to 7.16, and its showcase subsection
  describes seven scenarios including the procedural one.

Observed asset data (Poly Haven API and the downloaded 1k files):

| Asset | Bytes | MD5 | Notes |
|---|---|---|---|
| `kloofendal_48d_partly_cloudy_puresky_1k.hdr` | 1,435,119 | `c69498687e876bf68d2a8b8a62234eb9` | Midday sun disk + cumulus sky; lower hemisphere is a dim sky fill, no terrain |
| `qwantani_dusk_2_puresky_1k.hdr` | 1,166,018 | `d400530e33f683654e70b4a087b6fe8d` | Blue-hour sky with a warm horizon glow; no visible sun disk, low contrast |

Both are CC0, 1024 × 512 equirectangular Radiance files, in the same
bottom-up-after-flip convention as the existing assets.

## Goals / Non-Goals

**Goals:**

- Make every environment scenario a checked-in Poly Haven HDRI while keeping
  seven catalog scenarios.
- Keep the existing bake pipeline, display layer, studio dependency and
  thumbnail contract unchanged.
- Remove the procedural-sky code path completely instead of leaving unused site
  code and specifications behind.

**Non-Goals:**

- Changing the studio package, its environment input or the bake harness
  contract.
- Adding analytic lights, shadow maps, a new display path or a worker.
- Rebalancing the non-outdoor scenes or the gallery chrome.

## Decisions

### D1 — Remove the procedural sky path end to end

Delete `site/src/demos/sun-sky-outdoor.ts`, `site/src/environment/sky.ts`,
`site/test/sky.test.ts`, the `{ kind: "sky" }` union member, the
`sun-sky-outdoor` preview cap and the generator error branch. `SceneEnvironment`
becomes the HDRI descriptor that `demo-page.ts` already passes to
`loadHdrEnvironment`.

Alternatives considered:

- **Keep the generator for a future scene.** Rejected: it retains untested-by-use
  code, specs and documentation for a route nobody can open, and the specs
  describe observable behavior that would no longer exist.
- **Keep the scene but hide it from the gallery.** Rejected: the route, preview
  and smoke coverage would still exist and the removal would be cosmetic.

The studio's `EnvironmentInput` contract is untouched: the site already
decodes HDRIs into that shape, so the studio needs no release.

### D2 — Use Poly Haven's Pure Sky variants, not the ground-bearing originals

Replace `kloofendal_48d_partly_cloudy_1k.hdr` with
`kloofendal_48d_partly_cloudy_puresky_1k.hdr` and add
`qwantani_dusk_2_puresky_1k.hdr`. Pure Sky assets remove the photographed
ground, so the scene's own ground plane is the only ground and the background
cannot show a second, conflicting horizon.

Alternatives considered:

- **Keep the ground-bearing Kloofendal.** Rejected: its baked hills duplicate
  the scene floor and break the "environment-only, no second horizon" story.
- **Use 2k/4k assets.** Rejected: 1k matches the existing studio asset, keeps
  the three files small enough to check in, and the bake already prefilters to
  128 × 64 while the display uses 1024 × 512.

The `qwantani_dusk_2` (non-pure-sky) variant is not used for the same reason.

### D3 — New `hdri-dusk` courtyard composition

Add `site/src/demos/hdri-dusk.ts` as an eight-mesh, emitter-free courtyard:

- ground plane, low back wall, low side wall, plinth + sphere, tilted box,
  horizontal torus, post and bench;
- warm-neutral albedos (sand/stone/ochre) so the blue fill and the warm horizon
  band both read;
- camera low and close to the objects so the horizon glow sits behind the
  silhouette and the ground plane covers the lower background.

Bake preset: 1024² atlas, H64 standard, two bounces, black ambient, cosine
weighting, `prefilterRadius: 3`, `zNear`/`zFar` 0.01/50, eight dilation
passes, one fine interpolation pass at `0.5`, twelve smoothing passes. Preview
uses the default 512² cap at draft H32.

Alternatives considered:

- **Reuse the `hdri-outdoor` geometry.** Rejected: two HDRI outdoor scenes with
  identical meshes add little to the gallery; a distinct composition shows the
  dusk fill on different occluders.
- **Add a warm emissive lamp.** Rejected: it leaves the environment-only,
  emitter-free pattern shared by the other HDRI scenes and conflates dusk fill
  with artificial light.
- **Fewer smoothing passes.** Rejected: the dusk horizon is a steep low-frequency
  gradient with cloud detail, which exposes the same line artifacts the HDRI
  outdoor scene suppresses with twelve passes.

The dusk asset has no visible sun disk, so no flux-preserving bake lobe is
needed. The six-texel budget is asserted against the prefiltered bright horizon
feature (`prefilterRadius: 3`, effective diameter 0.294 rad at H64), reusing
`assertSunSamplingBudget`.

### D4 — Keep harness environment-direction coverage with a test-local builder

The site harness checks that drove `generateProceduralSky` for sun direction,
intensity scaling, occlusion and H64/H128 consistency test the consumed studio
harness, not the removed site feature. Replace the import with a small
test-only `sunEnvironment({ direction, color, angularRadius, intensity })`
builder in `site/test/harness-page.ts` that writes bottom-up RGBA float data
directly. It never ships, and the harness keeps its directional-environment
coverage.

Alternatives considered:

- **Delete those checks.** Rejected: they are the in-repo gate for the studio's
  environment sampling behavior.
- **Keep importing the site generator.** Rejected: defeats the removal.

### D5 — Keep the preview-version at 1 and recapture all seven thumbnails

Viewport, preview lighting, materials and CSS are unchanged, so
`PREVIEW_VERSION` stays 1. Scene sources and the `hdri-outdoor` asset change,
so every thumbnail is recaptured in catalog order: `sun-sky-outdoor.webp` is
deleted, `hdri-dusk.webp` is added, and all manifest hashes are rewritten by the
capture script. The dusk scene has no special preview atlas cap.

### D6 — Record the policy as AD-028 and refresh the baseline docs

Add AD-028 to `docs/decisions.md`: showcase environment scenarios use checked-in
Poly Haven CC0 HDRIs only; the site-local procedural sky generator is removed;
outdoor HDRIs use Pure Sky variants; the dusk scene is environment-only fill.
AD-028 extends AD-017 and retires AD-020's procedural-scene smoothing clause
without superseding AD-020's hemicube-only, cosine and sampling decisions.

Update `docs/wasm-improvements.md` with roadmap row 17, the current-state
showcase prose and a 7.17 implementation section, and note in 7.12 that its
scene was later removed. Update the `openspec/config.yaml` context and both
READMEs.

## Risks / Trade-offs

- **Pure Sky assets have no photographed ground** → the lower hemisphere is a
  dim sky value, not terrain. Mitigation: keep the scene ground plane large
  enough to cover the lower background, and frame the camera so the horizon
  band sits above it.
- **The dusk sky has no visible sun** → no crisp directional shadow; the scene
  can read flat. Mitigation: albedo and silhouette separation, low camera, and
  documentation that dusk is fill-only rather than a defect.
- **Third HDRI grows the site build** → about 1.17 MB more, three checked-in
  files. Mitigation: 1k assets only; `check-build.mjs` asserts each exact size.
- **Removing a union member can leave stale references** → mitigated by
  `tsc --noEmit`, the catalog/source tests and a repository-wide search for
  `sky`/`sun-sky` before the push.
- **Thumbnail recapture is GPU/browser work** → run it on the verification box
  with `CHROME_SHELL_PATH`; the manifest tests fail on stale hashes or orphan
  images.
- **A removed route may still be linked** → the smoke suite checks the not-found
  page and the gallery tests assert exactly seven cards.

## Migration Plan

Single `Main` commit (the repository is main-only): delete the procedural files
and asset, add the two Pure Sky assets, add the dusk scene, update wiring,
tests, scripts, thumbnails, docs and ADR-028. Rollback is a revert of that
commit; no published package, wasm artifact or studio release is involved.

## Verification

Headless Chrome with ANGLE SwiftShader, no physical GPU required:

- `npm run check --prefix site`
- `npm test --prefix site` (catalog, scene geometry, source coverage,
  environment decode/validation, thumbnail hashes, provenance)
- `CHROME_SHELL_PATH=… npm run test:harness --prefix site` (environment
  direction/intensity/occlusion, cosine weighting, single soft shadow)
- `CHROME_SHELL_PATH=… npm run test:smoke --prefix site` (seven cards, HDRI
  filter, `hdri-outdoor` and `hdri-dusk` bakes, removed route, failure paths)
- `npm run fetch:hdri --prefix site -- --check`
- `SITE_BASE=/lightmapper-wasm/ npm run build --prefix site` and
  `npm run build:check --prefix site` (three hashed HDRI assets)
- `npx @fission-ai/openspec@latest validate --all --strict`
- `npm run verify:remote` for the full root, studio and site pipeline
