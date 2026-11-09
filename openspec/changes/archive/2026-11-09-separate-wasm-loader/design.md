# Design

## Context

Today `-sSINGLE_FILE=1` links the wasm into `lightmapper_wasm.mjs` as a base64
data URI; `scripts/build-dist.mjs` inlines that glue into `dist/index.js` with
three unasserted regex replacements, and `src/index.js` falls back to a
dynamic import of `../build/wasm/wasm/lightmapper_wasm.mjs` in the source
layout (`src/index.js` line 1, 186–189; `scripts/build-dist.mjs` lines 19–44).
The loader sequence is probe → factory import → instantiate → register context
(AD-005 shape). The libfive-wasm loader (roadmap §5.1) is the proven model: a
separate `.wasm` beside the entry, resolved via `import.meta.url`, fetched and
instantiated with a streaming path and an ArrayBuffer fallback, with
`wasmBinary`/`locateWasm` escape hatches. See `proposal.md` — Why for the
motivation; this change implements AD-009.

The Emscripten toolchain stays pinned to 3.1.64 (AD-008), the package stays
ESM-only with no runtime dependency (AD-006), and WebGL2 remains the only
graphics target (AD-003).

## Goals / Non-Goals

**Goals:**

- Default build and published entry load a separate, streamable, cacheable
  `.wasm` asset with loader-controlled resolution and error reporting.
- Keep the single-file layout available as an explicitly selected build
  flavour and published entry.
- Make `build-dist` fail loudly when its patches do not apply (the packaging
  half of F12).
- Keep verification runnable without a physical GPU, following the existing
  `test:shader`/`test:readback` headless-Chrome pattern.

**Non-Goals:**

- No worker/`OffscreenCanvas` support (AD-013, change 6) and no Node rendering
  (AD-006).
- No full verification suite: golden hashes, capability-failure matrix and the
  installed-Vite bake belong to change 7; this change adds only the packaging
  and asset-loading checks its acceptance requires.
- No bundler migration of `build-dist` (the other half of F12); no generated
  types (AD-012, change 8); no release/publish mechanics (change 9).
- No C-side change and no submodule bump.

## Decisions

### D1 — Two build flavours in separate build directories (`LM_WASM_SINGLE_FILE`, default OFF)

`wasm/CMakeLists.txt` gains an option that appends `-sSINGLE_FILE=1` when ON.
The default `configure:wasm`/`build:wasm` (Release, `build/wasm`) emits
`lightmapper_wasm.mjs` + `lightmapper_wasm.wasm`. New
`configure:wasm:single`/`build:wasm:single` scripts configure
`build/wasm-single` with the option ON. This mirrors the existing debug
flavour (`build/wasm-debug`), keeps every flavour's artifacts separate, and
makes the flavour an explicit choice.

*Alternative rejected:* two CMake targets in one build directory — link flags
are per-target but the repo already established flavour-per-directory, and a
second target doubles the configured build for everyone who only needs the
default.

### D2 — The loader fetches the bytes itself and passes them to the factory

`src/index.js` resolves bytes in this precedence: explicit
`options.wasmModuleOptions.wasmBinary` (raw Emscripten passthrough, untouched)
→ `options.wasmBinary` → the location from `options.locateWasm` → the default
asset URL. Unless bytes were supplied, the loader `fetch`es the location,
prefers `WebAssembly.instantiateStreaming(response)` and falls back to
`arrayBuffer()` + `WebAssembly.instantiate` when streaming is unavailable or
rejects (e.g. wrong MIME type). The resulting bytes are handed to the factory
as the `wasmBinary` module option, so the Emscripten glue never performs its
own asset fetch.

Doing resolution in the loader (rather than delegating to the glue's built-in
`locateFile` machinery) is what makes the precedence, the error messages that
name the asset URL, and the probe-before-fetch ordering live in one testable
place. A non-OK response or failed fetch rejects initialization naming the URL
and status; `data:` URIs returned by `locateWasm` work incidentally because
`fetch` accepts them.

*Alternative rejected:* passing only a rewritten `locateFile` through
`wasmModuleOptions` — it would push precedence and error reporting into glue
internals that differ per Emscripten version.

### D3 — Default asset URL from one path constant, rewritten (asserted) at dist time

