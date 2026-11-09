# Design

## Context

See `proposal.md` for motivation. The relevant code is the ES first-pass
fragment shader in `thirdparty/lightmapper/lightmapper.h` (the
`#if defined(__EMSCRIPTEN__)` branch), which currently computes:

```glsl
vec2 in_uv = gl_FragCoord.xy * vec2(6.0, 2.0) + vec2(0.5);
ivec2 h_uv = ivec2(in_uv);
ivec2 w_uv = ivec2(mod(in_uv, vec2(textureSize(weights, 0))));
```

The desktop branch is correct because `layout(pixel_center_integer)` makes
`gl_FragCoord.xy` integral at texel centers. GLES3 has no such qualifier, so
the same arithmetic produces `(6x + 3, 2y + 1)`.

Constraints: the header is an upstream submodule (AD-004); the desktop
GL 3.2 path must not change (AD-002); WebGL2/GLES3 is the only wasm target
(AD-003). There is no rendering test harness yet (finding F6); the full
smoke/golden suite is change 7 (`wasm-verification`). The current wrapper build
is unoptimised and inlines the wasm (findings F4/F5, changes 4–5) but is
sufficient for functional verification.

## Goals / Non-Goals

**Goals:**

- Make the ES first-pass shader select the exact 6×2 source block for every
  output texel, including the origin.
- Prove the fix deterministically without a physical GPU.
- Consume the upstream fix with a minimal, reviewed submodule bump.
- Keep the desktop shader and all public wrapper behavior unchanged.

**Non-Goals:**

- Restructuring the shader sources or factoring a shared prologue; that can be
  revisited in a later upstream change if duplication becomes costly.
- Readback hardening, GLES3 capability detection, release-build optimisation,
  separate wasm asset, worker support or generated types (changes 2–8).
- Building the full golden-bake/package-consumer suite (change 7); this change
  adds only the sampling regression check it needs.

## Decisions

### D1 — Change only the ES branch

Modify the `#if defined(__EMSCRIPTEN__)` first-pass shader and leave the
desktop `#version 150 core` source byte-identical. Although the same
truncation expression would be behaviorally equivalent on desktop, editing
both branches broadens the upstream regression surface for no functional gain
and makes AD-002 verification harder to attribute.

*Alternative considered:* factor the coordinate math into a shared prologue
used by both branches. Rejected for this change: it touches the desktop path
and obscures whether the wasm fix changed desktop behavior. It remains a
possible later cleanup.

### D2 — Truncate before scaling and derive the weights index from the block origin

The ES shader will compute:

```glsl
ivec2 h_uv = ivec2(gl_FragCoord.xy) * ivec2(6, 2);
ivec2 w_uv = ivec2(mod(vec2(h_uv), vec2(textureSize(weights, 0))));
```

`ivec2(gl_FragCoord.xy)` truncates the half-integer centre to the output
texel, so the base source coordinate is exactly `(6x, 2y)`. Deriving `w_uv`
from `h_uv` keeps the weights index identical to the desktop result: both
`mod(6x, 3·size)` and `mod(6x + 0.5, 3·size)` truncate to the same integer
because the modulus is integral. A comment will record the GLES3
half-integer rule next to the expression.

*Alternative considered:* subtract `0.5` from `gl_FragCoord.xy` before
scaling. Rejected: it relies on the same rounding assumptions and is less
obvious than truncating the integer texel coordinate.

### D3 — Verify with an isolated headless WebGL2 shader probe

Because F1 is invisible in a symmetric scene, the regression check will feed
the first-pass shader an asymmetric source pattern that encodes each source
texel's coordinates, render it into an RGBA32F target, and read back the
result. For output texel `(x, y)`, the expected contribution set is exactly
columns `6x..6x+5` of rows `2y` and `2y+1`; the check covers a small grid
including `(0, 0)` and a non-zero origin. Weights are a fixed pattern so any
index shift is also detectable.

The probe will:

- extract the ES first-pass vertex/fragment shader strings from the pinned
  `thirdparty/lightmapper/lightmapper.h`, failing loudly if the expected
  markers are missing;
- run in `chrome-headless-shell` with ANGLE SwiftShader
  (`CHROME_SHELL_PATH`, `--use-gl=angle --use-angle=swiftshader
  --enable-unsafe-swiftshader --no-sandbox --dump-dom`);
- write the pass/fail result and actual sample coordinates into the DOM for
  the Node driver to parse;
- require `EXT_color_buffer_float` and fail with a clear message if the
  headless context cannot provide it.

It uses no new npm dependency and no physical GPU. *Alternative considered:*
a full wasm bake golden image now. Deferred to change 7, which depends on the
release build and separate asset; a full bake at this stage adds build cost
and duplicates that change's harness.

### D4 — Consume upstream through a minimal submodule bump

`[lightmapper]` implements and verifies the header change upstream, including
building the desktop example to confirm AD-002. This repository then bumps
`thirdparty/lightmapper` to the upstream commit containing the fix, records
the SHA in the task and change notes, and re-runs the shader probe plus a
wasm smoke bake. The bump must not pull unrelated header changes; if it does,
the diff is reviewed and documented.

### D5 — No ADR change; update the roadmap

This change implements the existing AD-003 contract and preserves AD-002; it
introduces no new architectural decision. No ADR is added or superseded.
`docs/wasm-improvements.md` gets the F1 regression note and the change-1
status update. If implementation surfaces a real new decision (for example,
sharing the shader prologue), that ADR is added in the same change with the
next sequential ID.

## Verification

Run without a physical GPU:

1. **Shader probe:** `node test/first-pass-sampling.mjs` with
   `CHROME_SHELL_PATH` pointing at `chrome-headless-shell`.
   - Expected block origin `(6x, 2y)` for every probed output texel.
   - Origin texel `(0, 0)` reads `(0, 0)`, not `(3, 1)`.
   - All six horizontal columns and both source rows are included.
   - Revert-to-bug sanity check: the probe fails against the old expression.
2. **Upstream desktop check:** build and run the upstream example under
   Xvfb/llvmpipe, and diff the desktop first-pass shader block against the
   previous pin to confirm it is byte-identical.
3. **Wrapper build:** `npm run configure:wasm`, `npm run build:wasm`,
   `npm run build:dist`, `npm run typecheck` with Emscripten 3.1.64.
4. **Wasm smoke bake:** run the browser demo in headless Chrome/ANGLE
   SwiftShader with the asymmetric reference scene; confirm the bake completes
   without GL errors and produces finite, non-uniform lighting.
5. **Regression note:** record the F1 outcome and probe command in
   `docs/wasm-improvements.md`.

## Risks / Trade-offs

- **Shader-string extraction is brittle** → the probe fails loudly if the
  expected `#if defined(__EMSCRIPTEN__)` first-pass markers are absent; change
  7 replaces this with a baked golden check against the packaged artifact.
- **SwiftShader may lack float render-target support in some environments** →
  probe checks `EXT_color_buffer_float` and RGBA32F framebuffer completeness
  and reports a capability error instead of a false pass.
- **Submodule bump pulls unrelated commits** → pin the smallest upstream commit
  containing the fix and review the header diff; re-run all checks after the
  bump.
- **A source-level probe could pass while the wasm still misbehaves** → pair it
  with the headless wasm smoke bake and, in change 7, the packaged golden bake.

## Migration Plan

There is no API or data migration. The fix ships with the next package release
after the submodule bump. Rollback is a revert of the submodule pointer and the
probe; consumers see only corrected baked lighting.
