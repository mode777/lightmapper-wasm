# Design

## Context

See `proposal.md` for motivation. The relevant code is
`thirdparty/lightmapper/lightmapper.h`:

- `lm_writeResultsToLightmap` (~line 709) allocates
  `lightmap.width * lightmap.height * 4` floats with `LM_CALLOC` on every
  invocation, and on the ES path creates a framebuffer, asserts
  completeness, reads the full storage texture and deletes the framebuffer.
- `lm_context.hemisphere.storage` (~line 354) already holds the storage
  texture, the write position and the position map, so cached readback state
  belongs there.
- `lmDestroy` (~line 1416) resets bindings and frees GL objects; it deletes
  `hemisphere.storage.texture` twice.
- `lmSetTargetLightmap` (~line 1493) re-specifies the storage texture and
  reallocates the position map, so the readback cache must tolerate target
  changes.

Constraints: the header is an upstream submodule (AD-004); the desktop GL 3.2
`glGetTexImage` path must not change (AD-002); WebGL2/GLES3 is the only wasm
target (AD-003); `createLightmapperModule` and the C-shaped API stay as they
are (AD-005). There is no full rendering suite yet (finding F6); change 7
(`wasm-verification`) owns the golden/package harness. This change adds only
the focused probe it needs.

## Goals / Non-Goals

**Goals:**

- Make readback failure non-fatal, diagnosable and state-consistent.
- Preserve caller GL state across readback, including distinct read and draw
  framebuffer bindings and the read buffer.
- Reuse one readback FBO and one CPU buffer per context; transfer only written
  rows.
- Consume the upstream fix with a minimal submodule bump and prove the
  behavior headlessly.
- Keep the desktop `glGetTexImage` behavior and all public wrapper behavior
  unchanged.

**Non-Goals:**

- Adding a public error accessor or JS error surface (AD-014 records the
  decision; change 8 owns the JS error API).
- Fixing the batch-flush bounds assert or other `assert`-based validation
  outside `lm_writeResultsToLightmap`.
- Shader sampling (change 1, already fixed), GLES3 capability detection
  (change 3), release build (change 4), loader (change 5), workers (change 6),
  the full golden suite (change 7) or release docs (change 9).

## Decisions

### D1 — Report failure on stderr and skip the transfer

`lm_writeResultsToLightmap` will check `glCheckFramebufferStatus` explicitly.
When the status is not `GL_FRAMEBUFFER_COMPLETE` it will print one clear
message to stderr (status in hex), skip the `glReadPixels`, still reset the
write position and clear the position-map rows that the pass consumed, and
return. The bake continues; no `assert`, no abort, no partially updated
context.

This matches the existing failure style in `lmCreate` (stderr plus a defined
return) and keeps the public API unchanged (AD-005). `lm_writeResultsToLightmap`
is internal and `lmBegin` keeps its existing signature. Surfacing the failure
to JavaScript would require a new API and is deferred to `typed-wasm-api`
(change 8); AD-014 records this choice.

*Alternative considered:* return a status from `lmBegin`, or add
`lmGetLastError`. Rejected: both expand the C-shaped API and the JS surface for
a failure the wrapper cannot currently act on, and they would require their own
ADR and migration.

### D2 — Cache the readback FBO and scratch buffer in `lm_context`

Add to `lm_context.hemisphere.storage`:

- `GLuint readbackFramebuffer` — created lazily on the first ES readback,
  attached to `storage.texture`, deleted in `lmDestroy`.
- `float *readbackBuffer` and `size_t readbackBufferCount` — the CPU staging
  buffer, counted in floats.

The buffer is grown only when `lightmap.width * lightmap.height * 4` exceeds
the current capacity; it is never shrunk. `lmSetTargetLightmap` may make the
storage texture larger, so the next readback grows the buffer once and reuses
it. The FBO attaches the storage texture when it is created; because the
texture object is generated once and only re-specified by later
`lmSetTargetLightmap` calls, the attachment remains valid — the readback still
re-attaches defensively after a target change and re-checks completeness each
time. The desktop path keeps `glGetTexImage` but reuses the same cached CPU
buffer.

