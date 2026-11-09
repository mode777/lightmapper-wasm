# Design

## Context

See `proposal.md` — Why. The repository currently has a raw-WebGL gazebo demo
under `examples/browser/`, a low-level `createLightmapperModule` API, and the
shared-atlas multi-object recipe documented in `LIGHTMAPPER.md`. It has no
public gallery, no reusable bake layer and no display-layer boundary.

The reference implementations are `libfive-wasm/site/` (gallery, routed demo
pages, thumbnails, Pages deployment) and `xatlas-wasm/site/` (multi-mesh
unwrapping and 3D/UV/Atlas/Code views). The site mirrors their structure but is
written as original code for this repository.

This design implements AD-004 (repository ownership), AD-006 (browser-first,
no runtime dependencies), AD-009 (separate wasm asset) and AD-013
(main-thread-only baking). It introduces AD-015 and AD-016. It does not alter
or supersede an accepted ADR.

## Goals / Non-Goals

**Goals:**

- A public showcase that proves the lightmapper on four distinct techniques.
- One reusable, display-agnostic bake harness shared by every scenario.
- One reusable three.js consumption layer that never bakes.
- A UV pipeline that uses xatlas for every lit mesh and is safe for the
  lightmapper's `[0,1)` UV semantics.
- A deployment that ships the exact wasm artifact the `Main` build tested.
- A plan that survives later sessions: the follow-up sequence, ADR IDs and
  verification gates are recorded here and in `tasks.md`.

**Non-Goals:**

- HDRI baking and the HDRI scene (change 2, AD-017).
- The `lightmapper-wasm/bake` package entry (change 3, AD-018).
- The `lightmapper-wasm/three` package entry (change 4, AD-019).
- Worker or off-main-thread baking; AD-013 remains proposed.
- Dynamic scenes, real-time lightmap updates, WebGL1, Node rendering, native
  GL, C-side rendering changes and npm publishing mechanics.

## Decisions

### D1 — Separate `site/` consumer (AD-015)

Build a private Vite + TypeScript package under `site/` that links
`lightmapper-wasm` with `file:..`. It is not part of the npm tarball and does
not add a runtime dependency to the root package. This follows AD-004 and
AD-006 and mirrors the reference projects.

Alternatives considered:

- Expand `examples/browser/` into the gallery. Rejected: it is the minimal
  raw-WebGL reference and should stay dependency-free and build-free.
- Put the site in a separate repository. Rejected: the showcase must deploy
  from this repository's tested artifact and change with the API.

### D2 — xatlas everywhere (AD-016)

Every lit mesh is added to one `xatlas-wasm` atlas per scenario. The unwrap
helper copies positions and normals from the input vertex through each output
vertex's `xref`, then normalizes UVs. Emissive-only meshes are drawn during the
bake but are not added to the atlas.

Alternatives considered:

- xatlas only for the multi-object scene, hand-authored UVs elsewhere.
  Rejected: two UV paths, two sets of tests, and the Atlas tab would only be
  meaningful on one page.
- Hand-authored UVs for boxes and planes. Rejected: the showcase should
  demonstrate the recommended lightmap UV workflow.

### D3 — The `[0,1)` UV clamp is a hard invariant

The lightmapper's `lm_pmod2(uv, 1.0f)` maps exactly `1.0` to `0.0`. xatlas UVs
are in texel space and can sit exactly on the atlas edge. The shared unwrap
helper MUST normalize with a clamp or half-texel inset:

```text
u = clamp(texel / atlasWidth,  0, 1 - 1e-6)
v = clamp(texel / atlasHeight, 0, 1 - 1e-6)
```

The scene tests assert every normalized UV is in `[0,1)` and that no triangle
collapses. This is a showcase-side fix; no C change is required.

### D4 — Raw WebGL bake harness with its own context

The harness owns a hidden WebGL2 context (or accepts a caller-provided one)
and uses raw GL for the bake. It does not share a context with three.js. The
boundary is CPU data: the harness returns a `Float32Array` lightmap plus
metadata; the display layer uploads it.

Alternatives considered:

- Share the three.js context and call `renderer.resetState()` after each bake.
  Rejected: it couples the harness to three.js, risks state-cache corruption,
  and makes the harness harder to promote.
