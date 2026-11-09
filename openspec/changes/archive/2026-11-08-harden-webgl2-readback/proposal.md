# Proposal

## Why

The ES readback path is the weakest link in a WebGL2 bake. An
`assert(glCheckFramebufferStatus(...))` aborts assertion-enabled builds and
disappears under `NDEBUG`; the code saves only the combined framebuffer binding,
so a distinct read framebuffer is clobbered; a readback framebuffer is created
and deleted on every flush; and a lightmap-sized CPU buffer is calloc'd and the
full storage texture transferred on every flush. For a 2048² lightmap that is
roughly 64 MB of allocation plus a full-texture GPU read per pass (findings F2
and F9 in `docs/wasm-improvements.md`). This is roadmap change 2 and the next
step because non-corrupting, failure-tolerant readback is a precondition for
the release build, separate asset and golden-verification work that follows.

## What Changes

- `[lightmapper]` Replace the readback framebuffer-completeness assert with an
  explicit status check that reports a clear error, skips the transfer for that
  pass and leaves the context usable. No public error API is added.
- `[lightmapper]` Save and restore `GL_READ_FRAMEBUFFER_BINDING`,
  `GL_DRAW_FRAMEBUFFER_BINDING` and `GL_READ_BUFFER` separately, restoring the
  read buffer after the read framebuffer.
- `[lightmapper]` Cache the readback FBO (ES path) and the CPU readback buffer
  in `lm_context`; allocate them once and grow the buffer only when a larger
  target lightmap is set.
- `[lightmapper]` Transfer only the rows that contain written hemisphere
  batches (`min(writePosition.y + fbHemiCountY, lightmap.height)`) and clamp the
  result loop to the same bound.
- `[lightmapper]` Delete `hemisphere.storage.texture` once in `lmDestroy` and
  release the cached readback resources there.
- `[lightmapper-wasm]` Add a focused headless WebGL2 readback probe covering
  binding restoration, resource reuse and the non-fatal failure path, then bump
  the submodule to the upstream commit and re-run the shader probe, wasm build,
  `build:dist`, `typecheck` and the demo smoke bake.
- Update `docs/decisions.md` and `docs/wasm-improvements.md`: accept AD-011,
  record the failure-reporting decision, and mark F2, F9 and the duplicate
  `storage.texture` deletion in F14 as fixed.

No JavaScript API, loader, build-layout, packaging or npm behavior changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `c-library-port`: sharpen the readback state-preservation requirement and add
  requirements for non-fatal readback failure, reusable readback resources,
  bounded transfer and deterministic teardown.

## Impact

- Upstream C: `thirdparty/lightmapper/lightmapper.h`
  (`lm_writeResultsToLightmap`, the `hemisphere.storage` fields in
  `lm_context`, `lmDestroy`). Owned by `mode777/lightmapper`; work items are
  tagged `[lightmapper]`.
- This repository: submodule pointer, a focused readback probe under `test/`,
  `docs/decisions.md` and `docs/wasm-improvements.md`.
- ADR footprint: implements AD-011 (Proposed → Accepted) and adds AD-014
  (Proposed → Accepted when implemented) for non-fatal, stderr-reported
  readback failure. Preserves AD-002 (desktop `glGetTexImage` path unchanged),
  AD-003 (WebGL2/GLES3 only) and AD-004 (upstream C ownership). No ADR is
  superseded.
- No change to `createLightmapperModule`, the public JS API, the C shim, the
  wasm artifact layout or desktop rendering.

## Out of Scope

- A public readback error API on `lm_context` or the JS wrapper; surfacing
  runtime errors to JavaScript belongs to `typed-wasm-api` (change 8).
- The batch-flush bounds assert and `assert`-based parameter validation outside
  `lm_writeResultsToLightmap`; they remain separate validation work (F14,
  change 9).
- GLES3 capability detection (change 3 `portable-gles3-path`), the optimized
  release build (change 4), the separate `.wasm` loader (change 5), worker
  support (change 6), the full smoke/golden/package-consumer suite (change 7)
  and release documentation (change 9).
- Node rendering, native GL builds, npm publishing mechanics and C-side
  rendering behavior outside readback.
