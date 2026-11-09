# Design

## Context

See `proposal.md` — Why. The showcase baseline is the implemented
`add-hdri-environment-baking` change: the site-local bake harness accepts an
optional linear equirectangular `BakeEnvironment` and draws it as a fullscreen
skybox for every lightmapper hemisphere side (AD-017), and the three.js display
accepts the same data as an equirectangular background. The harness and display
are site-local and package-shaped (AD-015; future promotion AD-018/AD-019).

`lightmapper.h` has no analytic light list. It renders a hemisphere for each
lightmap texel and integrates the radiance the caller draws. A small, bright
sun disk at a fixed world direction is therefore a directional light: every
texel sees the same sun direction, and scene geometry drawn over the skybox
occludes it. This is the same caller-driven contract that already supplies the
environment; no C change is required.

Two baseline details shape the implementation:

- `site/src/demos/types.ts` currently types `SceneEnvironment` as a URL plus
  intensity, and `site/src/demo-page.ts` always calls `loadHdrEnvironment`.
  Generating a sky requires generalizing that descriptor and the demo-page
  resolution step.
- `types.ts` and `sections.ts` are shared thumbnail source files. Changing them
  invalidates every checked-in thumbnail, so the change must recapture the
  whole set rather than only the new scene.

The prerequisite `add-hdri-environment-baking` change is implemented and
complete but not archived. The six-scenario code and the environment path
already exist; only the main spec is still at the pre-HDRI state. Archive the
HDRI change before archiving this change so its six-scenario delta does not
overwrite this change's seven-scenario requirement.

## Goals / Non-Goals

**Goals:**

- Add a seventh showcase scene whose only light is a generated linear
  equirectangular environment: a procedural sky gradient plus a sun disk that
  provides the directional direct light and shadows.
- Generalize the scene environment descriptor without changing the bake
  harness, display layer or package API.
- Keep the environment deterministic and self-contained: no HDR file, no
  runtime network request, no new dependency.
- Make the procedural generator unit-testable, and verify the sun direction,
  intensity and occlusion behavior in headless WebGL2.
- Preserve the existing HDRI scenes and their visible behavior.

**Non-Goals:**

- No analytic directional/point light API, shadow map, or new bake shader pass.
- No real-time display lighting; the display remains albedo × baked lightmap.
- No atmospheric scattering, clouds, weather, time-of-day controls or live sky
  editing.
- No changes to `thirdparty/lightmapper`, the wasm build, the loader, the npm
  artifact, the package entry, the C ABI or the release workflow.
- No promotion of the harness or display to package entries (AD-018/AD-019
  remain follow-up changes).

## Decisions

### D1 — The directional light is a sun disk in the generated environment

The sun is a small, high-radiance disk written into the procedural
equirectangular environment. The environment remains the only scene lighting
input: the gradient supplies sky fill and the disk supplies directional direct
light. The disk is visible in the same background the display shows, so the
visible sun and the baked shadows agree.

This implements AD-017's environment contract with generated data rather than a
new light type. It keeps AD-004 intact (no C change), AD-006 intact (no
dependency), and AD-009 intact (the site still consumes the tested artifact).

Alternatives considered:

- **Analytic sun pass in the bake harness.** Add a `BakeDirectionalLight` input
  and an additive fullscreen sun lobe. Rejected for this change: it introduces
  a second lighting path, more shader/uniform/validation surface and a new
  architectural decision, while the generated environment already covers the
  same observable result. It would also require either no visible sun in the
  display background or a duplicate display-only sun disk.
- **Distant emissive quad in the scene.** Rejected: it adds geometry to the
  bake, needs a display-only visibility flag or shows a bright card while
  orbiting, and samples noisily at the preview hemisphere size.
- **Constant ambient sky plus an emissive sun.** Rejected: it does not
  demonstrate a sky environment and gives a flat background rather than a
  generated gradient.
- **A full atmospheric sky shader.** Rejected: out of scope and not required to
  demonstrate a non-HDRI directional-sun scene.

### D2 — Scene environment descriptor is a discriminated union

