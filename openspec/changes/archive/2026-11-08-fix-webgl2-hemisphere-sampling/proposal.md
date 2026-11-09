# Proposal

## Why

The ES first-pass hemisphere shader samples the wrong source texels on WebGL2:
GLES3 `gl_FragCoord.xy` is at half-integer pixel centers, and the current
`gl_FragCoord.xy * vec2(6.0, 2.0) + vec2(0.5)` arithmetic shifts every 6×2
sample block three texels right and one row up. This is finding F1 (P0) in
`docs/wasm-improvements.md`: baked lighting in the published package is wrong,
and no current test catches it. It is the first roadmap change because the
remaining shader, readback and verification work builds on a correct sampling
base.

## What Changes

- `[lightmapper]` Fix the ES first-pass fragment shader in `lightmapper.h` so it
  truncates `gl_FragCoord.xy` to integer output coordinates before scaling:
  `ivec2 h_uv = ivec2(gl_FragCoord.xy) * ivec2(6, 2)`, with the weights
  coordinate derived from that block origin. Add a short comment documenting
  the GLES3 half-integer rule.
- `[lightmapper]` Leave the desktop `#version 150 core` first-pass shader and
  its `layout(pixel_center_integer)` behavior unchanged; the fix is scoped to
  the ES branch selected for WebGL2.
- Add a deterministic shader-sampling regression check that fails if the block
  origin is not `(6x, 2y)` for output texels including `(0, 0)`, suitable for
  change 7 (`wasm-verification`) to absorb into the full golden-bake suite.
- `[lightmapper-wasm]` Bump the `thirdparty/lightmapper` submodule to the
  upstream commit containing the fix and verify the WebGL2 build, a bake with
  an asymmetric scene under headless Chrome/ANGLE SwiftShader, and unchanged
  desktop behavior.
- Update `docs/wasm-improvements.md`: mark F1 fixed, record the regression note
  and roadmap status for change 1.

No JavaScript API, loader, build-layout or npm-packaging behavior changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `c-library-port`: sharpen the existing **Correct hemisphere sampling**
  requirement with the exact integer-truncation rule and explicit block-origin
  scenarios for the origin texel and arbitrary output texels.

## Impact

- Upstream C: `thirdparty/lightmapper/lightmapper.h`, ES first-pass shader only.
  Owned by `mode777/lightmapper` (`[lightmapper]`).
- This repository: submodule pointer, verification procedure, and the two
  planning documents.
- No change to `createLightmapperModule`, the C shim, the wasm artifact layout,
  the package entry or the desktop GL 3.2 path.
- ADR footprint: implements no new decision. It clarifies AD-003 (WebGL2/GLES3
  is the only wasm target) and must not regress AD-002 (desktop GL 3.2 path).
  No ADR is superseded and no new ADR is added.

## Out of Scope

- Readback hardening, framebuffer state preservation and FBO caching (finding
  F2/F9, change 2 `harden-webgl2-readback`).
- Selecting the GLES3 path by capability instead of `__EMSCRIPTEN__` (finding
  F3, change 3 `portable-gles3-path`).
- The optimized release build, separate `.wasm` asset or loader changes
  (changes 4–5).
- The full smoke/golden/package-consumer test harness (change 7); this change
  adds only the sampling regression check it needs to prove the fix.
- npm publishing mechanics, Node rendering, native GL builds and C-side
  rendering behavior outside the ES first-pass shader.
