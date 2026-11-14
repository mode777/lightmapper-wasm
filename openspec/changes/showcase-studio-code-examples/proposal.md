# Proposal

## Why

The showcase's Code view is its only "how is this made?" affordance, and it
renders `site/src/demos/<id>.ts` verbatim. Those files contain no package code:
they declare a private `SceneDefinition`/`BakePreset` dialect, call site-local
geometry helpers, and never import `lightmap-studio` (or `lightmapper-wasm`).
The studio call that actually produces the image lives in `demo-page.ts` and is
shown nowhere.

Since the studio was extracted and published (AD-021, AD-025, AD-027) the page
is a `lightmap-studio` consumer, so its most visible, most copy-encouraged and
most test-locked code sample teaches a dialect that exists only in this
repository. The private type is not exported by any package, the quality
vocabulary diverges from the studio's (`draft|standard|high` vs
`draft|preview|final`), and the snippet has no entry point, so the Copy button
is a dead end. Meanwhile the studio has no demo of its own; its published
README is the only other documentation of the input contract.

## What Changes

- `site/src/demos/<id>.ts` SHALL build a real `lightmap-studio` `BakeInput`
  (`meshes`, `lighting`, `atlas`, `quality`, `options`) instead of the private
  bake preset, so the published sample uses the studio's own types and
  vocabulary.
- The Code view SHALL render a short fixed studio usage header
  (`createStudio` → `studio.bake(input)` → `result.lightmap`) above the exact
  per-scene input module, with both blocks labeled.
- `demo-page.ts` SHALL pass the scene's `BakeInput` to `studio.bake` directly;
  the mesh-translation and preset-assembly block moves into the scene modules.
- The scene environment asset descriptor and prefilter radius SHALL move out of
  the removed preset into a scene-level field, because the descriptor is needed
  before the HDRI is decoded and the studio itself accepts only decoded linear
  float data.
- Gallery card labels, the configured-bounce total and the initial
  bounces/atlas controls SHALL derive from that same single `BakeInput` source
  instead of a parallel preset copy.
- The `showcase-site` Code-view requirement SHALL be reworded from "the exact
  scene module source" to "the scene's exact studio input, preceded by a fixed
  usage header", so the spec describes what the tab teaches.
- The bake result SHALL be unchanged: identical meshes, lighting, atlas and
  options values produce byte-identical lightmaps. Thumbnails are recaptured
  because every scene source hash changes, not because the images change.
- **Not breaking** for package consumers: no change to `lightmapper-wasm`
  exports, artifacts, loader or the published `lightmap-studio` API.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `showcase-site`: the Code view requirement changes from showing a private
  scene-definition source to showing the scene's exact `lightmap-studio` input
  plus a fixed usage header; the gallery and bake controls derive atlas size
  and bounce metadata from that input rather than a separate preset.

## Impact

Owning repository for every work item: this repository (`lightmapper-wasm`).
No `[lightmapper]` upstream work, no submodule bump, no wasm, loader,
package-entry or studio release change.

- `site/src/demos/types.ts` — remove `BakePreset` and `EnvironmentBakeOptions`;
  keep gallery metadata, the scene environment descriptor and the mesh type.
- `site/src/demos/<id>.ts` (seven files) — export the studio `BakeInput` for
  the scene.
- `site/src/demos/sources.ts`, `site/src/demos/example.ts` (new) — fixed usage
  header plus the exact per-scene source.
- `site/src/demo-page.ts` — consume `BakeInput`; delete `toMeshInput`,
  `toEmissiveInput` and the bake-input assembly block.
- `site/src/gallery.ts` — read atlas size and bounces from the scene input.
- `site/test/sources.test.ts`, `scenes.test.ts`, `catalog.test.ts`,
  `thumbnails.test.ts`; `site/scripts/bake-smoke.mjs` — assert the new Code
  view contract and derive expectations from the input.
- `site/src/assets/previews/*` and `manifest.json` — recapture all seven
  thumbnails (hash-only change).
- `site/README.md`, `README.md`, `docs/decisions.md` (new ADR), and
  `docs/wasm-improvements.md` (roadmap row).

## Decisions

- Implements AD-027 (the showcase consumes the published studio package) and
  extends AD-015 (separate showcase consumer) without superseding it: the page
  remains a private consumer deployed from the tested artifact, but what its
  Code view teaches is now the studio input contract.
- Contradicts no accepted ADR. Adds one new ADR (next sequential ID) recording
  that the Code view teaches the studio input rather than the gallery's private
  scene dialect.
- Out of scope: the studio package itself, the wrapper's low-level API in the
  Code view, site branding/hero/nav copy and the "which package should a
  visitor install" identity decision, Node rendering, native GL, npm
  publishing mechanics, worker support and every C-side behavior.