`site/src/demos/types.ts` gains a generated-sky variant while keeping the
existing file-based variant:

```ts
export interface HdrSceneEnvironment {
  kind: "hdr";
  url: string;
  intensity: number;
}

export type SceneEnvironment =
  | HdrSceneEnvironment
  | ({ kind: "sky" } & ProceduralSky);
```

`ProceduralSky`, owned by the new `site/src/environment/sky.ts`, is:

```ts
interface ProceduralSun {
  direction: Vec3;       // world-space, surface -> sun; normalized by the generator
  color: Vec3;           // linear radiance inside the disk
  angularRadius: number; // radians, > 0 and < PI / 2
  intensity?: number;    // default 1
}

interface ProceduralSky {
  zenith: Vec3;
  horizon: Vec3;
  ground: Vec3;
  intensity?: number;    // default 1
  sun: ProceduralSun;
  width?: number;        // default 512
  height?: number;       // default 256
}
```

The new scene uses `{ kind: "sky", ... }`; `hdri-studio` and `hdri-outdoor`
gain `kind: "hdr"` mechanically. The `kind` discriminator is explicit rather
than an optional URL so a malformed descriptor fails at the type and validation
boundary instead of silently falling back to a file path.

Alternatives considered:

- **Optional `url?` plus optional `procedural?`.** Rejected: it permits
  ambiguous or empty descriptors and is harder to validate.
- **A generic `source: string | ProceduralSky`.** Rejected: less readable and
  still needs a discriminator at runtime.

### D3 — Procedural sky data contract, orientation and generation

The generator produces bottom-up linear RGBA float data exactly like the HDRI
loader: row 0 is the south pole (`v = 0`), the last row is the north pole
(`v = 1`). The equirectangular mapping matches the bake skybox shader:

```text
u = atan2(dir.z, dir.x) / (2*PI) + 0.5
v = asin(clamp(dir.y, -1, 1)) / PI + 0.5
```

For each texel, the generator reconstructs the direction from `u` and `v` and
writes:

- a smooth vertical gradient from `horizon` toward `zenith` above the horizon
  and from `horizon` toward `ground` below it;
- a soft-edged sun disk whose center is at `sun.direction` and whose angular
  radius is `sun.angularRadius`, additive on top of the gradient;
- alpha 1 in every texel.

The output is validated with the existing `validateBakeEnvironment`
(positive integer dimensions, exact `width * height * 4` length, finite
non-negative values, finite non-negative intensity). The descriptor itself is
validated before generation: finite non-negative colors and intensity, a finite
non-zero direction, and an angular radius in `(0, PI / 2)`.

The same data feeds the bake environment and the display `DataTexture`, so the
visible sky and the baked sky are identical. Unlike the HDRI path, no
prefiltered copy is needed: the gradient has no high-frequency softbox/cloud
detail, and the sun disk is intentionally resolved. The display applies the
environment intensity through its existing `backgroundIntensity` path.

Alternatives considered:

- **Prefilter or blur the procedural sky.** Rejected: it would soften the sun
  and reduce the directional shadow definition for no aliasing benefit.
- **Generate a smaller bake-only copy.** Rejected: the generator is cheap and a
  1024 × 512 RGBA32F image is about 8 MB; one copy keeps the display and bake
  identical.
- **Write a custom sky shader in the harness.** Rejected: duplicates the
  environment path and moves content into the harness.

### D4 — Sun parameters and scene preset

The initial scene values are:

- sky resolution `1024 × 512`; linear gradient with a cool zenith, pale horizon
  and dark ground. The initial 512 × 256 test image made the visible sun disk
  blocky under the display's nearest-filter fallback, so the scene raises the
  resolution while keeping the same bottom-up data contract;
- sun direction low and off to one side, warm linear color, angular radius
  about `0.06` rad (about 3.4°) and intensity 1;
- bake preset `512²` atlas, `H64`, two bounces, black ambient, `zNear 0.01`,
  `zFar 50`, dilation 8, one fine interpolation pass, `0.5` threshold and
  four smoothing passes so the sun shadow survives.

