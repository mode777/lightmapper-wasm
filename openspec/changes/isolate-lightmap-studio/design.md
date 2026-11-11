# Design

## Context

The showcase already contains a reusable pipeline, but it is coupled to demo
code. See `proposal.md` for motivation. The relevant current state:

- `site/src/atlas/` turns xatlas output into normalized UVs, charts and
  atlas metadata, and copies positions/normals through `xref` (AD-016).
- `site/src/bake/harness.ts` owns a WebGL2 context, draws the scene for every
  hemicube pass, runs the bounce loop, applies dilation/smoothing and returns
  float lightmap data. It is already display-agnostic and imports only
  `lightmapper-wasm`.
- `site/src/environment/hdr.ts` decodes and prefilters linear equirectangular
  environments (AD-017/AD-020).
- `site/src/display/` is a three.js consumer that never bakes.
- `site/src/demos/` owns procedural scenes, presets, the procedural sky,
  thumbnails and gallery metadata.

The root package is ESM-only, browser-first and has no runtime dependencies
(AD-006). The low-level loader is separate and capability-checked (AD-009,
AD-010). The reserved AD-018/AD-019 promotions split the harness and display
into package entries; this design withdraws that reservation and replaces it
with a standalone studio package.

## Goals / Non-Goals

**Goals:**

- Define a package-shaped boundary for the reusable pipeline before moving it
  to another repository.
- Make the public API engine-agnostic and small enough to document on one
  page.
- Prove the boundary by making `site/` a consumer of the private studio
  package.
- Keep the root package and its tarball unchanged for existing consumers.

**Non-Goals:**

- Publishing the studio or creating its repository in this change (stage 2).
- Removing the local studio or switching the site to a registry version
  (stage 3).
- A three.js adapter, worker baking, textured materials or directional
  lighting.
- Changing lightmapper sampling, the `[0,1)` UV clamp or the C library.

## Decisions

### D1 - Stage the studio as a private package-shaped directory

Create `studio/` at the repository root with its own `package.json`,
`tsconfig.json`, `src/`, `test/` and lockfile. It builds to `studio/dist/` and
the site consumes the built package through `file:../studio`.

Alternatives considered:

- **Source directory inside `site/`**: less machinery, but it does not prove
  the future package boundary and would make the stage-2 move a rewrite.
- **Immediate extraction to a new repository**: rejected by the staged plan;
  it would combine the API design, the packaging work and the cross-repo CI
  setup in one step.
- **A new root package entry (`lightmapper-wasm/studio`)**: rejected because
  the root package must stay dependency-free (AD-006) and the studio is a
  separate product.

### D2 - Dependency direction

```
site/  --> lightmap-studio  --> lightmapper-wasm
   |              |----------> xatlas-wasm
   |--> three (display only)
```

The studio is the only place that imports both wasm packages. The site may
import `lightmap-studio` and three, but not xatlas. The root package keeps its
existing dependency-free graph and exports.

In this change the studio links the root package with `file:..` and takes
`xatlas-wasm@0.2.0` from the registry. Stage 2 will publish the studio with
both packages as direct dependencies; the `modules` injection point (D5) lets
advanced consumers reuse instances.

### D3 - Public API is one engine-agnostic surface

The package exports:

```ts
createStudio(options?) -> Promise<Studio>
studio.unwrap(meshes, options?) -> Promise<UnwrapResult>
studio.bake(scene, options?) -> Promise<BakeResult>
createEmissiveSphere(point) -> EmissiveMesh
StudioError
```

Inputs are typed arrays and plain values: positions, normals, indices,
albedo/emissive colors, environment data, point-light parameters. Outputs are
the same: one unwrapped mesh per lit input, the RGBA float lightmap, atlas
metadata, emitters, statistics and duration. No three.js object crosses the
boundary.

`bake()` unwraps raw meshes and bakes them in one call. `unwrap()` is the
same unwrap step without a WebGL context. A future change may accept
pre-unwrapped meshes; v1 does not.

