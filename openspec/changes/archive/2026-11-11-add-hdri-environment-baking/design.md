# Design

## Context

See `proposal.md` — Why. The showcase baseline is the archived
`add-showcase-site` change: a private Vite + TypeScript consumer under `site/`
with a site-local, package-shaped raw-WebGL bake harness, a three.js display
layer, four procedural scenarios and a shared xatlas atlas per scene (AD-015,
AD-016). The package, loader and C library are unchanged by this work.

`lightmapper.h` does not own a scene or a light list. For every hemisphere side
it calls `lmBegin`, returns a view and an asymmetric projection, and expects
the caller to draw the scene into the currently bound framebuffer. The
hemisphere color buffer starts at the `lmCreate` clear color, and the first
pass treats every drawn fragment with alpha 1 as a valid sample. That means an
environment map can be added entirely by the caller: draw a skybox before the
scene geometry for every side, and the lightmapper integrates it like any other
visible surface. No C-side change is required.

The display layer renders baked data with `MeshBasicMaterial`, not a physically
based material. The HDRI is therefore a background and a bake-time light
source, not an image-based lighting term on the display materials.

## Goals / Non-Goals

**Goals:**

- Bake a scene whose only light source is a linear equirectangular HDRI, with no
  analytic lights and no emissive meshes.
- Use the same source HDRI for the full-resolution three.js background and a
  prefiltered irradiance copy for the bake so the visible environment matches
  the baked lighting without softbox-grid aliasing.
- Keep the harness display-agnostic: raw typed arrays in, lightmap out, no
  three.js import.
- Keep the showcase self-contained and deterministic: checked-in asset, no
  runtime Poly Haven request, reproducible refresh script.
- Make the gallery attribute `lightmapper.h` and stop presenting one example
  scenario as a global product shortcut.
- Verify the new path on headless Chrome/ANGLE SwiftShader, without a physical
  GPU.

**Non-Goals:**

- Changing `lightmapper.h`, the Emscripten build, the wasm loader, the npm
  artifact layout or the public package API.
- Adding worker/off-screen baking, WebGL1, Node rendering, native GL or npm
  publishing mechanics.
- PMREM/IBL lighting of display materials, real-time environment updates,
  time-of-day controls, HDRI downsampling or in-browser HDR editing.
- Promoting the harness or display to package entries. AD-018/AD-019 remain
  follow-up changes, and AD-018 must preserve the environment input.

## Decisions

### D1 — Environment as a caller-drawn skybox (AD-017)

The harness will draw the environment itself in the lightmapper's draw loop.
`lmCreate` keeps its clear-color argument for scenes without an environment;
when an environment is present, the skybox covers every hemisphere pixel and
the clear color is no longer visible. This preserves AD-002 and AD-004 (the C
header and desktop path are untouched), AD-003 (WebGL2/GLES3 only) and AD-009
(the site still consumes the tested wasm artifact).

Alternatives considered:

- Add an environment sampler to `lightmapper.h`. Rejected: the C library is a
  caller-driven renderer by design and this would cross the repository
  ownership boundary (AD-004) for no API gain.
- Approximate the HDRI with the clear color. Rejected: it produces flat ambient
  lighting and does not demonstrate environment baking.
- Add a large emissive sky sphere to the scene object list. Rejected: it needs
  extra geometry, introduces depth/clipping edge cases and wastes triangles
  that the lightmapper would see in every hemisphere pass.

### D2 — Fullscreen triangle with per-side ray directions

The environment shader uses a three-vertex fullscreen triangle. Before each
skybox draw, the harness computes one world-space ray direction per NDC corner
from the view and projection matrices returned by `lmBegin`:

```text
xView = (ndc.x + proj[8]) / proj[0]
yView = (ndc.y + proj[9]) / proj[5]
zView = -1
dirWorld = normalize(side * xView + up * yView + dir * zView)
```

The view matrix stores `side`, `up` and `dir` as its rows, so no general matrix
inverse is needed. `dir` is the view's backward axis; with `zView = -1` the
center ray points along the hemisphere normal. The three directions are passed
as a `vec3[3]` uniform and selected with `gl_VertexID`; the fragment shader
interpolates and normalizes the ray, then samples the equirectangular map with:

```text
u = atan(dir.z, dir.x) / (2*pi) + 0.5
v = asin(clamp(dir.y, -1, 1)) / pi + 0.5
```

The skybox is drawn first with depth test and depth writes disabled and writes
alpha 1.0, then the scene objects are drawn with the existing bake program and
depth state restored. This matches the environment convention used by
three.js's `equirectUv`.

Alternatives considered:

- Invert the view-projection matrix in the fragment shader. Rejected: more
  uniforms and more per-fragment math for the same result.
- Draw a sky sphere around the sample point. Rejected: the lightmapper uses
  asymmetric side frusta and small `zFar` values; a fullscreen triangle is
  independent of scene scale and clipping.
- Pass CPU ray directions as vertex attributes. Rejected: three vertices are
  cheaper as uniforms and avoid a per-side buffer upload.

### D3 — Environment data contract and texture lifecycle

`BakeEnvironment` is:

```ts
interface BakeEnvironment {
  width: number;              // positive integer
  height: number;             // positive integer
  data: Float32Array;         // RGBA, width * height * 4, linear radiance
  intensity: number;          // finite, >= 0; default 1
}
```

The data is **bottom-up**: row 0 is the south pole (`v = 0`), row
`height - 1` is the north pole (`v = 1`). This is the orientation GL textures
use after upload and the orientation three.js's equirectangular background
expects with `flipY = false`.

Validation runs before any GPU resource is created: dimensions must be positive
integers, the data length must be exactly `width * height * 4`, every value
must be finite and non-negative, and intensity must be finite and non-negative.
Failures name the environment and the invalid value. The harness uploads one
`RGBA32F` texture with clamp-to-edge wrapping, uses linear filtering when
`OES_texture_float_linear` is available and nearest filtering otherwise, and
deletes the texture in the bake's `finally` path. A scene without an
environment does not allocate an environment texture.

The display layer uses the full-resolution decoded array to create a
`THREE.DataTexture` with `RGBAFormat`, `FloatType`, `flipY = false`,
`EquirectangularReflectionMapping`, `LinearSRGBColorSpace`, clamp-to-edge
wrapping, the supported filter and `scene.backgroundIntensity = intensity`.
The display texture is owned by the display and disposed with it. The bake
receives a separate 128 × 64 box-filtered and blurred irradiance copy; a raw
1k studio or outdoor HDRI contains high-frequency softbox, sun or cloud detail
that aliases badly when captured into a 32–128 px hemisphere.

Alternatives considered:

- Keep the `HDRLoader` texture with its default `flipY = true` and invert `v`
  in the bake shader. Rejected: two orientations in two shaders invite a
  mismatch; one row flip in the loader keeps the data contract simple.
- Upload `RGBA16F`. Rejected: the decoded data is float32 and the lightmapper
  already requires float render-target support; a 1k RGBA32F environment is
  about 8 MB, which is acceptable for a demo.
- Recreate the environment texture per hemisphere. Rejected: the texture is
  immutable during a bake; one upload per bake is enough.

### D4 — One decode, two consumers

The site loads the `.hdr` once through three.js `HDRLoader` (the r187 successor
to `RGBELoader`) with `setDataType(THREE.FloatType)`. `site/src/environment/hdr.ts`
then:

1. reads the loader's float image data;
2. flips the rows once into bottom-up order;
3. builds a full-resolution `THREE.DataTexture` for the display;
4. builds a 128 × 64 box-filtered and blurred `BakeEnvironment` irradiance
   copy for the bake;
5. disposes the loader's intermediate texture.

The loader is site-only. The bake harness receives only the raw typed array and
still imports nothing from three.js (the `bake-harness` import-boundary
requirement). The display layer receives the texture and never reads the HDR
file or bakes.

Alternatives considered:

- Write a custom RGBE decoder in the site. Rejected: duplicate a tested
  decoder and add maintenance surface; `HDRLoader` is already part of the
  three.js dependency.
- Keep the deprecated `RGBELoader`. Rejected: r187 warns that it is deprecated;
  `HDRLoader` is the current API.