The standard `H64` hemisphere resolves the sun disk to several texels; the
draft `H32` preview still resolves it to roughly two texels. If the preview
thumbnail shows a blocky or missing sun, increase the angular radius or the
sun color rather than adding a new sampling path. The exact colors, radius and
smoothing count are tuned during apply against the headless preview and the
thumbnail; the acceptance criterion is a visibly directional scene with
finite, non-zero statistics, not a specific numeric hash.

### D5 — Demo-page resolution and display parity

`site/src/demo-page.ts` resolves the descriptor once:

- `kind: "hdr"` → existing `loadHdrEnvironment(url, { intensity })`;
- `kind: "sky"` → new `createProceduralSkyEnvironment(descriptor)`.

Both return the existing `LoadedEnvironment` shape (`environment` for the bake,
`texture` for the display). The display options continue to receive
`environment: texture` and `environmentIntensity`; `toBakeScene` continues to
receive only the `BakeEnvironment`. The procedural path is synchronous, so it
does not add a new loading state or async failure route to the page. A
generator validation error is caught and shown as an environment error rather
than an HDRI error.

The `bake-harness` and `threejs-display` modules are untouched. The harness
already validates and uploads arbitrary `BakeEnvironment` data, and the display
already accepts an equirectangular `DataTexture`. This keeps the change
site-scoped and avoids a second skybox implementation.

### D6 — `environment` section and catalog registration

Keep the existing `environment` section id and filter button, but rename its
label from `HDRI environment` to `Environment` and broaden its description to
cover checked-in HDRIs and procedural skies. Keeping the id avoids a
`SceneSection` union change and keeps the existing HDRI filtering behavior.

Register `sun-sky-outdoor` in `demos/index.ts`, `demos/sources.ts`,
`coverage.ts` (`EXPECTED_SCENARIO_IDS`) and the gallery copy. The scene declares
only `sections: ["environment"]`; it has no emissive meshes and black ambient,
so the only light is the generated environment. Its features call out
"Procedural sky", "Directional sun", "No HDRI" and "Outdoor".

### D7 — Thumbnails and source hashes

The new scene's source hash must include both its scene module and the
procedural generator. `site/scripts/source-hash.mjs` gets an extra-file entry:

```js
"sun-sky-outdoor": ["src/environment/sky.ts"]
```

`site/test/thumbnails.test.ts` asserts that entry and that the new scene does
not include either checked-in HDRI. Because `types.ts` and `sections.ts` are
shared source files, changing them invalidates every thumbnail, so the apply
step recaptures all seven. `PREVIEW_VERSION` stays at 1: the preview viewport,
lighting, materials and CSS are unchanged; only scene sources and hashes
change. The new thumbnail is inspected to confirm the sun direction and
directional shadows are visible.

### D8 — Verification without a physical GPU

All rendering verification runs in headless Chrome with ANGLE SwiftShader,
matching the existing site suites. Node tests cover the generator and catalog
contracts; the browser harness covers the real WebGL2 texture upload and
hemisphere integration; the smoke test covers the routed page and the absence
of an HDR request; the build check covers the production layout. No root golden
bake, wasm rebuild or physical GPU is involved.

## Risks / Trade-offs

- **A small sun disk can alias at the draft `H32` preview** → use a
  `1024 × 512` environment, a radius of roughly `0.06` rad and the standard
  `H64` preset; verify the preview thumbnail and increase the radius or sun
  radiance if the disk is blocky or missing.
- **A sun disk in the environment is not an analytic light** → its shadows have
  a finite penumbra and its strength depends on the disk's solid angle. This is
  physically expected; the scene is a showcase of environment lighting, not a
  claim of an analytic-light API. The design records the analytic alternative
  for a future change.
- **The `0.5` interpolation threshold and smoothing can soften shadow edges** →
  use fewer smoothing passes than the noisy HDRI scenes and verify the shadow
  direction and contrast in the preview and thumbnail; tune the threshold and
  passes during apply.
