# Design

## Context

See `proposal.md` — Why for the motivation. The current shapes that constrain
the approach:

- `site/src/demos/types.ts` defines `SceneDefinition { meta, bake: BakePreset,
  build(): SceneMesh[] }`. `BakePreset` is a site-private dialect
  (`atlasSize`, `hemisphereSize`, `ambient`, `environmentBake`, ...).
- `site/src/demo-page.ts` translates at runtime: `toMeshInput` /
  `toEmissiveInput` (lines ~724–755) and the `BakeInput` assembly block
  (lines ~670–705) that folds the preset into `meshes`, `lighting`, `atlas`,
  `quality: "preview"` and `options`.
- The Code view renders `?raw` imports of the scene module (`sources.ts`) and
  `site/scripts/bake-smoke.mjs` asserts the rendered text equals
  `SCENE_SOURCES[id]`.
- `site/scripts/source-hash.mjs` hashes `<id>.ts` + `geometry.ts` + `types.ts` +
  `sections.ts` (+ env asset and `environment/hdr.ts` for HDRI scenes); every
  scene edit therefore invalidates its thumbnail.
- `site/src/gallery.ts` reads `scenario.bake.atlasSize` and `.bounces` for card
  labels and the configured-bounce total.
- The studio is a registry dependency (AD-027): only its published
  `BakeInput`, `MeshInput`, `EmissiveMeshInput`, `LightingInput`,
  `EnvironmentInput` and `QualityPreset` types are available. `EnvironmentInput`
  is decoded linear float data; a URL cannot cross that boundary.
- `resolveBakeSettings` defaults `quality` to `preview` when the input omits it
  and derives every unspecified option from that preset.

## Goals / Non-Goals

**Goals:**

- Every scene module is a real `lightmap-studio` `BakeInput` producer, so the
  published sample uses the studio's types and field names.
- The Code view shows that input plus a short, accurate description of the two
  studio calls that consume it.
- The page keeps a single source of truth for bake values: the scene input.
- The rendered result is unchanged.

**Non-Goals:**

- No change to `lightmap-studio`, its version, or its published API.
- No self-contained pasteable program: the scene still needs the site's
  geometry helpers, and shipping or inlining them is not part of this change.
- No wrapper-level (`createLightmapperModule` / `lm*`) example in the Code
  view; that is a separate identity decision.
- No hero, navigation, title or "which package to install" copy.
- No new failure route, quality preset or scene.

## Decisions

### D1 — Show the real per-scene input, not a curated example

The alternative was a hand-written, self-contained snippet per scene
(`createStudio` → `bake` → `result.lightmap`) that does not run the page.
Rejected: it drifts from the running code, needs its own compile/bake gate, and
cannot be made pasteable anyway while the scene geometry is site-local. The
gallery's only defensible claim is "this is the code that made this image", and
only the real input preserves it. The shared call sequence is therefore handled
by a fixed header (D4) rather than duplicated per scene.

### D2 — Scenes expose `bake(environment?: EnvironmentInput): BakeInput`

A scene constant cannot carry the decoded environment: the page decodes the HDRI
and builds the display texture (`site/src/environment/hdr.ts`). A factory keeps
one argument and one return value, so the shown signature is the studio input
shape rather than a site descriptor. The alternative — an async factory that
decodes internally — was rejected because it duplicates display-texture
creation and prefilter wiring inside every HDRI scene and mixes renderer
concerns into the input module.

`SceneDefinition` becomes:

```ts
interface SceneDefinition {
  meta: SceneMeta;
  environment?: HdrSceneEnvironment;   // site-local asset descriptor
  build(): SceneMesh[];                // display and scene tests
  bake(environment: EnvironmentInput | null): BakeInput;
}
```

`HdrSceneEnvironment` keeps `url` and `intensity` for the loader and the display
background. The bake-only prefilter radius moves into `bake()`, where it belongs
(`options.environmentPrefilter`), and `EnvironmentBakeOptions` is deleted.

### D3 — Scenes omit `quality`

`resolveBakeSettings` already defaults `quality` to `preview`, which is exactly
what the page passes today, so omitting it is behavior-identical and removes a
misleading `"preview"` literal from a snippet whose UI label says "Standard".
The page keeps overriding `options.hemisphereSize` and `options.bounces` for its
quality and bounce controls; those overrides are runtime controls, not part of
the scene input, and the Code view states that (spec: Code view stays
consistent when quality changes).

### D4 — Fixed usage header above the scene source

A short constant (roughly ten lines) shows `createStudio`, `studio.bake(input)`
and the `result.lightmap` accessor. It lives in `site/src/demos/example.ts` and
is not part of the thumbnail hash, because it does not affect a render; adding
it to `SHARED_FILES` would force seven recaptures for a copy edit. A test
asserts that the identifiers it names exist in the installed `lightmap-studio`
package, so a studio rename cannot leave the header lying.