`src/index.js` keeps a single `WASM_ASSET_PATH` constant
(`"../build/wasm/wasm/lightmapper_wasm.wasm"`) and resolves the default URL as
`new URL(WASM_ASSET_PATH, import.meta.url)` — the asset sits beside the
dynamically imported factory module, so this resolves correctly in the source
layout. `build-dist` rewrites both the constant and the `new URL(...)` call to
the literal `new URL("./lightmapper.wasm", import.meta.url)` in the published
entry, where the inlined glue makes the entry itself the resolution base: the
literal form is required because bundler asset plugins (Vite's included) only
rewrite literal `new URL("<path>", import.meta.url)` expressions, never a
variable. The inlined glue's own dead fetch path is retargeted from the
build-output filename to the published literal so bundlers see one consistent
asset reference and do not warn about a missing file. The published asset is
named `lightmapper.wasm` (package-level name), copied with rename from the
emitted `lightmapper_wasm.wasm`.

*Alternative rejected:* exporting the factory module's own URL from the glue —
3.1.64 does not expose it reliably for inlined dist builds.

### D4 — `build-dist` assembles both entries and asserts every replacement

A small `assertReplace(source, pattern, replacement, name)` helper throws with
the replacement's name when a pattern matches zero times (or more than once).
Assembly of the default entry: strip `export default Module;` from the glue,
inline it, replace the dynamic-import fallback with `_inlinedModuleFactory`,
rewrite `WASM_ASSET_PATH` to `"./lightmapper.wasm"`, copy the `.wasm` asset,
copy `types/index.d.ts` → `dist/index.d.ts`. Assembly of the single-file entry
(`dist/single.js`, export subpath `./single`, types `dist/single.d.ts`):
inline the single-flavour glue the same way and set a
`const _singleFileFactory = true` marker that makes the loader skip asset
resolution entirely, so the single entry never fetches. The script requires
both flavour build directories and exits non-zero when either input or any
replacement is missing — the tarball layout stays deterministic.

*Alternative rejected:* making the single-file entry a separate hand-written
loader — duplicated drift surface for an entry whose only difference is the
byte source.

### D5 — Loader skips resolution for the single-file entry and for custom factories

Asset resolution runs only when the default factory is used and no explicit
bytes were supplied. `options.moduleFactory` users own resolution themselves
(their factory may not even target a `.wasm`). The `_singleFileFactory`
marker (D4) short-circuits the default path for the embedded flavour.

### D6 — Report digests the real file

`scripts/report-artifact.mjs` reads `build/wasm/wasm/lightmapper_wasm.wasm`
directly for size + SHA-256 (reproducibility carried over from change 4) and
prints the `.mjs` glue size; when `build/wasm-single` exists it reports that
flavour's embedded size with the existing base64-extraction logic.

### D7 — Package surface

`exports` gains `"./single"` → `dist/single.js` (+ `dist/single.d.ts`); the
default entry, `files: ["dist/", ...]`, ESM-only and the no-runtime-dependency
policy are unchanged. `types/index.d.ts` gains `wasmBinary` (bytes) and
`locateWasm` (URL/filename override) with the precedence documented in JSDoc;
the low-level `lm*` surface is untouched.

### D8 — Verification without a GPU

Following the existing `test:shader`/`test:readback` pattern
(`CHROME_SHELL_PATH` + ANGLE SwiftShader, no physical GPU):

- `test/dist-layout.mjs` (Node-only): after `build:dist`, assert the dist
  contents — entry without a base64 data URI, byte-identical
  `dist/lightmapper.wasm`, `dist/single.js` with the embedded payload,
  declarations, and that `dist/index.js` references `./lightmapper.wasm`.
- `test/loader-asset.mjs` (headless Chrome, dist served over HTTP):
  initialize the packaged entry with a real WebGL2 context, count that
  exactly one request fetches `lightmapper.wasm`, and confirm streaming or
  fallback instantiation succeeded; initialize again with `wasmBinary`
  (pre-fetched bytes) and confirm zero asset requests; point `locateWasm` at
  a missing path and confirm the rejection names it.
- `test/consumer-vite.mjs` (Node): `npm pack`, install the tarball into a
  scratch Vite project, build, and assert the `.wasm` is emitted into the
  build output next to the bundled entry. Vite is a `devDependencies`-only
  addition (AD-006 allows build-only tooling).

### ADR and planning-record footprint

This change moves **AD-009** from Proposed to Accepted and extends its
consequences with the published `./single` entry; no other ADR changes, no
decision is reversed. `docs/wasm-improvements.md` is updated in the same
change: roadmap row 5 status, findings F5 (fixed) and the packaging half of
F12 (asserted replacements; bundler option remains open), and the §5.2/§5.3
loader description.

## Risks / Trade-offs

- [Emscripten glue still performs an internal asset fetch despite supplied
  bytes] → the loader-asset test counts requests to `lightmapper.wasm`; any
  second fetch fails the test. Pinned toolchain (AD-008) keeps glue behavior
  stable.
- [Regex patching remains fragile when Emscripten output drifts] → every
  replacement is asserted and fails the build loudly; a bundler-based build
  stays a separate future change.
- [`new URL(..., import.meta.url)` behaves differently per bundler] → the
  Vite consumer test proves the mainline path; `wasmBinary`/`locateWasm` give
  consumers with exotic bundlers a documented escape hatch.
- [Two flavours double the wasm link work in CI] → the program is ~44 KB;
  both links together remain well under a minute on the pinned toolchain, and
  the default-only path is unchanged for local iteration.
- [Breaking change for consumers who relied on embedded bytes] → the
  `./single` entry preserves the old behavior; README migration note covers
  the switch; the version bump and CHANGELOG are handled by change 9.
- [`file://` pages cannot `fetch`] → documented limitation: serve over HTTP
  (already true for the demo); the single-file entry is the offline fallback.

## Migration Plan

1. Land the build flavour + dist assembly behind the existing scripts
   (`build:wasm`, `build:wasm:single`, `build:dist`) — CI builds both
   flavours before assembling.
2. Switch the loader to asset resolution with the documented precedence; the
   capability probe and registration order are untouched.
3. Update README/`WASM_SETUP.md`/`LIGHTMAPPER.md` so each entry's layout is
   described accurately; add the `./single` migration note for embedded-bytes
   consumers.
4. Update `docs/decisions.md` (AD-009 → Accepted) and
   `docs/wasm-improvements.md` (row 5, F5, F12-partial).

Rollback: revert the change; the previous single-file-only layout rebuilds
from git history with the same scripts.