- **The procedural sky is a clear-sky approximation** → document it as a
  gradient-plus-disk demo, not an atmospheric model. Clouds and time-of-day are
  out of scope.
- **Changing `types.ts` and `sections.ts` invalidates all thumbnails** → plan a
  full seven-scene recapture and keep the manifest in catalog order; the
  existing `PREVIEW_VERSION` remains valid.
- **A generator change could leave the new thumbnail stale** → add
  `src/environment/sky.ts` to the new scene's source hash and test it. Do not
  silently widen the shared hash list for the existing HDRI scenes; the
  pre-existing `hdr.ts` coverage gap is outside this change.
- **Environment filter copy now covers two mechanisms** → update the section
  label, description, README and smoke-test expectations together so the
  gallery does not call a procedural sky an HDRI.
- **The prerequisite HDRI change is not archived** → archive it before this
  change so the six-scenario catalog requirement is in the main spec and the
  archive order cannot drop the seventh scenario.

## Migration Plan

This is an additive site-only change. No package entry, loader, wasm artifact,
C contract or release workflow changes. The existing HDRI scenes keep their
behavior and assets; the new scene is generated at runtime from a descriptor.
Rollback is removing the new scene, generator and descriptor union, restoring
the URL-only environment type and deleting the new thumbnail entry; the six
existing scenarios remain unchanged.

Archive order: archive `add-hdri-environment-baking` first, then sync/archive
this change. The implementation can proceed against the current code, which
already has the six-scenario state and the environment path.

## ADR Impact

No new ADR. This implements the environment contract in AD-017 with generated
linear equirectangular data; the directional sun is a sun disk in that
environment, not a new analytic-light or harness feature. It implements AD-016
(xatlas-everywhere UVs) and AD-015 (separate showcase consumer) and respects
AD-006 (no runtime dependency), AD-009 (the site consumes the tested artifact)
and AD-013 (main-thread baking). Do not rewrite the accepted AD-017 entry.

The reserved follow-up IDs AD-018/AD-019 (harness and display promotion) stay
reserved. When those changes land they must preserve the environment contract
and the generated-sky input.

Update `docs/wasm-improvements.md` with a new roadmap row for
`add-sun-sky-outdoor-lighting` and update the showcase subsection from six to
seven scenarios, describing the procedural sky and directional sun. Update the
stale six-scenario wording in the root `README.md`, `site/README.md` and the
showcase sentence in `openspec/config.yaml`. No decision-log entry is added or
changed.

## Verification Strategy

- `npm run check --prefix site` — TypeScript, including the new union, scene and
  generator.
- `npm test --prefix site` — generator data/orientation/sun/validation, catalog
  order and sections, scene geometry, raw source coverage and thumbnail hashes.
- `CHROME_SHELL_PATH=… npm run test:harness --prefix site` — a generated sun-up
  sky lights an up-facing surface; a sun-down or sunless sky leaves only sky
  fill; increasing the sun intensity increases radiance; a wall occludes the
  sun; the existing environment, cancellation and display checks stay green.
- `CHROME_SHELL_PATH=… npm run test:smoke --prefix site` — seven gallery cards,
  the environment filter includes both HDRI scenes and the new scene, the new
  preview bake reaches `done` with finite non-zero stats, the page requests no
  `.hdr` file, and the existing preview and failure routes stay green.
- `SITE_BASE=/lightmapper-wasm/ npm run build --prefix site` and
  `SITE_BASE=/lightmapper-wasm/ npm run build:check --prefix site` — the
  production layout still emits and references the hashed `lightmapper.wasm`,
  `xatlas.wasm` and both HDRIs; the procedural scene adds no file asset.
- `npm run capture:thumbnails --prefix site` — recapture all seven thumbnails;
  inspect the new image for a visible sun and directional shadows.
- `npm run verify:remote` — the full root and site pipeline before pushing to
  `Main`. No root golden bake changes because the package, wasm artifact and
  test scenes are untouched.
- `npx @fission-ai/openspec@latest validate --all --strict` before reporting
  the planning change complete.