The two blocks are rendered in the existing Code panel with captions ("bake it"
and `<id>.ts`). The copy action copies header, blank line, then scene source, so
the clipboard content is the whole example rather than half of it.

### D5 — `codeFor(id)` is the single Code-view source

`sources.ts` gains `codeFor(id) = USAGE_HEADER + "\n\n" + SCENE_SOURCES[id]`,
and both the page and `bake-smoke.mjs` compare against it. `SCENE_SOURCES`
stays for per-scene assertions and `sources.test.ts`; the existing
"tab text === file on disk" invariant becomes "tab text === header + file on
disk".

### D6 — Gallery derives labels from `bake(null)`

Cards and the configured-bounce total read `bake(null).atlas.size` and
`bake(null).options.bounces` through a memoized helper, so there is no second
copy of the numbers to keep in sync. `bake(null)` is safe for HDRI scenes: it
only assembles the object, and the studio validates the environment at bake
time. The cost is building each scene's geometry once when the gallery renders;
that is the same work the scene page already does and is not on the bake path.

### D7 — Preview atlas cap stays a page override

`?preview=1` narrows `atlas.size` in the page instead of asking every scene for
a cached size. Preview mode hides the tabs, so the displayed input and the
narrowed runtime input cannot be observed together; normal bakes use the scene
input unchanged.

### D8 — Behavior preservation is a verification gate, not a hope

The refactor must not change a single pixel. Because the capture path
(`?preview=1`) is untouched, recaptured thumbnails should be byte-identical
WebP files whose manifest hashes differ only because the scene sources changed.
If the images or the recorded bake statistics move, the refactor changed a
default and must be fixed before the thumbnails are accepted.

### D9 — One new ADR

AD-027 is implemented (no change). AD-015 is extended: the site is still a
private consumer deployed from the tested artifact, but its Code view now
teaches the studio input contract instead of the gallery's private scene
dialect. No accepted ADR is contradicted or superseded. The change adds the next
sequential ADR recording that choice, and a roadmap row in
`docs/wasm-improvements.md`.

## Risks / Trade-offs

- **A shifted default silently changes the bake** (preset, dilation, smoothing,
  prefilter) → the D8 gate: identical bake statistics and byte-identical
  recaptured WebP files; investigate any difference before accepting.
- **The scene files still import site code** (`./geometry`, a mesh adapter), so
  the snippet is a studio input, not a runnable program → the header and the
  block captions state what runs; pasteability is explicitly a non-goal.
- **The header drifts from the studio API** → the identifier test in D4.
- **Tests weaken while being rewritten** (they currently assert
  `scenario.bake.ambient`, `.hemisphereWeight`, `.environmentBake`) → replace
  each with an assertion against `bake(null)` / `bake(environment)` so coverage
  is preserved, not deleted.
- **Seven thumbnails must be recaptured in one run** → recapture from the
  verification box with `SITE_BASE` unchanged; commit images and manifest
  together (AD-028 workflow).
- **The gallery builds seven scenes for labels** → memoize the derived summary;
  it runs once per gallery render, not per card.

## Verification Strategy

Everything below runs without a physical GPU, on headless Chrome with ANGLE
SwiftShader, matching the existing site gates:

- `npm run check --prefix site` — the new `BakeInput` factories and the removed
  preset types typecheck against the installed studio declarations.
- `npm test --prefix site` — sources test (header + file), catalog, scenes
  (rewritten against `bake(null)`), thumbnails (hash staleness), import
  boundary.
- `CHROME_SHELL_PATH=… npm run test:harness --prefix site` — bake path and
  display unchanged.
- `CHROME_SHELL_PATH=… npm run test:smoke --prefix site` — Code view shows the
  header and copies it; bake states, previews and failure routes unchanged.
- `CPU-only` stat comparison: record `window.__showcase.stats` per scene before
  and after the refactor; require equality.
- `npm run capture:thumbnails --prefix site` — recapture; require the seven WebP
  files to be byte-identical to the checked-in ones, with only the manifest
  hashes changed.
- `npm run verify:remote` — full pipeline, including the site build check with
  `SITE_BASE=/lightmapper-wasm/`.

## Migration Plan

Single-repository, single-branch change on `Main`; no deployment coordination.

1. Land the scene/input refactor with the Code view change and updated tests.
2. Recapture and commit thumbnails with the manifest.
3. Update `site/README.md`, the root `README.md` showcase paragraph, the ADR log
   and the roadmap row.
4. Roll back by reverting the commit; thumbnails and their manifest revert with
   it, and no runtime state or published artifact is involved.

## Open Questions

- Whether a later change adds a wrapper-level block to the Code view (deferred;
  it depends on the separate "which package should a visitor install" decision).
- Whether the header should show `studio.unwrap` as a separate step from
  `studio.bake` (deferred; `bake` performs the atlas step and the Atlas view
  already exposes the unwrap result).
