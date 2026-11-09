# Proposal

## Why

The upstream GLES3 shader and readback paths are selected with
`#if defined(__EMSCRIPTEN__)`, so any GLES3 build that is not compiled by
Emscripten — native Android, other wasm runtimes, or a native EGL verification
harness — still gets the desktop `#version 150 core` shaders and
`glGetTexImage` readback. Those are invalid on a GLES3 context. This is finding
F3 in `docs/wasm-improvements.md` and roadmap change 3; it also blocks a native
GLES3 regression check that does not depend on the browser toolchain. Changes 1
and 2 made the ES shader and readback correct but left them reachable only
through `__EMSCRIPTEN__`, so this is the next dependency for the release and
verification work.

## What Changes

- `[lightmapper]` Replace the three `#if defined(__EMSCRIPTEN__)` path
  selections in `lightmapper.h` — the final readback and both shader pairs —
  with one `LM_GLES3` capability macro. Auto-detect it from
  `GL_ES_VERSION_3_0`, which GLES3 headers (including Emscripten's) define,
  and allow an explicit `LM_GLES3` 0/1 override for consumers that know their
  target.
- `[lightmapper]` Keep `__EMSCRIPTEN__` only for Emscripten-specific
  integration; after this change no GLSL or readback path is selected by the
  compiler identity.
- `[lightmapper]` Document the `EXT_color_buffer_float` requirement next to the
  ES readback path and in the upstream README, because the FBO readback relies
  on RGBA32F render targets and float readback.
- `[lightmapper]` Add a native GLES3 verification that compiles the header
  against GLES3 headers without `__EMSCRIPTEN__`, creates an EGL surfaceless
  context on Mesa/llvmpipe, and runs a small bake through `lmCreate`/`lmBegin`/
  `lmEnd` to prove the ES shaders and FBO readback are selected and work. Keep
  the desktop GL 3.2 example build and run as the AD-002 regression check.
- `[lightmapper-wasm]` Update `test/first-pass-sampling.mjs` so it extracts the
  ES first-pass shaders using the new selector instead of the literal
  `#if defined(__EMSCRIPTEN__)` marker, and still fails loudly if the selector
  or ES branch is missing.
- `[lightmapper-wasm]` Bump the `thirdparty/lightmapper` submodule to the
  upstream commit and re-run the shader probe, readback probe, Emscripten build,
  `build:dist`, `typecheck` and a headless smoke bake.
- Update `docs/decisions.md` and `docs/wasm-improvements.md`: accept AD-007
  with the clarified auto-detection/override semantics, mark F3 fixed, set
  roadmap change 3 to Implemented and record the upstream SHA and native
  verification command.

No JavaScript API, loader, wasm artifact layout, packaging or npm behavior
changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `c-library-port`: sharpen **Portable GLES3 detection** with explicit
  auto-detection and `LM_GLES3` override scenarios, an Emscripten-still-selects-
  ES scenario and a desktop-still-selects-desktop scenario, and make clear that
  path selection must not depend on `__EMSCRIPTEN__`.

## Impact

- Upstream C: `thirdparty/lightmapper/lightmapper.h` (three selector sites),
  plus upstream build/verification files for the native GLES3 and desktop
  checks. Owned by `mode777/lightmapper`; work items are tagged
  `[lightmapper]`.
- This repository: `thirdparty/lightmapper` pointer,
  `test/first-pass-sampling.mjs` selector extraction, and
  `docs/decisions.md` / `docs/wasm-improvements.md`.
- ADR footprint: implements AD-007 (Proposed → Accepted) and refines its
  detection/override wording. Preserves AD-002 (desktop GL 3.2 path), AD-003
  (WebGL2/GLES3 only, `EXT_color_buffer_float` required), AD-004 (upstream C
  ownership) and AD-005 (public entry and context binding). No ADR is
  superseded and no new ADR is added.
- No change to `createLightmapperModule`, the public C or JS API, the C shim,
  the wasm artifact layout, the package entry or desktop rendering behavior.
- `EXT_color_buffer_float` remains a documented requirement; this change does
  not add a fallback or a new capability check.

## Out of Scope

- Node rendering, native desktop/GL product support and npm publishing
  mechanics. The native GLES3 harness is verification only, not a supported
  runtime target.
- Changing shader math, readback state handling, readback bounds or resource
  caching; the change 1 and change 2 behavior stays as implemented.
- The optimized release build and pinned toolchain enforcement (change 4), the
  separate `.wasm` loader (change 5), worker support (change 6), the full
  smoke/golden/package-consumer suite (change 7), generated types and error API
  (change 8) and release documentation (change 9).
- Adding public C API, changing `lm_context` layout, or supporting WebGL1.
- C-side rendering behavior not related to GLES3 path selection.
