# Implementation notes — harden-webgl2-readback

## Upstream change

- Repository: `mode777/lightmapper`
- Commit: `3013f2d` — “Harden WebGL2 readback and reuse staging resources”
- Pushed to `origin/master` (`5326e7c..3013f2d`).
- Header SHA-256:
  `d4190924533e494bf8ac9c1367c43e6ea4a7357ca065cb87d6e160e23ebd93bb`.
- The change adds the cached readback framebuffer and staging buffer to
  `lm_context.hemisphere.storage`, checks framebuffer completeness explicitly,
  restores the read and draw framebuffer bindings separately, reads only the
  written rows (clamped to the lightmap height), and deletes the storage
  texture once in `lmDestroy`. The desktop `#else` branch still uses
  `glGetTexImage` and only shares the cached buffer allocation.

## Readback probe

`npm run test:readback` (with `CHROME_SHELL_PATH` and ANGLE SwiftShader).

**Before the fix (pin `5326e7c`):**

- Multi-pass: `readbackHeights=[64,64,64,64,64,64,64]`,
  `creates=7`, `deletes=7`; the transfer read the full lightmap height, a
  framebuffer was created/deleted per pass, and the distinct read/draw
  sentinels were not restored.
- Forced incomplete framebuffer: the bake aborted on
  `assert(glCheckFramebufferStatus(...) == GL_FRAMEBUFFER_COMPLETE)` at
  `lightmapper.h:725`.

**After the fix:**

- Multi-pass: `readbackHeights=[16,16,16,16,16,16,16]`, `creates=1`,
  `deletes=0`; distinct read/draw bindings and the read buffer were restored
  after every readback.
- Forced incomplete framebuffer: logged
  `Lightmapper: readback framebuffer is incomplete (status 0x8CD6);
  skipping lightmap readback`, the bake completed, and a subsequent bake
  succeeded.
- Destroy completed with no GL errors.

**Oversized-row clamp:** built a temporary `-DNDEBUG` wasm flavor in
`build/wasm-noassert` (not shipped) with:

```sh
emcmake cmake -S . -B build/wasm-noassert -DLM_BUILD_WASM=ON -DCMAKE_C_FLAGS=-DNDEBUG
cmake --build build/wasm-noassert --config Release
```

and ran the probe with
`READBACK_PROBE_MODE=full-height READBACK_PROBE_MODULE=/build/wasm-noassert/wasm/lightmapper_wasm.mjs`.
With the clamp the probe recorded `readbackHeights=[64]` and passed. With the
clamp temporarily removed (and the result-loop bound kept in range for the
diagnostic) it recorded `readbackHeights=[80]` and failed
`transferWithinLightmap`, confirming the clamp is what keeps the transfer
inside the lightmap.

## Desktop verification

- Built `thirdparty/lightmapper/example` with CMake/Release on the
  verification server; GLFW is bundled.
- Ran under `Xvfb` with `LIBGL_ALWAYS_SOFTWARE=1` (llvmpipe) and sent SPACE
  with an XTEST helper.
- The bake progressed through `0.00%` … `58.28%` with no shader compile or GL
  errors before the run was stopped. The desktop path still uses
  `glGetTexImage`; the only shared change is the cached CPU buffer.

## Wrapper build and demo

- Toolchain: Emscripten `3.1.64`
  (`a1fe3902bf73a3802eae0357d273d0e37ea79898`).
- `npm ci`, `configure:wasm`, `build:wasm`, `build:dist` and `typecheck`
  passed. Artifact layout is unchanged: `dist/index.js` and `dist/index.d.ts`,
  no separate `.wasm`.
- `npm run test:shader`: 64/64 output texels passed.
- Packaged entry: `READBACK_PROBE_MODE=packaged READBACK_PROBE_ENTRY=dist
  node test/readback-state.mjs` loaded `dist/index.js`, baked and destroyed
  the context successfully.
- `npm pack --dry-run --json` lists `LICENSE`, `LIGHTMAPPER.md`, `README.md`,
  `WASM_SETUP.md`, `dist/index.d.ts`, `dist/index.js` and `package.json`; no
  `.wasm`.

## Demo smoke bake

Headless Chrome/ANGLE SwiftShader with the gazebo scene (`730 triangles`,
`1 bounce`), status `Finished baking 730 triangles (1 bounce).` after 37.2s.

Grayscale statistics for the 1024×768 capture:

- `evidence/demo-before.png`: min 0, max 195, unique 14, mean 141.48.
- `evidence/demo-after.png`: min 34, max 195, unique 131, mean 161.48.

The baked frame is finite, has no black pixels, and has visibly more tonal
variation than the unlit frame; no bake failure or WebGL error was reported.

## Documentation review

- `README.md` and `WASM_SETUP.md` describe the `EXT_color_buffer_float` /
  RGBA32F capability probe, which is unchanged; no readback allocation or
  assertion claim needed updating.
- `LIGHTMAPPER.md` documents the bake loop and framebuffer ownership, which is
  unchanged; no stale readback-internals claim was found.
- `docs/decisions.md`: AD-011 moved to Accepted and AD-014 added as Accepted.
  AD-002, AD-003 and AD-004 are preserved.
- `docs/wasm-improvements.md`: F2, F9 and the duplicate-delete part of F14 are
  marked fixed; roadmap row 2 and section 7.2 record `3013f2d` and the probe.

## Final clean-checkout verification

Fresh tree with no `build/`, `dist/` or `node_modules/`, and
`thirdparty/lightmapper` cloned fresh from
`https://github.com/mode777/lightmapper.git` at
`3013f2d0d8107d928d16f9d778666dc249eaa419`.

- `npm ci`, `configure:wasm`, `build:wasm`, `build:dist`, `typecheck`: all
  exited 0.
- `npm run test:shader`: 64/64 output texels passed.
- `npm run test:readback`: all multi-pass scenarios passed;
  `readbackHeights=[16,16,16,16,16,16,16]`, `creates=1`, `deletes=0`.
- Packaged entry mode: `dist/index.js` loaded and baked successfully.
- `npx @fission-ai/openspec@latest validate --all --strict`: zero errors and
  warnings.