*Alternative considered:* allocate `width * rows * 4` floats per readback.
Rejected: the row count grows across passes, so it would reallocate on most
passes and keep the F9 churn. A full-size grow-only buffer costs one allocation
per context size and removes per-pass allocation.

### D3 — Restore read and draw bindings separately, in order

`GL_FRAMEBUFFER_BINDING` is the draw alias and is not enough when the caller
uses separate read/draw bindings. The readback will:

1. capture `GL_READ_FRAMEBUFFER_BINDING`, `GL_DRAW_FRAMEBUFFER_BINDING` and
   `GL_READ_BUFFER`;
2. bind the readback FBO with `GL_FRAMEBUFFER` and attach/check the storage
   texture;
3. `glReadBuffer(GL_COLOR_ATTACHMENT0)` and `glReadPixels`;
4. restore `GL_READ_FRAMEBUFFER` and `GL_DRAW_FRAMEBUFFER` from the captured
   values, then `glReadBuffer(prevReadBuffer)`.

The read buffer is per-framebuffer state, so it must be restored after the
caller's read framebuffer is bound again. The same restoration runs on the
failure path, which is structured as a single exit path so an early skip
cannot leave the readback FBO bound.

### D4 — Transfer only written rows and clamp to the lightmap

The storage texture is written from row 0 upward and the whole written range is
consumed by the result loop, so the transfer starts at row 0 regardless of the
current `writePosition.x`. Compute:

```c
int rowsToRead = ctx->hemisphere.storage.writePosition.y
               + (int)ctx->hemisphere.fbHemiCountY;
if (rowsToRead > ctx->lightmap.height)
    rowsToRead = ctx->lightmap.height;
```

Use `rowsToRead` for the `glReadPixels` height and for the result-loop bound.
`writePosition` can exceed the lightmap height for a final partial batch; the
clamp keeps both the transfer and the `toLightmapLocation` indexing inside the
target. The buffer layout (`y * lightmap.width + x`) is unchanged, so only the
row count shrinks.

*Alternative considered:* read from `writePosition.y - fbHemiCountY` upward
only. Rejected: the result loop rewrites the whole written range and the
position map is only valid within the rows written in this pass, so starting at
row 0 is both simpler and correct.

### D5 — Verify with an instrumented headless WebGL2 bake

Add `test/readback-state.mjs` and a `test:readback` script, reusing the
`chrome-headless-shell` + ANGLE SwiftShader pattern from
`test/first-pass-sampling.mjs`. Because the test imports the wrapper and the
compiled module, the driver serves the workspace from a small Node HTTP server
rather than using `file://` (Chrome blocks module imports from file URLs). The
page:

- creates a WebGL2 context, checks `EXT_color_buffer_float` and creates a small
  two-triangle scene with a 64×64 lightmap and 32-texel hemispheres (16×16
  batches), using `src/index.js` plus the explicitly loaded compiled module so
  it can reach the Emscripten GL object registry; the packaged `dist/index.js`
  entry is exercised separately by the packaged mode and the package task;
- runs a multi-pass bake (`interpolationPasses` > 0) so readback runs more than
  once;
- interposes `createFramebuffer`, `deleteFramebuffer`, `bindFramebuffer`,
  `readPixels`, `readBuffer` and `getParameter` on the context, which
  Emscripten calls dynamically through `GLctx`. It asserts:
  - no framebuffer is created or deleted between readbacks (resource reuse);
  - each `glReadPixels` height is the written-row bound rather than the full
    lightmap height (the F9 reduction), and never exceeds the lightmap height;
  - a temporary `-DNDEBUG` build of the probe runs a full-height one-pass bake
    with assertions disabled and confirms the bound is clamped to the lightmap
    height (without the clamp the recorded height exceeds it);
  - the restore sequence after each `readPixels` binds the captured read and
    draw framebuffers separately and reselects the captured read buffer; by
    answering the capture queries with distinct sentinel FBOs and a
    non-default read buffer, the probe exercises the distinct-binding case
    that a normal bake cannot expose;
  - after `lmCreate`, forcing `checkFramebufferStatus` to return
    `FRAMEBUFFER_INCOMPLETE_ATTACHMENT` makes the bake complete without
    aborting and emits one stderr/console error, and the context still
    produces a valid (if incomplete) result.
