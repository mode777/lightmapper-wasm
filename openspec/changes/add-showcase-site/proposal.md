# Proposal

## Why

`lightmapper-wasm` has a working raw-WebGL gazebo demo but no public gallery and
no reusable bake path. Every new scene currently repeats the same GL setup,
lightmap allocation, bounce loop and readback plumbing. The reference projects
(`libfive-wasm`, `xatlas-wasm`) show that a separate `site/` consumer is the
right product surface, and the lightmapper's own multi-object shared-atlas
recipe in `LIGHTMAPPER.md` has never had a real consumer.

This change establishes the public showcase and the two package-shaped layers
behind it: a display-agnostic raw-WebGL bake harness and a three.js display
layer. Both stay site-local for now; the design records how they are promoted
to the package in follow-up changes.

## What Changes

- Add `site/`, a private Vite + TypeScript showcase that is not part of the npm
  tarball and links the local package with `lightmapper-wasm: file:..`.
- Add a gallery and routed demo pages with 3D, Atlas and Code views, bake
  controls, statistics, a lightmap PNG download and a `?preview=1` capture
  mode.
- Add four procedural scenarios:
  - `ao-studio` — ambient-only bake, no emitters.
  - `cornell-box` — multi-bounce GI, color bleeding, emissive area light.
  - `emissive-alcove` — arbitrary emissive geometry and HDR emitters.
  - `tabletop-atlas` — multiple lit objects packed into one shared atlas.
- Add a shared xatlas-everywhere UV pipeline. Every lit mesh is added to one
  atlas; positions and normals are copied through `xref`; normalized UVs are
  clamped below `1.0` because the lightmapper's positive-mod maps `1.0` to
  `0.0`.
- Add a raw-WebGL bake harness under `site/src/bake/`. It owns its own hidden
  WebGL2 context, compiles the bake shader, uploads per-object geometry, runs
  the multi-object shared-atlas bounce loop, reports progress, supports
  cancellation, post-processes and returns a `Float32Array` lightmap plus
  statistics. It has no three.js or xatlas imports.
- Add a three.js display layer under `site/src/display/`. It consumes the
  harness result as a `THREE.DataTexture`, creates lit and emissive materials,
  supports lit/unlit and wireframe modes, orbit controls, resizing and tone
  mapping. It never bakes.
- Add checked-in WebP thumbnails with a manifest and a headless capture script.
- Add site tests for catalog metadata, scene validity, atlas/UV validity,
  source coverage and thumbnail coverage; add a headless harness bake test and
  a showcase smoke bake for the Cornell box and tabletop scenes.
- Add a `site` CI job that builds and tests the showcase from the tested `dist`
  artifact, and a Pages deploy job that runs only on `Main`.
- Record the four-change roadmap in `design.md` and add the corresponding
  update task to `tasks.md`:
  1. `add-showcase-site` (this change, AD-015/AD-016)
  2. `add-hdri-environment-baking` (AD-017)
  3. `promote-bake-harness` (AD-018)
  4. `add-three-adapter` (AD-019)
- Update `docs/decisions.md` with AD-015 and AD-016, and update
  `docs/wasm-improvements.md` with the new roadmap rows and status.

## Capabilities

### New Capabilities

- `showcase-site`: the public, non-published gallery, scenario catalog,
  xatlas-everywhere UV pipeline, demo-page views, thumbnails, validation and
  Pages deployment.
- `bake-harness`: the display-agnostic raw-WebGL bake harness, including its
  own context, shader, multi-object shared-atlas loop, bounces, emitters,
  progress, cancellation, post-processing, statistics and readback.
- `threejs-display`: the three.js consumption layer, including the lightmap
  texture, lit and emissive materials, lit/unlit and wireframe modes, tone
  mapping and orbit viewport.

### Modified Capabilities

None. The npm package, loader, build pipeline and upstream C contract are
unchanged by this change; the site is a separate consumer and adds no runtime
dependency to the package.

## Impact

- **New code:** `site/` (Vite configuration, TypeScript app, gallery, demo
  pages, scene modules, xatlas unwrap, bake harness, three.js display,
  thumbnails, tests, scripts).
- **Dependencies:** site-only `xatlas-wasm`, `three`, `highlight.js`, Vite and
  Vitest. The root package keeps no runtime dependencies.
- **CI:** the existing build workflow uploads the tested `dist` artifact, adds
  a `site` job and a `Main`-only Pages deploy job.
- **Docs:** new `site/README.md`; root `README.md`, `AGENTS.md` and
  `docs/wasm-improvements.md` updates; ADR log entries AD-015 and AD-016.
- **Out of scope:** the HDRI scenario (change 2), the
  `lightmapper-wasm/bake` entry (change 3), the `lightmapper-wasm/three` entry
  (change 4), worker/off-main-thread baking, dynamic scenes, WebGL1, Node
  rendering, native GL, C-side rendering changes, submodule bumps and npm
  publishing mechanics.
- **ADR impact:** introduces AD-015 (the showcase is a separate consumer
  deployed from the tested wasm artifact) and AD-016 (showcase lightmap UVs are
  generated with `xatlas-wasm` for every scenario). It implements AD-004,
  AD-006 and AD-009 and respects AD-013's main-thread limitation. It does not
  alter or supersede any accepted ADR.
