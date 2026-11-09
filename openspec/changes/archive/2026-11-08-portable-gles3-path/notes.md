# Implementation notes

## Upstream

- Repository: `mode777/lightmapper`
- Commit: `c111bb8` (`Select GLES3 path by capability`)
- Pushed to `origin/master` on 2026-11-08.
- Changes: `lightmapper.h` selector, README WebGL2/GLES3 section, `test/`
  native selector and smoke harness, `.gitignore`.

## Native GLES3 verification (verification server, Mesa llvmpipe)

Command: `test/run-native.sh` in the upstream checkout.

```text
== selector checks ==
LM_GLES3=1 (expected 1)
LM_GLES3=0 (expected 0)
LM_GLES3=0 (expected 0)
LM_GLES3=1 (expected 1)
== preprocessor path checks ==
== native GLES3 smoke ==
PASS: passes=20800 nonzero=16384
PASS
```

The smoke test uses a 128×128 lightmap whose UVs cover a 64×64 region. The
larger target keeps the 32×32 hemisphere batch inside the storage texture; the
known batch-flush bounds assert is outside this change.

`eglinfo` on the verification server reports OpenGL ES 3.2 (llvmpipe) with
`GL_EXT_color_buffer_float`.

## Desktop regression (verification server, Xvfb + llvmpipe)

- Built `example/` with CMake (Release); build exited 0.
- Ran `build/example` under `xvfb-run` with `LIBGL_ALWAYS_SOFTWARE=1` and sent
  `SPACE` through XTest to start the bake.
- The bake progressed to `99.41%` before the verification timeout, with no
  shader compile, GL or assertion errors in the log. The selector check reports
  `LM_GLES3=0` for desktop headers and the preprocessor check confirms only
  `#version 150 core` shaders are present in the desktop path.

The example's bake is slow under llvmpipe at its fixed 64-texel hemisphere
resolution; the run was stopped after several minutes of steady progress
rather than waiting for the final `Finished baking` line.

## Wrapper verification (fresh verification tree)

The verification tree was created from the working tree without `build/`,
`dist/` or `node_modules/`, with `thirdparty/lightmapper` at `c111bb8`.

- `npm ci`: 1 package installed, 0 vulnerabilities.
- Emscripten `3.1.64` (`a1fe3902bf73a3802eae0357d273d0e37ea79898`).
- `npm run configure:wasm`, `npm run build:wasm`, `npm run build:dist`,
  `npm run typecheck`: all exited 0.
- `dist/index.js` (249042 bytes), `dist/index.d.ts` (19457 bytes); no separate
  `.wasm` in `dist/` or `build/wasm/`.
- `npm run test:shader`: `✓ first-pass sampling probe passed: 64 output texels,
  60x16 source, 24x8 weights`.
- `npm run test:readback`: all multi-pass scenarios passed;
  `readbackHeights=[16,16,16,16,16,16,16] creates=1 deletes=0`.
- Packaged entry: `READBACK_PROBE_MODE=packaged READBACK_PROBE_ENTRY=dist`
  passed.
- `npm pack --dry-run --json` lists `LICENSE`, `LIGHTMAPPER.md`, `README.md`,
  `WASM_SETUP.md`, `dist/index.d.ts`, `dist/index.js` and `package.json`; no
  `.wasm`.

## Demo smoke bake

Headless Chrome/ANGLE SwiftShader with the gazebo scene (`730 triangles`,
`1 bounce`):

- Status: `Finished baking 730 triangles (1 bounce).`
- Console/page errors: none.
- 1024×768 capture, grayscale statistics:
  - `evidence/demo-before.png`: min 0, max 235, unique 235, mean 112.90.
  - `evidence/demo-after.png`: min 17, max 235, unique 219, mean 131.31.

The baked frame has no black pixels and no bake failure or WebGL error was
reported. The capture and raw result are in `evidence/`.