- Store a raw float `.bin` instead of a `.hdr`. Rejected: loses the standard
  HDR format, provenance and common tooling.

### D5 — Two checked-in Poly Haven assets

The studio scenario uses Poly Haven's CC0 `studio_small_09` HDRI at 1k:
`https://polyhaven.com/a/studio_small_09`, author Sergej Majboroda. The 1k HDR
is 1,615,248 bytes with MD5 `d5d7eb9d26d341d6aa4d11c1a54fd97c` and is served by
the URL returned from `https://api.polyhaven.com/files/studio_small_09`
(`hdri["1k"].hdr.url`). It is a neutral studio with large softboxes, which
gives the scene directional soft light without an outdoor sun.

The outdoor scenario uses Poly Haven's CC0 `kloofendal_48d_partly_cloudy` 1k
HDRI: `https://polyhaven.com/a/kloofendal_48d_partly_cloudy`, author Greg Zaal.
The file is 1,637,206 bytes with MD5 `ee096fe9e26ce29d8f110b5ba0579011`. It is
a high-contrast midday sky with a sun, scattered cumulus clouds and grassy,
rocky hills.

Both assets are checked in under `site/src/assets/environments/`. A sibling
`README.md` records the Poly Haven asset pages, API endpoints, authors, CC0
licenses, byte sizes, MD5s and the bottom-up runtime convention.
`site/scripts/fetch-hdri.mjs` resolves each URL through the API, verifies the
size/MD5 and writes the files; it is a developer command, not a CI step. The
built site serves the assets from its own origin and never fetches Poly Haven.

Alternatives considered:

- Fetch the HDRI from Poly Haven at runtime. Rejected: external dependency,
  CORS/offline/CI failures and an unstable deployment input.
- Use a procedural environment. Rejected: the scenario is meant to demonstrate
  a real HDRI workflow.
- Use a 16K or EXR asset. Rejected: 1k is sufficient for a 64-hemisphere bake,
  and the repository asset should stay small.
- Downsample the checked-in asset. Rejected for this change: preserving the
  published 1k file keeps provenance simple; if repository size becomes a
  problem, a later change can add a deterministic downsampler with its own
  tests.

### D6 — `hdri-studio`, `hdri-outdoor` and the `environment` section

Add two catalog scenarios. `hdri-studio` uses a small studio set built from the
existing geometry helpers: floor, back wall, a pedestal, a sphere, a box and a
torus, all `kind: "lit"`, with no emissive meshes and a black ambient color.
`hdri-outdoor` uses a ground plane, a low stone wall, a plinth, a sphere, a
box, a torus, a post and a bench against the daytime sky. Both use a 512²
atlas, H32, two bounces, `zNear`/`zFar` 0.01/40 or 0.01/50, the usual dilation
and `environment.intensity` 1.0. The loader prefilters each HDR to a 128 × 64
irradiance copy for the bake. Both presets use `interpolationPasses: 1`,
`interpolationThreshold: 0.5` and `smoothPasses: 12`. Four coarse passes
(16-texel steps) produced large diamond artifacts on the walls and floor, and a
very low threshold made the bake impractically slow under SwiftShader; one fine
pass plus the prefiltered environment and twelve smoothing passes keeps the
preview bake in the smoke-test budget while removing the visible pattern and
most of the residual wall/ground mottling.

The scene metadata and bake preset gain an optional environment descriptor:

```ts
interface SceneEnvironment {
  url: string;        // Vite-resolved local .hdr URL
  intensity: number;  // linear multiplier
}
```

`build()` remains synchronous. The demo page loads the HDR before creating the
bake scene and display; `toBakeScene` receives the decoded environment and
passes it through. `SceneSection` gains `"environment"`, `SECTIONS` gains a
matching filter label/description, and `EXPECTED_SCENARIO_IDS` gains
`"hdri-studio"` and `"hdri-outdoor"`.

Alternatives considered:

- Add the HDRI to an existing scenario. Rejected: it would change that
  scenario's cached thumbnail and blur the technique each scene demonstrates.
- Use an emissive ceiling plus an environment. Rejected: the point is to prove
  the environment is the only light source.
