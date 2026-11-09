# Proposal

## Why

The current release build is unoptimised. `configure:wasm` never sets
`CMAKE_BUILD_TYPE`, and `build:wasm` passes `--config Release` to a
single-config generator, so the artifact is compiled with no `-O3` and no
`-DNDEBUG`. The embedded wasm is 98,112 bytes; a measured `-O3 -flto` rebuild
of the same shim is 44,279 bytes (~55% smaller). The same release path also
accepts any Emscripten version (CI installs `latest`), reports no artifact
digest and carries a non-canonical submodule URL. This is roadmap change 4
and a prerequisite for the separate-asset loader, worker support and
verification work that follows (findings F4, F6 and F13).

## What Changes

- Make the release build the default: `configure:wasm` configures
  `build/wasm` with `CMAKE_BUILD_TYPE=Release`, and the build compiles with
  `-O3` and defines `NDEBUG`.
- Add an explicit debug flavour (`configure:wasm:debug`/`build:wasm:debug`)
  in a separate build directory with assertions enabled, and document both
  flavours.
- Evaluate and adopt `-flto` for the release link if it builds and loads
  correctly; record the resulting size either way.
- Add a toolchain check that rejects an `emcc` other than 3.1.64 and wire it
  into the configure/build scripts; pin `setup-emsdk` in CI to 3.1.64.
- Add an artifact report that extracts the embedded wasm from the generated
  `.mjs`, prints its byte size, SHA-256 and the `.mjs` size, and record the
  before/after measurements in the change notes.
- Remove the redundant/deprecated `-sUSE_WEBGL2=1` link flag; keep
  `MIN_WEBGL_VERSION=2`/`MAX_WEBGL_VERSION=2` as the single WebGL2 selector.
- Change the submodule URL to the canonical
  `https://github.com/mode777/lightmapper.git` without changing the pinned
  commit.
- Update `README.md` and `WASM_SETUP.md` so the documented build path is the
  release default and the manual `-DCMAKE_BUILD_TYPE=Release` workaround is
  gone; update `docs/decisions.md` (AD-008 Proposed → Accepted) and
  `docs/wasm-improvements.md` (F4 fixed, F13 partially fixed, roadmap row 4
  Implemented).

No JavaScript API, loader, dist layout or C-side rendering behavior changes.
The build still emits one `lightmapper_wasm.mjs` with the wasm embedded as a
base64 data URI.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wasm-build-pipeline`: add requirements for a reproducible optimised release
  build, an explicit debug flavour, a pinned and enforced Emscripten
  toolchain, and artifact size/digest reporting; keep the existing single-file
  artifact and dist-assembly requirements.

## Impact

- This repository only. Upstream C is not touched; no `[lightmapper]` tasks.
- Files: `wasm/CMakeLists.txt`, `package.json`, `.github/workflows/publish.yml`,
  `.gitmodules`, `README.md`, `WASM_SETUP.md`, `docs/decisions.md`,
  `docs/wasm-improvements.md`, and two small Node scripts under `scripts/`
  (toolchain check and artifact report).
- ADR footprint: implements AD-008 (Proposed → Accepted). The change sharpens
  its enforcement from a major/minor comparison to an exact 3.1.64 check and
  records that wording in the ADR. Supports AD-004 (repo ownership) and
  preserves AD-002, AD-003, AD-005 and AD-006. No ADR is superseded.
- Artifact impact: the embedded wasm is expected to shrink from 98,112 bytes
  to roughly 44 KB; the `.mjs` and `dist/index.js` shrink accordingly. The
  single-file layout, `createLightmapperModule`, the C shim exports and the
  package `files` list are unchanged.
- Verification impact: `npm run test:shader`, `npm run test:readback`,
  `build:dist`, `typecheck` and the headless demo bake must still pass on the
  release artifact; the debug flavour is verified by building it and checking
  that assertions are present.

## Out of Scope

- A separate `dist/lightmapper.wasm` asset, loader changes, `wasmBinary` /
  `locateWasm` options or bundler-consumer tests (change 5
  `separate-wasm-loader`).
- Worker/`OffscreenCanvas` support (change 6) and the full smoke, golden,
  capability-failure and packaged-consumer suite (change 7).
- Generated TypeScript declarations, a public error class or lifecycle changes
  (change 8), and the CHANGELOG/tag/release gate (change 9).
- Node rendering, native GL support, npm publishing mechanics and any upstream
  C rendering behavior.
- Upstream tags/changelog for the C fork; F13 remains partially open for that
  item.