- Use three.js for baking. Rejected: the harness must stay display-agnostic
  and the bake shader is deliberately minimal.

### D5 — Package-shaped harness, promoted later

The harness lives under `site/src/bake/` for this change. It imports only
`lightmapper-wasm` and standard browser APIs. It has no xatlas or three.js
imports, accepts typed arrays, supports a caller-provided canvas/context, a
configurable `yieldToMain`, progress and `AbortSignal`. A follow-up change
moves it to `src/bake/` and exports `lightmapper-wasm/bake` (AD-018).

### D6 — Three.js display layer, promoted later

The display layer lives under `site/src/display/`. It consumes a `BakeResult`
and never calls the lightmapper. It creates a linear `THREE.DataTexture`, lit
and emissive materials, supports lit/unlit/wireframe, orbit controls, resize
and ACES tone mapping. A follow-up change promotes the thin helpers to
`lightmapper-wasm/three` with `three` as an optional peer dependency (AD-019).
The core package stays dependency-free.

### D7 — Four core scenarios; HDRI in change 2

| Scenario | Proves | Bake preset | Visual |
|---|---|---|---|
| `ao-studio` | Ambient-only AO; no emitters | 512-ish atlas, H32–64, 1 bounce, white ambient | White objects on a plane with contact shadows |
| `cornell-box` | Multi-bounce GI, color bleeding, emissive area light | 512–1024 atlas, H64, 3 bounces, black ambient | Red/green walls, ceiling light, two boxes, open front |
| `emissive-alcove` | Arbitrary emissive geometry, HDR emitters | 512 atlas, H64, 2 bounces, black ambient | Dark room with colored neon bars |
| `tabletop-atlas` | xatlas multi-mesh packing, shared atlas, per-object materials | 1024 atlas, H64, 2 bounces | Table, several objects, lamp, inter-object shadows |

Sections/filters are technique-based: `ambient`, `gi`, `emissive`,
`multi-object`. `xatlas` and `shared atlas` are feature labels, not sections,
because every scenario uses the atlas pipeline.

The HDRI scene (`hdri-studio`) and the environment skybox belong to change 2
(AD-017). The harness API leaves an optional environment input as the extension
point.

### D8 — Main-thread bake with progress and cancellation

The package is `-sENVIRONMENT=web` (AD-013). The harness runs on the main
thread, yields every ~30 ms, reports the current bounce/object/stage and
supports `AbortSignal`. The display viewport pauses its render loop during a
bake and updates after each bounce. No worker claim is made.

### D9 — Preview mode and checked-in thumbnails

Demo routes accept `?preview=1`: page chrome, tabs, aside, meta bar and footer
are hidden; the stage is fixed to 16:10; the page bakes at draft quality and
sets `data-bake-state="done"` when finished. A headless capture script writes
640×400 CSS / DPR 2 WebP images plus `manifest.json` with a source hash per
scenario. CI validates the manifest and images but does not run a browser for
capture.

### D10 — Deployment topology

Use the existing build workflow, extended with:

1. upload the tested `dist` artifact;
2. a `site` job that downloads it, installs `site/`, typechecks, tests and
   builds with `SITE_BASE=/lightmapper-wasm/`, then uploads `site/dist`;
3. a `deploy` job that runs only on `Main` push or manual dispatch, uploads the
   Pages artifact and deploys it.

This avoids a second workflow and a duplicate site build. A separate
`pages.yml` triggered by `workflow_run` is the alternative if the workflow
grows.

### D11 — Roadmap and ADR sequence

| # | Change | ADRs | Depends on | Status |
|---|---|---|---|---|
| 10 | `add-showcase-site` | AD-015, AD-016 | 5 | This change |
| 11 | `add-hdri-environment-baking` | AD-017 | 10 | Planned |
| 12 | `promote-bake-harness` | AD-018 | 10, 11 | Planned |
| 13 | `add-three-adapter` | AD-019 | 12 | Planned |

The sequence is recorded in `docs/wasm-improvements.md` by this change's
tasks. Change 1 is implemented first; change 2 adds the environment skybox and
HDRI scene; change 3 promotes the harness with both paths proven; change 4
promotes the three.js helpers.