- Import the HDR at module scope. Rejected: scene modules stay synchronous and
  testable in Node; only the browser page performs the async decode.

### D7 — Neutral featured links and explicit attribution

The global header currently has a `Cornell box` link and the hero has an
`Open the Cornell box` button. Those make one catalog example look like a
product page. Replace the nav item and hero CTA with a neutral
`Browse the gallery` action that scrolls to the catalog (`#gallery`); keep the
API guide and source buttons. The Cornell box card and route remain unchanged.

Add a visible gallery attribution in the hero: `Based on lightmapper.h by
Andreas Mantler`, with `lightmapper.h` linking to
`https://github.com/ands/lightmapper`. Change the footer's `Upstream
lightmapper` link text to `lightmapper.h` so the same name is used everywhere.
The attribution is content, not a new dependency; the site's licensing section
adds Poly Haven (CC0) and `lightmapper.h` (public domain) alongside three.js,
xatlas-wasm and highlight.js.

Alternatives considered:

- Keep the nav shortcut and only add the attribution. Rejected: it still
  over-features one example and the user explicitly asked to remove it.
- Link the fork (`mode777/lightmapper`) instead of upstream. Rejected: the
  header is the upstream single-header library by Andreas Mantler; the fork is
  an implementation detail already covered by the source link.
- Put the attribution only in the footer. Rejected: the hero is the product
  statement and the attribution should be visible there.

### D8 — Verification without a GPU

The environment path affects rendering, so verification uses headless Chrome
with ANGLE SwiftShader, matching the existing site suites. Node tests cover
asset metadata, catalog/scene structure and source coverage; browser tests
cover the real shader, texture upload and decode; the smoke test covers the
routed demo page and the failure state; the build check covers asset emission.

The key environment checks are:

- a constant non-black environment with black ambient and no emitters produces
  a finite, non-zero lightmap;
- a black environment with black ambient and no emitters stays black;
- a higher intensity produces higher radiance;
- an invalid environment is rejected with a message naming the environment;
- the per-side ray helper maps NDC top to world +Y for a known view, so an
  orientation regression fails independently of the bake;
- both HDRI pages complete a preview bake and request their HDRI from the site
  origin, not Poly Haven;
- the display background uses the same texture, mapping, color space and
  intensity, and disposes it.

## Risks / Trade-offs

- **The 1.6 MB HDRI grows the repository and the Pages artifact** → it is a
  single cached asset, served once per HDRI page; the provenance and refresh
  script make it replaceable. If size becomes a problem, a later change can add
  a deterministic downsampler.
- **Float texture filtering is not guaranteed on SwiftShader** → use
  `OES_texture_float_linear` when present and nearest filtering otherwise; the
  bake remains correct, only the background sampling gets blockier.
- **Orientation mismatch between the HDR file, the bake skybox and three.js** →
  one row flip in the loader, a documented bottom-up contract, a ray-direction
  test and a top/bottom environment bake.
- **The HDRI is too bright or too dark for the lightmap** → a scene-level
  intensity multiplier plus ACES tone mapping in the display; verify finite
  statistics and a useful thumbnail.
- **A raw studio or outdoor HDRI aliases its high-frequency lighting detail and
  exposes the lightmapper's coarse hierarchical interpolation grid** →
  prefilter the bake environment, use one fine interpolation pass and extra
  smoothing for both environment scenarios; the preview bake and stage capture
  are part of the smoke test so the pattern is visible in review.
- **HDR radiance makes a very low interpolation threshold impractically slow**
  → expose `interpolationPasses`/`interpolationThreshold`/`smoothPasses` on
  `BakeOptions`; both HDRI presets use a prefiltered environment, 1 pass, 0.5
  threshold and 12 smoothing passes, which keep the preview bakes within the
  smoke-test budget on the verification box.
- **Two WebGL2 contexts plus a 1k float texture per context increase memory
  use** → the display and harness contexts already exist; the environment adds
  roughly 16 MB for the HDRI scene and both textures are disposed with their
  owners.
- **`HDRLoader` API changes across three.js releases** → the site pins
  `three` 0.187.0; the loader module and the display test will fail loudly on an
  incompatible upgrade.
- **The environment changes are site-local and could be lost when the harness
  is promoted** → AD-018 must carry the environment input and its tests; this
  change records that dependency in the ADR consequences.
- **Existing solid/transparent previews could regress** → keep the current
  `setBackground` behavior for scenes without an environment and verify the
  existing thumbnails/smoke routes.

## Migration Plan

This is additive and site-only. No package entry, loader, wasm artifact, C
contract or release workflow changes. The checked-in HDRIs are emitted by the
existing site build and deployed with the existing Pages job. Rollback is
removing the `hdri-studio` and `hdri-outdoor` scenarios, the environment module
and the assets; the existing non-environment scenarios, the package and the C
library remain unchanged.

The prerequisite `add-showcase-site` change was archived before this proposal,
so the delta specs modify the established `bake-harness`, `showcase-site` and
`threejs-display` capabilities.

## ADR Impact

Add **AD-017 — HDRI environment baking in the showcase** to
`docs/decisions.md` (the apply tasks write it):

> **Context.** The showcase can bake constant ambient colors and emissive
> geometry but not the HDR environment maps used by most studio and product
> scenes. The C library already integrates whatever the caller draws during
> each hemisphere pass, so environment lighting does not require a C change.
>
> **Decision.** The site-local bake harness accepts an optional linear
> equirectangular HDR environment, draws it as a fullscreen skybox for every
> lightmapper hemisphere side before scene geometry, and uses the full decoded
> data as a linear equirectangular three.js background. The bake receives a
> prefiltered 128 × 64 irradiance copy of the same source. The environment
> assets are checked-in CC0 Poly Haven HDRIs with recorded provenance and a
> developer refresh script; the site does not fetch them at runtime. No C
> header, wasm build, loader or package API changes.
>
> **Consequences.** The showcase gains `hdri-studio` and `hdri-outdoor`
> scenarios and an `environment` section; the harness keeps its
> display-agnostic boundary; the display gains an equirectangular background
> path; and the assets are site-only and excluded from the npm tarball.
> Prefiltering the diffuse environment and using a fine interpolation pass plus
> extra smoothing avoids the softbox/sun-grid aliasing and coarse interpolation
> diamonds seen with raw 1k HDRIs.
> Environment orientation, intensity, validation and lifecycle are covered by
> headless WebGL2 tests. The future `lightmapper-wasm/bake` promotion (AD-018)
> must preserve the environment input.

This implements AD-015 (the showcase is a separate consumer), AD-016 (xatlas
UVs for every lit mesh), AD-009 (the tested `dist` artifact) and AD-006 (the
package stays dependency-free; three.js remains site-only), and respects
AD-013 (main-thread baking). It does not supersede an accepted ADR.

Update `docs/wasm-improvements.md`: row 11 (`add-hdri-environment-baking`)
moves from Planned to Implemented only after the acceptance checks pass, the
showcase subsection describes the environment path and the fifth scenario, and
section 3.1/7.10 no longer says the showcase has four scenarios. Update the
root `README.md` showcase section and `site/README.md` in the same task.

## Verification Strategy

- `npm run check --prefix site`
- `npm test --prefix site` (catalog, scenes, sources, environment asset,
  thumbnails)
- `CHROME_SHELL_PATH=… npm run test:harness --prefix site` (environment-only,
  black environment, intensity, invalid input, ray orientation, display
  background)
- `CHROME_SHELL_PATH=… npm run test:smoke --prefix site` (six scenarios,
  attribution/no featured link, both HDRI previews, HDRI failure route, no
  external Poly Haven request)
- `SITE_BASE=/lightmapper-wasm/ npm run build --prefix site`
- `SITE_BASE=/lightmapper-wasm/ npm run build:check --prefix site` (`.hdr`,
  `lightmapper.wasm`, `xatlas.wasm`)
- `npm run verify:remote` before pushing to `Main`; the root package and wasm
  suites must stay green.
- Recapture the fifth thumbnail with `npm run capture:thumbnails --prefix site`
  and commit the image and manifest. No `PREVIEW_VERSION` bump is expected
  because existing preview scenes and viewport CSS are unchanged; bump only if
  the display background change alters an existing preview.