### D4 - Lighting is environment plus geometry

```
environment (equirect, linear) --> internal prefilter --> hemisphere sky
ambient color                  --> constant term
emitter mesh + emissive color  --> area light (drawn during bake)
point light                    --> emissive sphere proxy (derived)
directional light              --> no input type
```

- The environment is the only sky source. It is premultiplied by an optional
  intensity and prefilted with the existing 128x64 irradiance pass by
  default. A caller can disable or resize the prefilter through an advanced
  option.
- A point light is `{ position, color, power, radius? }`. The proxy sphere
  uses uniform radiance `power / (4 * pi^2 * radius^2)`. `radius` defaults to
  `0.05` world units and is reported in the result. Proxy tessellation comes
  from the quality preset; the proxy is returned so a sample can render the
  same bulb.
- The procedural sky in `sun-sky-outdoor` stays sample-local. It generates
  equirect data and passes it as the environment; the studio never gains a
  sun/directional type.
- Emissive meshes are drawn in every bake pass and returned unchanged; they
  never occupy atlas space.

### D5 - One loader surface, lazy and delegated

The studio exposes one `wasm` option:

```ts
wasm: {
  lightmapper?: { binary?: ArrayBuffer | Uint8Array; url?: string | URL };
  xatlas?:      { binary?: ArrayBuffer | Uint8Array; url?: string | URL };
}
modules?: { lightmapper?: Module; xatlas?: Module };
```

Resolution order per module: injected module -> `binary` -> `url` -> the
dependency's own default `new URL(...)` resolution. The studio does not
duplicate asset path logic; that keeps the proven bundler behavior of both
packages (AD-009). Loading is lazy: `createStudio()` fetches nothing,
`unwrap()` loads xatlas, and `bake()` probes WebGL2/`EXT_color_buffer_float`
and then loads lightmapper (AD-010). Injected modules are caller-owned and are
not disposed by the studio.

A single `StudioError` code set replaces the different low-level error shapes:
`webgl2`, `float`, `assets`, `validation`, `atlas`, `aborted`, `disposed`,
`busy`, `bake`. Underlying errors stay on `cause`.

### D6 - Quality presets are defaults, not a second configuration system

| Preset | Atlas | Hemisphere | Bounces | Dilation | Smooth passes | Interpolation |
|---|---|---|---|---|---|---|
| `draft` | 512 | 32 | 1 | 4 | 1 | 1 |
| `preview` | 1024 | 64 | 2 | 8 | 1 | 2 |
| `final` | 1024 | 128 | 3 | 8 | 2 | 2 |

Any explicit field overrides the preset. The site keeps its scene-specific
values by passing overrides; the default presets are a starting point, not a
replacement for per-scene tuning. `hemisphereWeight` stays an explicit
advanced option defaulting to the library's `uniform`, so existing outdoor
scenes keep passing `cosine`.

### D7 - three.js stays out of the package

`site/src/display/` remains a site-local consumer of the studio result. There
is no `lightmap-studio/three` export and no three.js dependency in the studio
`package.json`. Samples may use three, and the display code continues to be
tested by the site harness suite. The result is a float RGBA array plus
metadata; turning it into a `DataTexture` is a documented recipe, not a
package export.

### D8 - ADR and roadmap updates

This change adds the following entries to `docs/decisions.md` and replaces the
AD-018/AD-019 reservation references:

- **AD-021 - Lightmap studio is a separate, engine-agnostic package.**
  Withdraws the AD-018/AD-019 promotion plan and records the staged
  isolate -> bootstrap -> consume sequence. three.js is sample-only.
- **AD-022 - Lighting input model.** Environment/HDRI plus emissive geometry
  and point-light sphere proxies; no directional-light API; point radiance is
  `power / (4 * pi^2 * radius^2)`.
- **AD-023 - Studio loader and asset contract.** Lazy two-binary loading, one
  `wasm` option surface, delegated default resolution, preflight, injected
  modules and the `StudioError` contract.
