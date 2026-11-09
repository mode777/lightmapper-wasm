# Spec Delta

## ADDED Requirements

### Requirement: Optimised release build
The default `configure:wasm`/`build:wasm` path SHALL configure a Release build compiled with `-O3` and `NDEBUG`, while keeping the single-file artifact layout and the public API unchanged.

#### Scenario: Default configure selects Release
- **WHEN** `configure:wasm` runs without an explicit build type
- **THEN** CMake configures `build/wasm` with `CMAKE_BUILD_TYPE=Release`

#### Scenario: Release compilation is optimised
- **WHEN** `build:wasm` completes
- **THEN** the wasm was compiled with `-O3` and the C code was built with `NDEBUG`

#### Scenario: LTO decision is recorded
- **WHEN** the release link flags are chosen
- **THEN** `-flto` is either enabled after a successful build-and-load check or rejected with the measured reason recorded in the change notes

#### Scenario: Artifact behavior is unchanged
- **WHEN** the optimised artifact is loaded through `createLightmapperModule`
- **THEN** the exports, capability probe and single-file layout behave as before

### Requirement: Debug build flavour
The repository SHALL provide a separate debug build path that keeps assertions enabled and does not overwrite the release artifact.

#### Scenario: Debug build keeps assertions
- **WHEN** `configure:wasm:debug` and `build:wasm:debug` run
- **THEN** `build/wasm-debug` contains an artifact built without `NDEBUG`

#### Scenario: Release artifact is preserved
- **WHEN** the debug build runs after a release build
- **THEN** `build/wasm` and its release artifact are unchanged

#### Scenario: Both flavours are documented
- **WHEN** a maintainer reads `README.md` or `WASM_SETUP.md`
- **THEN** the release and debug commands, their build directories and their intended use are described

### Requirement: Pinned Emscripten toolchain
The configure and build steps SHALL reject an `emcc` whose version is not exactly 3.1.64 and SHALL fail with a clear message before producing an artifact.

#### Scenario: Matching toolchain proceeds
- **WHEN** `emcc` reports version 3.1.64
- **THEN** configure and build proceed

#### Scenario: Mismatched toolchain fails early
- **WHEN** `emcc` reports any other version
- **THEN** the step exits non-zero and names the expected and actual versions before compiling

#### Scenario: Check applies locally and in CI
- **WHEN** `configure:wasm` or `build:wasm` runs, locally or in CI
- **THEN** the same version check runs

#### Scenario: CI installs the pinned version
- **WHEN** the publish workflow installs Emscripten
- **THEN** it requests 3.1.64 rather than `latest`

### Requirement: Artifact size and digest report
The build SHALL provide a report that extracts the embedded wasm from the single-file module and prints its byte size, SHA-256 and the module size.

#### Scenario: Report describes the single-file artifact
- **WHEN** the report runs after `build:wasm`
- **THEN** it prints the embedded wasm byte count, its SHA-256 and the `.mjs` byte size, and emits no separate `.wasm`

#### Scenario: Baseline and release sizes are recorded
- **WHEN** the change is verified
- **THEN** the pre-change 98,112-byte embedded-wasm baseline and the release measurement are recorded

#### Scenario: Digest is reproducible
- **WHEN** the same toolchain rebuilds the same source
- **THEN** the reported wasm digest is identical

### Requirement: Honest WebGL2 link flags
The Emscripten target SHALL select WebGL2 through `MIN_WEBGL_VERSION=2` and `MAX_WEBGL_VERSION=2` and SHALL NOT pass the deprecated `-sUSE_WEBGL2=1` flag.

#### Scenario: Single WebGL2 selector
- **WHEN** `wasm/CMakeLists.txt` is inspected
- **THEN** only `MIN_WEBGL_VERSION=2` and `MAX_WEBGL_VERSION=2` select WebGL2

#### Scenario: WebGL2-only artifact
- **WHEN** the module is instantiated
- **THEN** WebGL2 is the only context version requested
