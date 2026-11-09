# lightmapper-wasm showcase

A private Vite + TypeScript gallery for the `lightmapper-wasm` package. The
site is a separate consumer: it links the repository root with
`lightmapper-wasm: file:..`, is **not** included in the npm tarball, and adds
no runtime dependency to the package.

Live site: <https://mode777.github.io/lightmapper-wasm/>

## Scenarios

| id | Technique | Bake |
|---|---|---|
| `ao-studio` | Ambient-only AO, contact shadows, no emitters | 512² atlas, H64, 1 bounce, white ambient |
| `cornell-box` | Multi-bounce GI, color bleeding, emissive ceiling | 1024² atlas, H64, 3 bounces, black ambient |
| `emissive-alcove` | Arbitrary emissive geometry and HDR neon bars | 512² atlas, H64, 2 bounces, black ambient |
| `tabletop-atlas` | Twelve lit meshes in one shared xatlas atlas | 1024² atlas, H64, 2 bounces, warm emitter |

Sections are technique filters: `ambient`, `gi`, `emissive` and
`multi-object`. “Shared atlas”, “xatlas” and “HDR” are feature labels because
every scenario uses the same UV pipeline.

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

The Node suite covers the catalog metadata, scene geometry, xatlas contracts,
raw source coverage and checked-in thumbnails. The browser suites run in
headless Chrome with ANGLE SwiftShader: `test:harness` bakes a lit quad under an
emissive ceiling and a two-object shared atlas, checks progress/cancellation
and exercises the display texture/mode/disposal paths. `test:smoke` drives the
gallery, the Cornell box and tabletop preview routes, the tab views and the
forced capability/asset failure routes.

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

## Harness and display boundaries

`src/bake/` is a display-agnostic raw-WebGL harness. It owns a hidden WebGL2
context (or accepts a caller-provided one), compiles the bake shader, uploads
per-object geometry, runs the shared-atlas bounce loop, draws the full scene
for every object, uploads the CPU atlas to the GPU once per bounce, and
returns a `Float32Array` lightmap plus statistics. It imports only
`lightmapper-wasm` and local bake modules; it never imports three.js or xatlas.

`src/display/` consumes a completed `BakeResult` and never bakes. It creates a
linear `THREE.DataTexture`, lit/emissive materials, lit/unlit/wireframe modes,
orbit controls, resizing and ACES tone mapping. Its import-boundary test rejects
any runtime import from `src/bake/` and any `lmCreate`/`lmBegin`/`lmEnd` call.

Both layers are package-shaped but site-local for now. `lightmapper-wasm/bake`
and `lightmapper-wasm/three` are follow-up changes (AD-018/AD-019).

## Views and capture mode

Each route (`#/p/<id>`) has three tabs:

- **3D** — the default; orbit/zoom the baked scene.
- **Atlas** — the baked lightmap with the chart-colored UV layout.
- **Code** — the exact scene module source with a copy action.

Switching tabs never re-bakes. `#/p/<id>?preview=1` hides the header, tabs,
aside, meta bar and footer, fixes the stage to 16:10 and bakes at draft quality
(draft hemisphere size, one bounce, atlas capped at 512²). The capture script
uses this mode.

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
preview route at 640×400 with DPR 2, waits for `data-bake-state="done"` and
writes the WebP files plus the manifest. Commit the images and manifest
together.

**Recapture rules**

- A scene module change (`src/demos/<id>.ts`, `geometry.ts`, `types.ts` or
  `sections.ts`) changes that source hash and requires recapturing the
  affected thumbnails. `npm test --prefix site` fails on stale hashes.
- A change to the viewport, lighting, materials or preview CSS can change the
  captured image without changing a scene source. Bump `PREVIEW_VERSION` in
  `src/demos/coverage.ts` and recapture all four thumbnails.
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
- `xatlas-wasm` (MIT).
- `three` (MIT).
- `highlight.js` (BSD-3-Clause).
- Vite, Vitest and Puppeteer (MIT / Apache-2.0) as build/test tooling.

The reference gallery structures were used as inspiration only; no MPL/MIT
source from the reference sites is copied into this directory.