## Architecture

```text
+----------------------------- site/ (private Vite + TS) -----------------------------+
| gallery (#/)  -->  demo page (#/p/<id>)  -->  preview (?preview=1)                  |
|       |                    |                                                        |
|       |                    +-- 3D tab: three.js viewport (lit / unlit / wireframe)   |
|       |                    +-- Atlas tab: baked lightmap + UV chart layout           |
|       |                    +-- Code tab: exact scene module source                   |
|       |                    +-- aside: bake controls, statistics, PNG download         |
|       +-- thumbnails: WebP + manifest.json, checked in                               |
+--------------------------------------------------------------------------------------+
                                       |
                                       v
+----------------------------- scene / atlas / bake pipeline --------------------------+
| SceneModule[] --build--> SceneMesh[] --xatlas--> UnwrappedScene (shared atlas)       |
|                                                        |                             |
|                                      +-----------------+------------------+          |
|                                      v                                    v          |
|                             three.js display                    bake harness         |
|                             (albedo * lightmap)                 (own WebGL2 context)  |
+--------------------------------------------------------------------------------------+
                                       |
                                       v
+----------------------------- deploy --------------------------------------------------+
| Main build -> tested dist artifact -> site job -> Pages artifact -> deploy            |
+--------------------------------------------------------------------------------------+
```

### Scene and atlas contract

```ts
interface SceneMesh {
  kind: 'lit' | 'emissive';
  positions: Float32Array;
  indices: Uint32Array;
  normals?: Float32Array;
  albedo?: [number, number, number];   // linear
  emissive?: [number, number, number]; // linear HDR
}

interface SceneDefinition {
  meta: { id, title, description, features, sections, camera? };
  bake: BakePreset;
  build(): SceneMesh[];
}

interface UnwrappedScene {
  litObjects: UnwrappedObject[];   // positions/normals/uvs/indices/albedo
  emissiveObjects: SceneMesh[];
  atlas: { width, height, chartCount, utilization };
}
```

`unwrapScene` runs xatlas on the lit meshes only, copies positions/normals
through `xref`, normalizes UVs with the `[0,1)` clamp and returns the shared
atlas metadata.

### Bake harness contract

```ts
const harness = await createBakeHarness();
const result = await harness.bake(
  {
    atlas: { width, height },
    ambient: [0, 0, 0],
    objects: litAndEmissiveObjects,
  },
  {
    hemisphereSize: 64,
    bounces: 3,
    onProgress: (stage, fraction) => {},
    signal,
  },
);
```

The harness owns the hidden canvas/context, the bake shader, VAOs, per-object
`lmSetGeometry`, the shared-atlas loop, the GPU lightmap texture, dilation and
smoothing, statistics and readback. It returns:

```ts
interface BakeResult {
  lightmap: Float32Array;
  width: number;
  height: number;
  channels: 4;
  stats: BakeStats;
  durationMs: number;
}
```

The multi-object loop follows `LIGHTMAPPER.md`:

```text
for bounce:
  clear shared CPU atlas
  for each lit object:
    ctx = lmCreate(...)
    lmSetTargetLightmap(ctx, shared)
    lmSetGeometry(ctx, object)
    while lmBegin: drawAllObjects(); lmEnd()
    lmDestroy(ctx)
  dilate / smooth
  upload shared CPU atlas -> GPU atlas    // once, after all objects
```

### Three.js display contract

```ts
const display = new ThreeDisplay(container);
display.setScene(unwrappedScene, result);
display.updateLightmap(result);   // after each bounce
display.setMode('lit' | 'unlit');
display.setWireframe(on);
display.dispose();
```

The display layer creates a `THREE.DataTexture` with the lightmap's float data,
linear color space, clamp-to-edge wrapping and a filter supported by the
context. Lit materials use `map = lightmapTexture` and `color = albedo`;
emissive materials use the emissive color. The renderer uses ACES tone mapping
and sRGB output. The lightmap is never gamma-corrected twice.

### Site structure

