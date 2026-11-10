# lightmapper-wasm showcase

A private Vite + TypeScript gallery for the `lightmapper-wasm` package. The
site is a separate consumer: it links the repository root with
`lightmapper-wasm: file:..`, is **not** included in the npm tarball, and adds
no runtime dependency to the package.

Live site: <https://mode777.github.io/lightmapper-wasm/>

The gallery credits the underlying single-header library as **Based on
[lightmapper.h](https://github.com/ands/lightmapper) by Andreas Mantler**.
Global navigation links only to the gallery, repository and package; the
Cornell box is one catalog example, not a featured shortcut.

## Scenarios

| id | Technique | Bake |
|---|---|---|
| `ao-studio` | Ambient-only AO, contact shadows, no emitters | 512² atlas, H64, 1 bounce, white ambient |
| `cornell-box` | Multi-bounce GI, color bleeding, emissive ceiling | 1024² atlas, H64, 3 bounces, black ambient |
| `emissive-alcove` | Arbitrary emissive geometry and HDR neon bars | 512² atlas, H64, 2 bounces, black ambient |
| `tabletop-atlas` | Twelve lit meshes in one shared xatlas atlas | 1024² atlas, H64, 2 bounces, warm emitter |
| `hdri-studio` | Environment-only studio lighting from a checked-in 1k HDRI | 1024² atlas, H32, 2 bounces, black ambient + HDRI |
| `hdri-outdoor` | Environment-only midday outdoor lighting from a checked-in 1k sky HDRI | 1024² atlas, H32 preset, 2 bounces, cosine, 7-tap prefilter, 12 smoothing passes |
| `sun-sky-outdoor` | Non-HDRI outdoor lighting from a generated procedural sky and directional sun | 1024² atlas, H64, 2 bounces, cosine, 0.22 rad bake sun |

Sections are technique filters: `ambient`, `environment`, `gi`, `emissive` and
`multi-object`. The `environment` section covers both checked-in HDRI and
procedural-sky scenes. “Shared atlas”, “xatlas” and “HDR” are feature labels
because every scenario uses the same UV pipeline.

## Local development

```sh
npm ci --prefix site
npm run dev --prefix site          # http://127.0.0.1:5173/
```

The root package must have an assembled `dist/` (`npm run build:dist` at the
repository root), because the site imports the same entry the package ships.

Production build and preview:

```sh
SITE_BASE=/lightmapper-wasm/ npm run build --prefix site
SITE_BASE=/lightmapper-wasm/ npm run preview --prefix site
```

`SITE_BASE` is read by `vite.config.ts`; leave it unset for a root-hosted
build. `npm run build:check --prefix site` verifies `dist/index.html`, the base
path and the hashed `lightmapper.wasm` / `xatlas.wasm` assets.

## Tests

```sh
npm run check --prefix site        # tsc --noEmit
npm test --prefix site             # catalog, scenes, atlas, sources, thumbnails
CHROME_SHELL_PATH=… npm run test:harness --prefix site   # bake harness + display
CHROME_SHELL_PATH=… npm run test:smoke --prefix site     # gallery, previews, failures
```

The Node suite covers catalog metadata, scene geometry, xatlas contracts, raw
source coverage, HDRI provenance, procedural-sky generation/validation and
checked-in thumbnails. The browser suites run in headless Chrome with ANGLE
SwiftShader: `test:harness` bakes a lit quad under an emissive ceiling, a
two-object shared atlas and environment-only scenes, checks the procedural
sun's direction/intensity/occlusion behavior, checks progress/cancellation and
exercises the display texture/mode/background/disposal paths. `test:smoke`
drives the gallery, the Cornell box, tabletop, HDRI studio, HDRI outdoor and
sun-and-sky outdoor preview routes, the tab views and the forced
capability/asset failure routes.

## Scene contract

Each scenario is a `SceneDefinition` in `src/demos/<id>.ts`:

```ts
interface SceneDefinition {
  meta: {
    id: string;
    title: string;
    description: string;
    features: string[];
    sections: SceneSection[];
    background?: [number, number, number]; // linear
    camera?: { position: [number, number, number]; target: [number, number, number]; fov?: number };
  };
  bake: {
    atlasSize: number;
    hemisphereSize: number; // power of two
    bounces: number;
    ambient: [number, number, number]; // linear
    environment?: SceneEnvironment; // HDRI or procedural sky
    hemisphereWeight?: "uniform" | "cosine"; // default uniform
    environmentBake?: {
      sun?: { angularRadius: number; softness?: number }; // procedural bake lobe
      prefilterRadius?: number; // HDRI bake blur radius in target texels
    };
    zNear?: number;
    zFar?: number;
    dilationPasses?: number;
    smooth?: boolean;
  };
  build(): SceneMesh[];
}
```

`build()` returns world-space meshes with positions, indices and normals.
`kind: "lit"` meshes also carry a linear albedo; `kind: "emissive"` meshes
carry a linear HDR emissive color. The shared helpers in `src/demos/geometry.ts`
emit split faces for hard edges (boxes, cylinder caps) and shared vertices for
smooth surfaces (spheres, torus, cylinder sides). `src/demos/geometry.ts` and
`src/demos/types.ts` are the only scene shared modules; keep them small because
their source hashes invalidate every thumbnail.

`src/demos/index.ts` is the catalog. `src/demos/sources.ts` imports each scene
module with Vite's `?raw` query so the Code view shows the exact source that
produced the bake.

## xatlas pipeline and the `[0,1)` clamp

`src/atlas/unwrap.ts` adds every lit mesh to one `xatlas-wasm` atlas. For each
output vertex it copies positions and normals through `xref`, stores the chart
index and normalizes the texel-space UV:

```text
u = clamp(texel_u / atlasWidth,  0, 1 - 1e-6)
v = clamp(texel_v / atlasHeight, 0, 1 - 1e-6)
```

The clamp is a hard invariant. The lightmapper samples with positive-mod
semantics, so an exactly normalized `1.0` wraps to `0.0`. A texel exactly on
the atlas edge is clamped; a coordinate outside the atlas or a non-finite value
is rejected. Emissive-only meshes are drawn during the bake but never added to
the atlas. The tests assert `[0,1)` bounds, finite values and non-degenerate UV
triangles for every scenario.

## HDRI environments

The showcase has two HDRI environment-only scenarios, each using a checked-in
1k CC0 HDR from Poly Haven. A third environment-only scenario,
`sun-sky-outdoor`, uses a generated procedural sky instead of a file; see the
next subsection.

| Scenario | Asset | Author | Local file |
|---|---|---|---|
| `hdri-studio` | `studio_small_09` | Sergej Majboroda | `src/assets/environments/studio_small_09_1k.hdr` |
| `hdri-outdoor` | `kloofendal_48d_partly_cloudy` | Greg Zaal | `src/assets/environments/kloofendal_48d_partly_cloudy_1k.hdr` |

Provenance, sizes, MD5s and the Poly Haven API endpoints are recorded in
`src/assets/environments/README.md`. Both assets are CC0 1.0.

Refresh and verify the assets:

```sh
npm run fetch:hdri --prefix site -- --check   # offline size/MD5 check for both
npm run fetch:hdri --prefix site -- --force   # resolve via the Poly Haven API and replace both
npm run fetch:hdri --prefix site -- --check --asset=kloofendal_48d_partly_cloudy
```

The script resolves each download URL through the Poly Haven API. The site
never fetches an HDRI from Poly Haven at runtime and CI never needs the network
for them.

Each Radiance file is decoded once with three.js `HDRLoader` and flipped into
the bottom-up convention: row 0 is the south pole (`v = 0`) and the last row
is the north pole (`v = 1`). The display background uses the full 1,024 × 512
linear RGBA float data. The bake uses a 128 × 64 box-filtered and Gaussian
**blurred radiance copy** of the same source. A raw studio HDRI contains a
high-frequency softbox diffusion grid, and an outdoor sun/cloud sky has strong
high-frequency detail too; both alias badly when captured into a 32–128 px
hemisphere, so prefiltering is the standard diffuse-lighting setup. The
scene's intensity multiplier is applied separately by both paths.

`hdri-studio` keeps the five-tap prefilter and twelve smoothing passes.
`hdri-outdoor` uses a wider seven-tap prefilter (`prefilterRadius: 3`), twelve
smoothing passes and cosine hemisphere weighting. The outdoor lightmap is
1024²; a 1024² lightmap with only four passes exposed fine line artifacts, so
the HDRI scene keeps the original twelve-pass smoothing. The lightmapper's coarse
hierarchical interpolation (four passes / 16-texel steps) produced large
diamond artifacts on the walls and floor, so both presets use one fine
interpolation pass. The outdoor scene is intentionally a partly cloudy
multi-source environment: the direct sun is dominant, but the clouds remain
soft area-light fill.

### Procedural sun-and-sky environment

`sun-sky-outdoor` does not load a file. Its scene environment is a
`SceneEnvironment` with `kind: "sky"` and these fields:

```ts
interface ProceduralSky {
  zenith: [number, number, number];  // linear
  horizon: [number, number, number]; // linear
  ground: [number, number, number];  // linear
  intensity?: number;                // default 1
  width?: number;                    // default 512
  height?: number;                   // default 256
  sun: {
    direction: [number, number, number]; // world-space, surface -> sun; normalized
    color: [number, number, number];     // linear radiance in the disk
    angularRadius: number;               // radians, (0, PI / 2)
    intensity?: number;                  // default 1
  };
}
```

`src/environment/sky.ts` generates bottom-up linear RGBA float data from the
gradient and the sun disk. Row 0 is the south pole (`v = 0`) and the last row is
the north pole (`v = 1`), matching the HDRI contract. The sun is a soft-edged
disk at `sun.direction`; because the lightmapper integrates the caller-drawn
environment, it acts as the scene's directional light and is occluded by scene
geometry. The generator validates its descriptor and reuses
`validateBakeEnvironment`; it never fetches an asset.

The display keeps the `0.06` rad visible disk. The bake uses a much larger,
softer lobe (`0.22` rad with a `0.08` rad soft edge and a flux-preserving
intensity scale) so the H64 hemicube sees about eighteen texels. That is
deliberately an area light: the shadow is soft, not a crisp parallel sun. The
preset uses a 1024 × 512 environment, black ambient, cosine hemisphere
weighting and four smoothing passes; standard quality is H64, high is H128 and
preview uses draft H32. There is no separate shadow-map or direct-light pass;
the environment remains the only lighting input.

The site scene test enforces the sampling budget as
`sunAngularDiameter / (90 / hemisphereSize) >= 6` at H64 and H128. The H32
preview is a draft capture and is exempt.

## Hemisphere weighting

The lightmapper default weights every hemisphere direction equally. For a
diffuse surface the incoming radiance should be cosine-weighted; the package
now exposes `lmSetCosineWeights(ctx)`, a built-in shim over
`lmSetHemisphereWeights`. The harness option is:

```ts
interface BakeOptions {
  hemisphereWeight?: "uniform" | "cosine"; // default uniform
}
```

The non-outdoor scenes keep `uniform` to preserve their tuned look. The two
outdoor scenes use `cosine` and recalibrate their sun/sky intensity. The
wrapper method is additive and requires a bound WebGL2 context; the wasm shim
uses a static C cosine function, so no JS callback or function-pointer lifetime
is involved.

## Harness and display boundaries

`src/bake/` is a display-agnostic raw-WebGL harness. It owns a hidden WebGL2
context (or accepts a caller-provided one), compiles the bake shader, uploads
per-object geometry, runs the shared-atlas bounce loop, draws the full scene
for every object, uploads the CPU atlas to the GPU once per bounce, and
returns a `Float32Array` lightmap plus statistics. It imports only
`lightmapper-wasm` and local bake modules; it never imports three.js or xatlas.

A scene may also carry an optional `environment`:

```ts
interface BakeEnvironment {
  width: number;
  height: number;
  data: Float32Array; // linear RGBA, bottom-up, width * height * 4
  intensity?: number; // default 1
}
```

The harness validates the dimensions, data length, finite non-negative
radiance and intensity before creating GPU resources. When an environment is
present it uploads one `RGBA32F` texture per bake, draws a fullscreen
equirectangular skybox with alpha 1.0 before the scene for every lightmapper
hemisphere side, disables depth test and depth writes for that draw, then
restores the depth state and deletes the texture in `finally`. Row 0 is the
south pole (`v = 0`); the last row is the north pole. A scene without an
environment keeps the existing ambient/emissive behavior and the `lmCreate`
clear color.

`BakeOptions` also exposes `interpolationPasses`, `interpolationThreshold` and
`smoothPasses` for difficult HDR content. Keep the coarse interpolation grid in
mind when tuning: the default 2 passes use 4-texel steps, while 4 passes start
at 16-texel steps and can leave visible diamonds on large diffuse charts.

`src/display/` consumes a completed `BakeResult` and never bakes. It creates a
linear `THREE.DataTexture`, lit/emissive materials, lit/unlit/wireframe modes,
orbit controls, resizing and ACES tone mapping. It also accepts an optional
equirectangular HDRI background texture, applies its intensity and disposes it
with the display. Its import-boundary test rejects any runtime import from
`src/bake/` and any `lmCreate`/`lmBegin`/`lmEnd` call.

Both layers are package-shaped but site-local for now. `lightmapper-wasm/bake`
and `lightmapper-wasm/three` are follow-up changes (AD-018/AD-019).

## Views and capture mode

Each route (`#/p/<id>`) has three tabs:

- **3D** — the default; orbit/zoom the baked scene.
- **Atlas** — the baked lightmap with the chart-colored UV layout.
- **Code** — the exact scene module source with a copy action.

Switching tabs never re-bakes. `#/p/<id>?preview=1` hides the header, tabs,
aside, meta bar and footer, fixes the stage to 16:10 and bakes at draft quality
(draft hemisphere size, one bounce, atlas capped at 512²; the heavier
`sun-sky-outdoor` preview caps its atlas at 256²). The capture script uses this
mode.

## Thumbnails

Checked-in thumbnails live in `src/assets/previews/*.webp` with
`manifest.json`. Each entry records the 640×400 CSS size, DPR 2 (1280×800
pixels), the WebP quality, the scene source hash and the preview version.

Recapture:

```sh
CHROME_SHELL_PATH=/path/to/chrome-headless-shell \
  npm run capture:thumbnails --prefix site
```

The script builds the site, starts `vite preview` on a free port, opens every
preview route at 640×400 with DPR 2 in a fresh browser, waits for
`data-bake-state="done"` and writes the WebP files plus the manifest. Commit
the images and manifest together.

For the heavier scenes, capture one scenario per process and reuse an existing
build:

```sh
npm run build --prefix site
npm run capture:thumbnails --prefix site -- --only=hdri-studio --no-build
```

`--only=<id>` merges the entry into the existing manifest while preserving the
catalog order; `--no-build` skips the Vite build when `site/dist` is current.

**Recapture rules**

- A scene module change (`src/demos/<id>.ts`, `geometry.ts`, `types.ts` or
  `sections.ts`) changes that source hash and requires recapturing the
  affected thumbnails. `npm test --prefix site` fails on stale hashes.
- The `sun-sky-outdoor` hash also includes `src/environment/sky.ts` and
  `src/environment/hdr.ts`; changing the procedural generator or the shared
  environment texture helper requires recapturing that thumbnail.
- Both HDRI hashes include `src/environment/hdr.ts`, so changing the prefilter
  requires recapturing the studio and outdoor HDRI thumbnails.
- A change to the viewport, lighting, materials or preview CSS can change the
  captured image without changing a scene source. Bump `PREVIEW_VERSION` in
  `src/demos/coverage.ts` and recapture all seven thumbnails.
- Do not hand-edit the manifest or re-encode images outside the capture script.

The gallery renders a CSS fallback (`src/styles.css`, `.card-fallback`) when an
image is missing or fails to load, so a broken asset never leaves a blank card.

## Deployment

The build workflow (`/.github/workflows/publish.yml`) uploads the tested
`dist` artifact, the `site` job downloads it and runs the typecheck, unit
tests, harness test, smoke bake, `SITE_BASE=/lightmapper-wasm/` build and
`build:check`, and the `deploy` job publishes `site/dist` to Pages only for
`Main` pushes or manual dispatch. Pull requests and failed builds do not
deploy, and wasm is never rebuilt in the site job.

Set the repository's **Settings → Pages → Source** to **GitHub Actions**. The
deployed URL is <https://mode777.github.io/lightmapper-wasm/>.

## Licensing

The site code in this repository is original and covered by the repository's
[Unlicense](../LICENSE). It consumes:

- `lightmapper-wasm` (Unlicense) from this checkout.
- [`lightmapper.h`](https://github.com/ands/lightmapper) by Andreas Mantler
  (public domain), compiled to WebAssembly by the package.
- `studio_small_09` HDRI by Sergej Majboroda / Poly Haven (CC0 1.0).
- `xatlas-wasm` (MIT).
- `three` (MIT).
- `highlight.js` (BSD-3-Clause).
- Vite, Vitest and Puppeteer (MIT / Apache-2.0) as build/test tooling.

The reference gallery structures were used as inspiration only; no MPL/MIT
source from the reference sites is copied into this directory.
