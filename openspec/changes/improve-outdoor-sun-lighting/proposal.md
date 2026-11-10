# Proposal

## Why

The outdoor showcase scenes read as if lit by two or three discrete sources
even though each environment contains one sun. The bake asks lightmapper's
low-resolution hemicube to resolve the sun: at H64 a `0.06 rad` sun disk is only
about five texels across, and the deterministic 3×3 hemicube rotation plus the
lightmap smoothing produce ragged, doubled and mottled shadow edges. The
`hdri-outdoor` scene compounds this with 12 smoothing passes over a partly
cloudy prefiltered HDRI whose clouds are real secondary area lights.

The goal is a clean single soft shadow per occluder, not a crisp parallel sun.
A separate shadow-map pass would fix the symptom by bypassing lightmapper and
creating a second lighting model. This change instead improves what the
hemicube is asked to integrate: a well-sampled bake sun, cosine-weighted
hemisphere integration and less smoothing.

## What Changes

- `[lightmapper-wasm]` Add a built-in cosine hemisphere weight to the wasm
  shim and JS wrapper using lightmapper's existing `lmSetHemisphereWeights`
  API. The default remains uniform; the site harness gains an opt-in
  `hemisphereWeight` scene/option setting.
- Make the procedural bake sun a well-sampled area light: keep the current
  `0.06 rad` display disk, but use a larger and softer bake-only sun lobe so it
  covers at least six hemicube texels. No sun is removed from the environment
  and no direct-light path is added.
- Reduce the outdoor smoothing: `sun-sky-outdoor` to 1–2 passes and
  `hdri-outdoor` to 2–4, replacing the current 4 and 12. Widen the HDRI bake
  prefilter if needed; the display keeps the full-resolution HDRI.
- Add a scene-test sampling-budget check from the sun angular diameter and the
  selected hemisphere size. The standard preset stays H64; high remains H128.
- Recalibrate the outdoor sun/sky exposure for cosine weighting, recapture the
  affected thumbnails, and update the ADR log, roadmap, README and project
  context.
- No `thirdparty/lightmapper` or `lightmapper.h` change, no submodule bump, no
  loader, npm entry or package layout change. The wasm shim gains one export
  and the package gains one wrapper method; the site remains a consumer of the
  tested `dist` artifact. The display remains bake-free.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `c-library-port`: add a wrapper-accessible built-in cosine hemisphere weight
  that consumes the upstream `lmSetHemisphereWeights` API without changing the
  upstream header.
- `bake-harness`: add an optional `hemisphereWeight` setting that applies the
  cosine weight to the lightmapper context before the hemisphere passes.
- `showcase-site`: use a well-sampled bake sun, cosine weighting, reduced
  smoothing and a sampling-budget check in the outdoor scenes while preserving
  the display backgrounds and the other scenarios.

## Impact

- Site-local code: `site/src/bake/types.ts`, `harness.ts`, `site/src/demos/`
  scene presets, `site/src/environment/hdr.ts`, `sky.ts`,
  `site/src/demo-page.ts`, and the scene/harness/smoke tests and thumbnails.
- Package surface: `wasm/lightmapper_wasm.c`, `wasm/CMakeLists.txt`,
  `src/index.js`, `types/index.d.ts`, and the root smoke/loader/consumer
  checks. The public `createLightmapperModule` entry stays unchanged; a method
  is added to the module surface.
- Documentation: `docs/decisions.md` gains AD-020 (well-sampled area sun and
  cosine weighting; no direct shadow path). It extends AD-017 and does not
  supersede it. It does not change the `add-sun-sky-outdoor-lighting` D1
  decision that the sun is part of the environment; it changes how that
  environment is sampled and weighted. AD-018/AD-019 remain reserved.
- `docs/wasm-improvements.md` gains a roadmap row and the showcase status is
  updated; `site/README.md`, `README.md`, `LIGHTMAPPER.md` and
  `openspec/config.yaml` are refreshed as needed.
- Out of scope: crisp/delta sun shadows, a direct-light or shadow-map pass,
  analytic point/directional lights, new HDRI assets, Node rendering, native
  GL, npm publishing mechanics, worker support and C-side rendering changes.
  The HDRI scene remains partly cloudy; its cloud fill is intentionally
  multi-source.