- The probe fails against the current pin with the expected full-height
  transfer, allocation churn or combined-binding restore, and passes after the
  upstream fix.

*Alternative considered:* a native GLES3 EGL contract test upstream. Deferred:
the ES path is currently selected by `__EMSCRIPTEN__` (change 3 makes it
portable), and the browser probe exercises the actual wasm artifact. If the
interposition proves unreliable, the fallback is a focused upstream Emscripten
test module; that decision does not change the behavior contract.

The upstream desktop path is checked separately by building and running the
existing example under Xvfb/llvmpipe and confirming the bake still progresses
with no shader or GL errors.

### D6 — Consume upstream with a minimal submodule bump; update ADRs

The upstream `[lightmapper]` repository implements and lands the change
including the desktop check. This repository then bumps
`thirdparty/lightmapper` to the smallest commit containing it, reviews the
submodule diff and re-runs the probe, shader probe, wasm build and smoke bake.

`docs/decisions.md` gets AD-014 ("Readback failures are non-fatal and reported
on stderr") as Proposed, and AD-011 moves from Proposed to Accepted once the
implementation and verification land. `docs/wasm-improvements.md` marks F2,
F9 and the duplicate `storage.texture` deletion from F14 as fixed, updates the
roadmap row for change 2, and records the upstream SHA and probe command. No
other ADR changes.

## Verification

Run without a physical GPU:

1. **Readback probe:** `npm run test:readback` with `CHROME_SHELL_PATH` pointing
   at `chrome-headless-shell`.
   - Multiple readbacks reuse one FBO and one CPU buffer.
   - Distinct read/draw bindings and the read buffer are restored.
   - Each transfer covers the written rows, not the full lightmap height; a
     temporary `-DNDEBUG` full-height run is clamped to the lightmap height.
   - Forced incomplete FBO logs and does not abort; the bake completes.
   - The probe fails against the previous pin and passes against the upstream
     fix.
2. **Shader regression:** `npm run test:shader` still passes 64/64 output
   texels.
3. **Upstream desktop check:** build and run the upstream example under
   Xvfb/llvmpipe; confirm the `glGetTexImage` path still bakes without shader or
   GL errors and that only the shared buffer allocation changed.
4. **Wrapper build:** `npm run configure:wasm`, `npm run build:wasm`,
   `npm run build:dist`, `npm run typecheck` with Emscripten 3.1.64; confirm
   `dist/index.js` and `dist/index.d.ts` exist and there is still no separate
   `.wasm`.
5. **Wasm smoke bake:** run the browser demo in headless Chrome/ANGLE
   SwiftShader with the asymmetric reference scene; confirm the bake completes
   with finite, non-uniform lighting and no new GL errors.
6. **Validator:** `npx @fission-ai/openspec@latest validate --all --strict`.

## Risks / Trade-offs

- **Interposing Emscripten's `GLctx` methods is brittle** → the probe fails
  loudly if a call is not observed; the fallback is a focused Emscripten test
  module. The behavior contract does not depend on the interposition.
- **The grow-only buffer raises steady-state memory** → one lightmap-sized
  buffer stays allocated until `lmDestroy`; this replaces a per-pass
  allocation/free cycle and removes the large churn described in F9. The
  trade-off is accepted.
- **The read buffer is per-framebuffer state** → restoring it before binding
  the caller's read framebuffer would target the wrong framebuffer; the
  ordering in D3 is part of the probe.
- **A failed readback still leaves missing rows** → the error is visible on
  stderr and the context remains usable; surfacing it to JS is left to the
  typed API change so this change does not expand the public surface.
- **A submodule bump can pull unrelated commits** → pin the smallest upstream
  commit containing the fix, review the header diff and re-run all checks after
  the bump.
- **Desktop behavior could regress through the shared buffer path** → keep
  `glGetTexImage` untouched and verify the example under Xvfb/llvmpipe.

## Migration Plan

There is no API or data migration. Behavior changes only when a readback
framebuffer is incomplete: the bake logs and continues instead of aborting.
Rollback is a revert of the submodule pointer and the probe. Consumers see
corrected state handling and lower readback churn after the next package
release.
