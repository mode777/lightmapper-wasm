# Proposal

## Why

The showcase's `sun-sky-outdoor` scene is the only consumer of the site-local
procedural sky generator. Its flat gradient and single sun disk read as
synthetic next to the photographed HDRIs, and they leave a second environment
implementation (generator, validation, tests, docs and requirements) to
maintain. Poly Haven also publishes "Pure Sky" variants of its outdoor HDRIs:
the photographed sky with the baked ground removed, which matches the scene's
own ground plane instead of introducing a second horizon. Replacing the
synthetic scene with a photographed dusk sky gives the `environment` section
three real HDRIs and covers a second lighting regime (midday sun versus
blue-hour fill) without new site code.

## What Changes

- Remove `sun-sky-outdoor` and the site procedural-sky implementation it alone
  uses: the scene module, `site/src/environment/sky.ts`, the `kind: "sky"`
  member of the scene environment union, the generator unit test and the
  generator-only harness checks, the `sun-sky-outdoor` preview-route budget,
  thumbnail and smoke/build assertions, and the procedural-sky requirements and
  documentation. The route `#/p/sun-sky-outdoor` is no longer served and falls
  through to the not-found page.
- Replace the `hdri-outdoor` environment with Poly Haven's
  `kloofendal_48d_partly_cloudy_puresky` 1k HDRI, the Pure Sky variant of the
  same sky. The eight-mesh set, camera, prefilter radius, smoothing and cosine
  weighting stay; only the asset, its provenance/build checks and the visible
  horizon change (the baked ground and hills are gone).
- Add an `hdri-dusk` scenario lit only by Poly Haven's
  `qwantani_dusk_2_puresky` 1k HDRI. It is a new courtyard composition tuned
  for the low-contrast, warm-horizon dusk sky: environment-only, black ambient,
  no emitters, cosine weighting, a prefiltered bake copy and a 1024² atlas.
- Check in both Pure Sky HDRIs and extend `fetch-hdri.mjs`,
  `check-build.mjs`, `source-hash.mjs` and the environment provenance note to
  cover three assets.
- Recapture all seven thumbnails and update the showcase catalogs and prose:
  `site/README.md`, the root `README.md`, `docs/wasm-improvements.md`
  (roadmap row and showcase subsection) and `openspec/config.yaml`. Add
  AD-028 to `docs/decisions.md`.

The gallery still contains seven scenarios: one synthetic scene is removed and
one photographed dusk scene is added.

Decision footprint: this implements AD-017's environment-only HDRI contract
and keeps AD-020's hemicube-only, cosine-weighted, well-sampled outdoor
sampling. It adds AD-028 for the HDRI-only showcase policy and retires
AD-020's procedural-scene smoothing clause without superseding AD-020's
sampling decisions. No accepted ADR is contradicted.

## Capabilities

### New Capabilities

None. The work changes the behavior of an existing capability.

### Modified Capabilities

- `showcase-site`: the scenario catalog (remove `sun-sky-outdoor`, add
  `hdri-dusk`), the HDRI-only environment contract, pure-sky asset provenance,
  the runtime dusk background, and the outdoor sampling/weighting/smoothing,
  smoke and production-build requirements that named the procedural scene.

## Impact

- `site/src/demos/` — delete `sun-sky-outdoor.ts`; add `hdri-dusk.ts`; update
  `hdri-outdoor.ts`, `index.ts`, `sources.ts`, `coverage.ts`, `sections.ts` and
  `types.ts`.
- `site/src/environment/` — delete `sky.ts`; `hdr.ts` is unchanged.
- `site/src/demo-page.ts` — drop the procedural environment branch, the
  generator error path and the `sun-sky-outdoor` preview atlas cap.
- `site/src/assets/environments/` — add `kloofendal_48d_partly_cloudy_puresky_1k.hdr`
  and `qwantani_dusk_2_puresky_1k.hdr`, remove the non-pure-sky Kloofendal
  asset, and update the provenance README.
- `site/src/assets/previews/` — replace `sun-sky-outdoor.webp` with
  `hdri-dusk.webp`, recapture `hdri-outdoor.webp` and refresh the manifest hashes.
- `site/scripts/` — `fetch-hdri.mjs`, `check-build.mjs`, `source-hash.mjs`,
  `bake-smoke.mjs`; `capture-thumbnails.mjs` follows the catalog.
- `site/test/` — delete `sky.test.ts`; update `scenes.test.ts`,
  `environment.test.ts`, `thumbnails.test.ts`, `catalog.test.ts`,
  `harness-page.ts` and any coverage assertion that names the removed scene.
- Documentation and planning: `site/README.md`, root `README.md`,
  `docs/wasm-improvements.md`, `docs/decisions.md` and `openspec/config.yaml`.
- Unchanged: `thirdparty/lightmapper`, the wasm build, the loader, the npm
  package, the studio package, the three.js display layer and the bake harness
  contract. No runtime dependency is added.

Out of scope: worker support, Node rendering, native GL, npm publishing
mechanics, C-side rendering behavior, changing the studio's environment input,
adding new analytic lights or shadow maps, and any new scene beyond `hdri-dusk`.
