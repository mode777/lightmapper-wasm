# Proposal

## Why

The package builds with `-sSINGLE_FILE=1`, so the ~44 KB wasm binary is
base64-embedded inside `dist/index.js` (~107 KB). That blocks streaming
compilation (`WebAssembly.instantiateStreaming`), HTTP caching of the binary,
and any `locateFile`-style asset override, and it makes the JS bundle larger
than the program it loads (finding F5 in `docs/wasm-improvements.md`). The
published artifact shape also constrains the planned worker support (change 6)
and verification work (change 7), so the loader change comes first in the
roadmap sequence.

## What Changes

All work items are owned by this repository (`lightmapper-wasm`); there are no
`[lightmapper]` tasks and no C-side changes.

- The default Emscripten build emits a separate `lightmapper_wasm.wasm` asset
  next to the `.mjs` glue (`SINGLE_FILE=0`), and the single-file layout becomes
  an explicitly selectable optional flavour instead of the default.
- `scripts/build-dist.mjs` assembles a `dist/` that contains the loader entry
  `dist/index.js`, the separate asset `dist/lightmapper.wasm`, and
  `dist/index.d.ts`; the optional single-file flavour is assembled as its own
  entry and its docs do not claim a `.wasm` asset.
- `createLightmapperModule` gains explicit asset control: `wasmBinary` (raw
  bytes win over any resolution) and `locateWasm` (maps to the Emscripten
  `locateFile` hook). The default resolution is
  `new URL("./lightmapper.wasm", import.meta.url)` relative to the installed
  module.
- The browser load path uses `fetch` + `WebAssembly.instantiateStreaming` with
  an ArrayBuffer/`instantiate` fallback; a missing or undeliverable asset
  rejects initialization with an error naming the failed step.
- The existing initialization shape is unchanged and remains ahead of any wasm
  bytes being fetched: WebGL2 context resolution, `EXT_color_buffer_float` /
  RGBA32F readback probe, Emscripten context registration and strict context
  binding (per AD-005).
- `package.json` `files`/`exports` cover the new asset and the optional
  single-file entry; no runtime dependency is added.
- README, `WASM_SETUP.md` and the API documentation describe the two flavours
  and stop implying that `locateFile` is a no-op or that a `.wasm` exists in
  the single-file flavour.
- A minimal packaging/consumer check verifies the published layout (entry +
  asset, resolvable URL, load via the packaged files) in headless Chrome; the
  full verification suite remains change 7 (`wasm-verification`).

Not breaking: `createLightmapperModule(options)` stays the only entry, the
low-level `lm*` API and its signatures are untouched, and existing options keep
their meaning. The default artifact layout changes, which is a packaging-level
change for bundler users, handled by the migration note in the docs.

## Capabilities

### New Capabilities

None. The change fits the existing capability boundaries.

### Modified Capabilities

- `wasm-loader`: factory selection and module loading become wasm-asset
  resolution and streaming instantiation with `wasmBinary`/`locateWasm`
  overrides; initialization order (probe before bytes) and the current
  browser-only environment requirement are restated, not changed.
- `wasm-build-pipeline`: the single-file artifact requirement is replaced by a
  separate-`.wasm` default plus an optional single-file flavour; dist assembly
  and the artifact size/digest report cover the emitted `.wasm`.
- `npm-package`: the published artifact requirement changes from "single-file
  only, no `.wasm` promised" to "separate `.wasm` beside the ESM entry, with
  the single-file flavour as an additional published entry".

## Impact

- Build: `wasm/CMakeLists.txt` (link flags, output naming), `package.json`
  build scripts, `scripts/report-artifact.mjs` (digest the emitted `.wasm`
  directly instead of extracting base64).
- Packaging: `scripts/build-dist.mjs` (new assembly, and every textual
  replacement it performs is asserted rather than silently skipped — the
  packaging-script fragility this change has to touch, finding F12), `package.json`
  `files`/`exports`.
- Loader/API: `src/index.js`, `types/index.d.ts` (new options), demo page.
- Docs: `README.md`, `WASM_SETUP.md`, `LIGHTMAPPER.md` (loading section).
- Planning records: `docs/decisions.md` (AD-009 Proposed → Accepted) and
  `docs/wasm-improvements.md` (roadmap status for change 5, findings F5 and the
  packaging half of F12).
- CI workflow (`publish.yml`) build steps, which already run the build scripts
  and need no new tooling beyond the existing headless-Chrome probe pattern.
- No changes to `thirdparty/lightmapper`, the C shim's exported surface, or the
  WebGL2 capability probe and strict context binding.

## ADR footprint

Implements **AD-009** (separate `.wasm` asset and explicit loader; currently
Proposed — this change moves it to Accepted). It preserves AD-005 (the
capability probe and strict binding stay ahead of module loading), AD-006
(ESM-only, browser-first, no runtime dependencies), AD-003 (WebGL2-only flags)
and AD-008 (pinned Emscripten 3.1.64). No ADR is reversed or superseded.

## Out of scope

- Node rendering support; the default asset resolution is browser `fetch`.
  Node remains usable for packaging/tests only via `wasmBinary` or
  `moduleFactory` (AD-006).
- Web Worker / `OffscreenCanvas` support (AD-013, roadmap change 6).
- The full verification suite — smoke bake, golden hashes, capability-failure
  matrix, packaged Vite consumer (AD-010, roadmap change 7).
- Generated TypeScript declarations and ABI checks (AD-012, change 8).
- npm publish mechanics, version bump, CHANGELOG, tag gate (change 9).
- Any C-side change in `thirdparty/lightmapper`, including shader, readback or
  example work; no submodule bump is required by this change.
- Migrating the build to an external bundler (the F12 bundler option stays
  open; this change only asserts the existing script's replacements).
