# wasm-build-pipeline Specification

## Purpose

Defines the current Emscripten build that turns the C shim and the
`thirdparty/lightmapper` submodule into the browser artifact, and the
`build:dist` step that assembles the npm entry and declarations.

## Requirements

### Requirement: Single build entry points
The repository SHALL expose `npm run configure:wasm`, `npm run build:wasm` and
`npm run build:dist` as the supported build path, and each step SHALL exit
non-zero when it fails.

#### Scenario: Full build produces the package
- **WHEN** `configure:wasm`, `build:wasm` and `build:dist` run in order on a
  checkout with the submodule initialized and Emscripten available
- **THEN** `dist/index.js` and `dist/index.d.ts` exist and the JavaScript entry
  can be imported

#### Scenario: Configure failure propagates
- **WHEN** `emcmake` or CMake configuration fails
- **THEN** `configure:wasm` exits non-zero and no successful artifact is
  reported

### Requirement: WebGL2 Emscripten target
The CMake target SHALL compile the C shim against the upstream header with
GLES3/WebGL2 enabled, no filesystem, and memory growth enabled.

#### Scenario: Target configuration
- **WHEN** `wasm/CMakeLists.txt` is configured under Emscripten
- **THEN** the target links with `MIN_WEBGL_VERSION=2`,
  `MAX_WEBGL_VERSION=2`, `FILESYSTEM=0`, `ALLOW_MEMORY_GROWTH=1`,
  `MODULARIZE=1` and `EXPORT_ES6=1`

#### Scenario: C shim exports are present
- **WHEN** the module is instantiated
- **THEN** the `_lmwCreate`, `_lmwDestroy`, `_lmwSetTargetLightmap`,
  `_lmwSetGeometry`, `_lmwBegin`, `_lmwEnd`, `_lmwProgress`, the image helpers,
  the constant getters and `_malloc`/`_free` are callable

### Requirement: Dist assembly
`scripts/build-dist.mjs` SHALL assemble the published `dist/` from the
separate-asset build: inline the Emscripten glue into `src/index.js`, copy the
emitted `.wasm` to `dist/lightmapper.wasm`, write `dist/index.js` and
`dist/index.d.ts`, and assemble the single-file entry from the single-file
flavour build. Every textual replacement the script performs SHALL be
asserted, and the script SHALL exit non-zero when an expected input or
replacement is missing.

#### Scenario: Entry contains the factory
- **WHEN** `dist/index.js` is inspected
- **THEN** it contains the inlined Emscripten glue, exports
  `createLightmapperModule`, imports no build-tree path and embeds no base64
  wasm

#### Scenario: Asset is assembled beside the entry
- **WHEN** `dist/` is inspected after `build:dist`
- **THEN** `dist/lightmapper.wasm` is byte-identical to the emitted
  `lightmapper_wasm.wasm`

#### Scenario: Single-file entry is assembled
- **WHEN** `build:dist` completes with both flavour builds present
- **THEN** `dist/` also contains the single-file entry with the wasm embedded

#### Scenario: Declarations are copied
- **WHEN** `dist/` is inspected
- **THEN** `dist/index.d.ts` matches `types/index.d.ts`

#### Scenario: Failed patch fails the build
- **WHEN** an expected replacement does not match its input file
- **THEN** `build:dist` exits non-zero with the failed replacement named

### Requirement: Optimised release build
The default `configure:wasm`/`build:wasm` path SHALL configure a Release build
compiled with `-O3` and `NDEBUG`, while keeping the separate-asset layout and
the public API unchanged.

#### Scenario: Default configure selects Release
- **WHEN** `configure:wasm` runs without an explicit build type
- **THEN** CMake configures `build/wasm` with `CMAKE_BUILD_TYPE=Release`

#### Scenario: Release compilation is optimised
- **WHEN** `build:wasm` completes
- **THEN** the wasm was compiled with `-O3` and the C code was built with
  `NDEBUG`

#### Scenario: LTO decision is recorded
- **WHEN** the release link flags are chosen
- **THEN** `-flto` is either enabled after a successful build-and-load check or
  rejected with the measured reason recorded in the change notes

#### Scenario: Artifact behavior is unchanged
- **WHEN** the optimised artifact is loaded through `createLightmapperModule`
- **THEN** the exports, capability probe and separate-asset layout behave as
  specified

### Requirement: Debug build flavour
The repository SHALL provide a separate debug build path that keeps assertions
enabled and does not overwrite the release artifact.

