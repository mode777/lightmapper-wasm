# Proposal

## Why

The reusable part of the showcase is trapped inside `site/`: the xatlas
unwrap pipeline, the display-agnostic bake harness, environment prefiltering
and the quality presets all live next to demo scenes, a gallery and a
three.js display layer. Consumers who want "unwrap my meshes and bake a
lightmap" must copy that code out of the showcase.

The previously reserved `lightmapper-wasm/bake` and `lightmapper-wasm/three`
promotions (AD-018/AD-019) are withdrawn. They would have split one workflow
across package entries, kept xatlas out of the result, and still required a
consumer to compose the pieces. The target is a standalone, engine-agnostic
`lightmap-studio` package that owns the whole mesh-to-lightmap path.

This change is stage 1 of three: isolate the studio code from the examples
inside this repository, without publishing it. Extracting the package to its
own repository and then removing the local copy are later changes.

## What Changes

- Add a private, package-shaped `studio/` directory at the repository root
  with its own `package.json`, source tree, TypeScript config, tests and
  lockfile. It is not published in this change.
- Move the reusable pipeline out of `site/src/` into `studio/`:
  - the xatlas unwrap glue and atlas metadata/statistics;
  - the raw-WebGL bake harness, shaders, GL helpers, environment prefilter
    and bake statistics;
  - the bake input/output types and quality presets.
- Add the public engine-agnostic API: `createStudio`, `unwrap`, `bake`,
  `createEmissiveSphere`, `StudioError` and the scene/result types. Inputs and
  outputs are typed arrays and plain objects; no three.js types cross the
  boundary.
- Add the lighting model: an optional equirectangular environment (HDRI) as
  the only sky source, an optional ambient term, emissive meshes as area
  lights, and point lights expanded into emissive sphere proxies. There is no
  directional-light input.
- Add an additive `lmSeed(seed)` wrapper method and export `srand` from the
  wasm module so the studio can reset the lightmapper's randomized hemisphere
  rotation jitter before each bake; this makes repeated bakes reproducible.
- Add the two-binary loader contract: lazy loading of `xatlas.wasm` on
  unwrap and `lightmapper.wasm` on bake, one normalized `wasm` options
  object, package-default asset resolution, preflight capability checks and
  typed `StudioError` failures.
- Switch `site/` to consume the private `lightmap-studio` package via
  `file:../studio`. The three.js display, demo scene builders, gallery,
  router, thumbnails and the procedural sky generator stay in `site/`.
- Update `docs/decisions.md` with AD-021 (separate engine-agnostic studio and
  withdrawal of the AD-018/AD-019 reservation), AD-022 (lighting input model)
  and AD-023 (studio loader and asset contract), and update
  `docs/wasm-improvements.md` with the staged `isolate` -> `bootstrap` ->
  `consume` sequence.
- Keep the root `lightmapper-wasm` package unchanged for consumers: no new
  runtime dependency, no new public entry and no studio files in the npm
  tarball.

## Capabilities

### New Capabilities

- `lightmap-studio`: the engine-agnostic mesh-to-lightmap API, including the
  scene input contract, unwrap and bake orchestration, the HDRI/emissive/point
  lighting model, quality presets, result shape, errors, cancellation and
  lifetime.
- `studio-loader`: lazy initialization and asset control for the two
  WebAssembly modules behind the studio (`xatlas-wasm` and
  `lightmapper-wasm`), including precedence, preflight and failure reporting.

### Modified Capabilities

- `bake-harness`: the harness moves from the showcase source tree into the
  studio package boundary; it must stay display-agnostic and keep xatlas and
  three.js out of its imports.
- `showcase-site`: the site no longer hosts the unwrap/bake pipeline; it
  consumes the private studio package and keeps only the display, demo and
  gallery concerns.
- `wasm-loader`: the low-level module gains an additive `lmSeed(seed)` method
  that resets the lightmapper rotation jitter without requiring a context.
- `npm-package`: the root package must continue to publish exactly its
  existing dist/docs files and exclude the private `studio/` package and its
  dependencies.

## Impact

- **Affected code:** new `studio/` package; `site/src/bake/`,
  `site/src/atlas/`, `site/src/environment/hdr.ts` move; `site/src/display/`,
  `site/src/demos/`, gallery/router/thumbnail code remains; site imports and
  tests update.
- **APIs:** new `lightmap-studio` API surface (private in this change). The
  root `lightmapper-wasm` API gains one additive `lmSeed(seed)` method; its
  entries and existing behavior are unchanged.
- **Dependencies:** `xatlas-wasm` is added to the private studio package and
  its dev/test toolchain. The root package keeps zero runtime dependencies.
  three.js remains a site-only dependency.
- **Build and CI:** add studio typecheck, unit and headless bake jobs, and a
  root-tarball exclusion check. The site job installs the linked studio.
- **Docs:** `docs/decisions.md`, `docs/wasm-improvements.md`, `site/README.md`
  and the OpenSpec project context lose the AD-018/AD-019 promotion plan.
- **No upstream C changes:** no `[lightmapper]` work and no submodule bump.

## Out of Scope

- Creating the standalone `lightmap-studio` repository, its publish workflow
  and its npm release (stage 2).
- Deleting the local `studio/` package or switching the site to a registry
  version (stage 3).
- Moving the showcase or its samples to the studio repository.
- Bundling three.js with the studio or adding a `/three` entry.
- Directional-light support, textured albedo input, material graphs or a
  second direct-light pass.
- Worker/`OffscreenCanvas` baking, Node rendering, native GL and any C-side
  rendering change.
- Changing the lightmapper sampling math, the `[0,1)` UV clamp or the
  existing bake defaults beyond the preset surface added by the studio. The
  existing hemisphere jitter is kept; it is only seeded.
