# Proposal

## Why

Stage 1 isolated the reusable unwrap/bake pipeline as a private `studio/`
package, but that package still assumes the parent checkout: its
`lightmapper-wasm` dependency is `file:..`, its headless test allows the
repository root as a Vite source root, and nothing is published. Consumers
outside `lightmapper-wasm` cannot install it, so the showcase keeps consuming a
local link instead of a real package. This change is stage 2 of the
isolate -> bootstrap -> consume sequence recorded in AD-021.

## What Changes

- **`[lightmap-studio]`** Create the public repository
  `mode777/lightmap-studio` from the staged `studio/` tree, preserving the
  studio's history with a `git subtree split -P studio`. The new repository
  root becomes the package root.
- **`[lightmap-studio]`** Publish the package to npm as the public, unscoped
  `lightmap-studio@0.1.0`: ESM-only, `dist/index.js` with
  `dist/index.d.ts`, runtime dependencies on `lightmapper-wasm` and
  `xatlas-wasm`, and no three.js dependency.
- **`[lightmap-studio]`** Replace the `file:..` link with a registry range and
  remove every test, script and Vite configuration assumption that reaches
  above the package root.
- **`[lightmap-studio]`** Add the standalone build, test and release pipeline:
  TypeScript build, unit/loader/unwrap/import-boundary suites, a packed-tarball
  Vite consumer, a headless Chrome/SwiftShader bake, a tarball layout check,
  and a tag-driven npm publish with provenance.
- **`[lightmapper-wasm]`** Release `lightmapper-wasm@0.2.0` as the dependency
  prerequisite. The published `0.1.2` predates `lmSeed` and the `_srand`
  export, and its `dist/index.js` and wasm are older than the current source;
  the standalone studio needs the release that ships AD-024. The root package's
  entries, exports and dependency graph do not change.
- **`[lightmapper-wasm]`** Freeze the local `studio/` copy as staging input for
  stage 3, record the new repository as canonical, and leave the showcase on
  `lightmap-studio: file:../studio` until stage 3 switches it to the registry.
- **`[lightmapper-wasm]`** Update `docs/decisions.md` and
  `docs/wasm-improvements.md` (row 15 and the repository split table), and
  refresh the OpenSpec project context at archive time. This implements stage 2
  of AD-021, consumes the AD-024 release, and adds AD-025 (standalone
  repository and publication) and AD-026 (tag-gated release and dependency
  floor). No accepted ADR is reversed or superseded.
- No **BREAKING** change: nothing consumes the studio from the registry yet,
  and the `lmSeed` addition to `lightmapper-wasm` is additive.

## Capabilities

### New Capabilities

- `studio-package`: the standalone distribution contract for
  `lightmap-studio` — repository and package identity, published artifact
  layout, runtime dependency policy, checkout-independent consumer
  verification, tag-driven release, documentation, and the staged handoff from
  the local `studio/` copy.

### Modified Capabilities

- None. The studio API, loader, bake behavior and the root package's published
  artifact are unchanged; only how the studio is distributed changes.

## Impact

- **`[lightmap-studio]`**: new repository, package metadata, lockfile, CI and
  release workflow, packed-consumer and tarball tests, README rewrite, and
  removal of parent-checkout paths from the headless and consumer tests. The
  public API, lighting model, presets, loader semantics and result shape stay
  exactly as specified in `lightmap-studio` and `studio-loader`.
- **`[lightmapper-wasm]`**: one patch release of build output and the `0.2.0`
  version/metadata bump; documentation updates to the ADR log, roadmap,
  `studio/README.md` freeze note and OpenSpec context. The `site/` package,
  the root exports, the root `files` list and the root dependency graph are
  unchanged.
- **Dependencies**: the studio takes `lightmapper-wasm@^0.2.0` and
  `xatlas-wasm@^0.2.0` from the registry. three.js stays a showcase-only
  dependency; the root package stays dependency-free.
- **APIs**: none. The studio's existing `createStudio`, `unwrap`, `bake`,
  `createEmissiveSphere` and `StudioError` surface is republished, not
  redesigned.
- **Build and CI**: the new repository builds with Node only (no Emscripten);
  the root workflow is unchanged apart from publishing the `0.2.0` release.
- **npm**: adds `lightmap-studio` to the registry and publishes
  `lightmapper-wasm@0.2.0`. No scoped package, org move or publish-mechanics
  redesign for the root package.
- **Upstream C**: none. No `[lightmapper]` task and no submodule bump.

## Out of Scope

- **Stage 3** (`consume-lightmap-studio`): deleting `studio/`, switching
  `site/` to the registry package, and removing the `file:../studio` link.
- Moving the showcase, its seven scenarios, the three.js display or the
  checked-in HDRI assets into the studio repository, and adding any new
  three.js sample.
- Changing the studio API, sampling math, lighting model, preset values,
  `[0,1)` UV clamp, loader precedence or error codes.
- Root package publish-mechanics changes (trusted publishing, tokens or
  workflow redesign); the existing release workflow is exercised unchanged.
- A scoped or renamed npm package, a new `lightmap-studio` version beyond the
  initial `0.1.0`, and a compatibility matrix across older studio releases.
- Node rendering, native GL, Web Workers/`OffscreenCanvas` and any C-side
  rendering behavior.