```text
site/
  package.json, vite.config.ts, tsconfig.json, vitest.config.ts, index.html
  scripts/check-build.mjs, capture-thumbnails.mjs, bake-smoke.mjs
  src/
    app.ts, router.ts, chrome.ts, dom.ts, styles.css, main.ts
    gallery.ts, demo-page.ts, not-found.ts
    demos/types.ts, sections.ts, index.ts, sources.ts, coverage.ts
    demos/geometry.ts
    demos/ao-studio.ts, cornell-box.ts, emissive-alcove.ts, tabletop-atlas.ts
    atlas/unwrap.ts, atlas/types.ts, atlas/stats.ts
    bake/harness.ts, bake/shaders.ts, bake/gl.ts, bake/types.ts, bake/stats.ts
    display/three.ts, display/materials.ts
    assets/previews/*.webp, assets/previews/manifest.json
  test/catalog.test.ts, scenes.test.ts, atlas.test.ts, sources.test.ts,
       thumbnails.test.ts
```

## Risks / Trade-offs

- **Same-origin asset and base-path breakage** → `SITE_BASE`,
  `check-build.mjs`, and a byte-level asset check; the site is tested with the
  Pages base path in CI.
- **xatlas UV seams become shading seams** → copy normals through `xref`; hard
  edges stay hard because input boxes are split per face.
- **UV `1.0` wraps to `0.0`** → the shared `[0,1)` clamp and a scene test that
  asserts bounds and non-degenerate triangles.
- **Multi-object bake leaks light between objects** → draw the full scene for
  every object and upload the shared atlas only after all objects finish the
  bounce.
- **Main-thread bake freezes the page** → ~30 ms budget, rAF yield, progress
  overlay, cancel button and viewport pause.
- **Two WebGL2 contexts cost memory** → the bake context is hidden and small;
  the harness reuses it across bakes and disposes it with the page.
- **CI time grows** → site Vitest is fast; the headless smoke covers only the
  Cornell box and tabletop scenes at draft quality; thumbnails are checked in.
- **Reference-site licensing** → mirror the structure, write original site
  code; do not copy MPL/MIT source. The site's dependencies are documented in
  `site/README.md`.
- **The harness and display are not package entries yet** → both are written
  package-shaped and the follow-up changes are recorded in the roadmap; no
  public API is claimed before promotion.

## Verification

- `site`: `npm run check`, `npm test`, `npm run build` with
  `SITE_BASE=/lightmapper-wasm/`, and `npm run build:check`.
- Site Vitest: catalog metadata and unique ids, section coverage, source
  coverage, scene/atlas validity, `[0,1)` UV bounds, multi-object mesh count,
  thumbnail manifest/source hashes/WebP headers.
- Headless harness test: a lit quad plus an emissive ceiling, and a two-object
  shared-atlas bake; assert finite, non-zero output and correct dimensions.
- Headless site smoke: open `#/p/cornell-box?preview=1` and
  `#/p/tabletop-atlas?preview=1`, wait for `data-bake-state="done"`, assert
  finite/non-zero statistics and no page errors.
- Root pipeline: the existing `npm test`, `npm run test:bake`,
  `npm run test:dist`, `npm run test:loader`, `npm run test:consumer` remain
  green; `npm run verify:remote` is extended to run the site checks and the
  smoke bake.
- Manual review: the four thumbnails and the live preview routes at desktop
  and narrow widths.

## Migration Plan

This is additive. No existing package entry, loader behavior, artifact layout
or C contract changes. The site is new and gitignored at `site/dist` and
`site/node_modules`. Deployment requires the repository's Pages source to be
set to GitHub Actions. Rollback is deleting the `site/` deployment job and the
Pages artifact; the package remains unchanged.

## ADR Impact

- Add **AD-015** — the public showcase is a separate `site/` consumer deployed
  from the tested wasm artifact. Implements AD-004/AD-009 and respects AD-013.
- Add **AD-016** — showcase lightmap UVs are generated with `xatlas-wasm` for
  every scenario; the core package remains dependency-free.
- Record planned **AD-017** (HDRI environment baking), **AD-018** (bake harness
  package entry) and **AD-019** (optional three.js adapter) in the roadmap.
- Update `docs/wasm-improvements.md` with rows 10–13 and their status.