- **AD-024 - Deterministic rotation seed.** Export `srand`, add
  `lmSeed(seed)` to the low-level wrapper and call it before each studio bake.

`docs/wasm-improvements.md` replaces roadmap rows 14-15 with
`isolate-lightmap-studio`, `bootstrap-lightmap-studio` and
`consume-lightmap-studio`, and updates the repository split table.

### D9 - Deterministic rotation seed

The upstream lightmapper adds a small `0.1 rad` jitter to each hemisphere
sample, drawing from the C `rand()` sequence. That breaks up structured sampling
patterns but also makes repeated bakes in one module instance differ. The
studio's deterministic-output requirement therefore needs a seed reset.

Export `_srand` from the wasm module (a CMake export-list change, not a C
header change), add an additive `lmSeed(seed)` method to the wrapper and
declarations, and call `lmSeed(0)` before every studio bake. The method needs
no WebGL context. Re-instantiating the lightmapper module per bake was
rejected: it costs a new wasm instantiation and heap per bake and can leak
module instances, while seeding keeps one module and one context.

Consequences: the root package gains one additive method and a wasm rebuild;
the sampling math and the jitter amplitude are unchanged. Repeated bakes of
the same scene and options become reproducible, which the studio headless test
asserts. AD-024 records the decision.

### D10 - Verification without a physical GPU

- Studio unit tests: input validation, preset resolution, lighting
  normalization, point-proxy math, loader precedence and error mapping.
- Headless Chrome/ANGLE SwiftShader: unwrap + bake a deterministic asymmetric
  scene, golden lightmap hash, environment orientation, point-light falloff,
  abort/dispose, and repeated-bake determinism.
- Import-boundary tests: studio must not import `site/`, `three` or demo
  modules; `bake/` must not import xatlas.
- Site suites: `check`, unit, harness, smoke, production build/check with the
  linked studio.
- Packaging: root `npm pack` excludes `studio/`; studio `npm pack` (dry run)
  contains only its dist/types/docs.
- Remote pipeline: `npm run verify:remote` remains the final gate.

## Risks / Trade-offs

- **Nested package install and build complexity** -> build the studio to
  `dist/` before the site install, commit its lockfile, and add a single
  `build:studio` script used by CI and local development. Keep the source
  layout flat enough that stage 2 is a copy, not a rewrite.
- **Two wasm instances when an app also uses the low-level packages** ->
  document `modules` injection and keep direct dependencies in stage 2 so the
  default path works out of the box.
- **Point-light proxy appearance depends on scene scale** -> document the
  default radius, make it explicit in the result, and test the inverse-square
  relationship rather than a fixed pixel value.
- **Prefilter and preset defaults can change golden bakes** -> keep the
  existing 128x64 prefilter and per-scene overrides; recapture goldens only
  when a deliberate change alters the result and record the delta.
- **API churn before publication** -> the package is private in this change;
  the spec and tests are the contract. Stage 2 publishes only after the site
  has consumed it.
- **Root tarball leakage** -> the `files` whitelist already excludes
  `studio/`; add an explicit pack test to keep it that way.
- **Node unwrap vs browser bake confusion** -> `unwrap` is context-free;
  `bake` fails with the `webgl2` code when no context exists. Both are
  documented and tested.

## Migration Plan

1. Add the `studio/` package skeleton, build script and lockfile.
2. Move the unwrap, bake, environment and stats modules; update imports and
   remove the moved files from `site/`.
3. Add the public API, lighting normalization, point proxies, presets and
   loader.
4. Point the site at `file:../studio`, keep the display/demo/gallery code, and
   update site tests.
5. Update CI, `docs/decisions.md`, `docs/wasm-improvements.md`,
   `site/README.md` and the OpenSpec context.
6. Verify; roll back by reverting the change. There is no published artifact
   and no data migration.
7. Stage 2 copies `studio/` into the new repository; stage 3 deletes it here
   and switches the site to the published package.