#### Scenario: Debug build keeps assertions
- **WHEN** `configure:wasm:debug` and `build:wasm:debug` run
- **THEN** `build/wasm-debug` contains an artifact built without `NDEBUG`

#### Scenario: Release artifact is preserved
- **WHEN** the debug build runs after a release build
- **THEN** `build/wasm` and its release artifact are unchanged

#### Scenario: Both flavours are documented
- **WHEN** a maintainer reads `README.md` or `WASM_SETUP.md`
- **THEN** the release and debug commands, their build directories and their
  intended use are described

### Requirement: Pinned Emscripten toolchain
The configure and build steps SHALL reject an `emcc` whose version is not
exactly 3.1.64 and SHALL fail with a clear message before producing an artifact.

#### Scenario: Matching toolchain proceeds
- **WHEN** `emcc` reports version 3.1.64
- **THEN** configure and build proceed

#### Scenario: Mismatched toolchain fails early
- **WHEN** `emcc` reports any other version
- **THEN** the step exits non-zero and names the expected and actual versions
  before compiling

#### Scenario: Check applies locally and in CI
- **WHEN** `configure:wasm` or `build:wasm` runs, locally or in CI
- **THEN** the same version check runs

#### Scenario: CI installs the pinned version
- **WHEN** the publish workflow installs Emscripten
- **THEN** it requests 3.1.64 rather than `latest`

### Requirement: Artifact size and digest report
The build SHALL provide a report that digests the emitted `.wasm` asset and
prints its byte size, SHA-256 and the glue `.mjs` size for the default
flavour, and reports the embedded-wasm size for the single-file flavour when
that flavour is built.

#### Scenario: Report describes the default artifact
- **WHEN** the report runs after `build:wasm`
- **THEN** it prints the `.wasm` byte count and SHA-256 matching the emitted
  `lightmapper_wasm.wasm`, plus the `.mjs` byte size

#### Scenario: Report describes the single-file artifact
- **WHEN** the report runs after the single-file flavour is built
- **THEN** it prints that flavour's embedded-wasm byte count and its `.mjs`
  size, and no separate `.wasm` is reported for it

#### Scenario: Baseline and release sizes are recorded
- **WHEN** the change is verified
- **THEN** the pre-change embedded-wasm baseline (44,136 bytes optimised) and
  the separate-asset measurements are recorded

#### Scenario: Digest is reproducible
- **WHEN** the same toolchain rebuilds the same source
- **THEN** the reported wasm digest is identical

### Requirement: Honest WebGL2 link flags
The Emscripten target SHALL select WebGL2 through `MIN_WEBGL_VERSION=2` and
`MAX_WEBGL_VERSION=2` and SHALL NOT pass the deprecated `-sUSE_WEBGL2=1` flag.

#### Scenario: Single WebGL2 selector
- **WHEN** `wasm/CMakeLists.txt` is inspected
- **THEN** only `MIN_WEBGL_VERSION=2` and `MAX_WEBGL_VERSION=2` select WebGL2

#### Scenario: WebGL2-only artifact
- **WHEN** the module is instantiated
- **THEN** WebGL2 is the only context version requested

### Requirement: Separate wasm artifact by default
The default release build SHALL NOT embed the wasm in the JavaScript output:
it SHALL emit the Emscripten glue as `lightmapper_wasm.mjs` beside a separate
`lightmapper_wasm.wasm` binary.

#### Scenario: Build output layout
- **WHEN** `build:wasm` completes with default settings
- **THEN** `build/wasm/wasm/lightmapper_wasm.mjs` and
  `build/wasm/wasm/lightmapper_wasm.wasm` both exist and the glue contains no
  base64 wasm data URI

#### Scenario: Asset loads from its own file
- **WHEN** the generated factory is invoked in a browser without supplied
  bytes
- **THEN** the module instantiates from the separate `.wasm` asset

### Requirement: Optional single-file flavour
The repository SHALL provide an explicitly selected single-file build flavour
that embeds the wasm as a base64 data URI in one `.mjs`, and the default build
SHALL NOT produce that layout.

#### Scenario: Opt-in single-file build
- **WHEN** the single-file flavour is configured and built
- **THEN** its output is one `.mjs` with the wasm embedded and no `.wasm` is
  emitted for that flavour

#### Scenario: Flavour documentation is honest
- **WHEN** the build documentation describes a flavour
- **THEN** it does not claim a separate `.wasm` for the single-file flavour or
  an embedded binary for the default flavour
