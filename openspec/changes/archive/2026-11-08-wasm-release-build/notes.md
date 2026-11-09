# Implementation notes — wasm-release-build

## Toolchain

- Emscripten `3.1.64` (`a1fe3902bf73a3802eae0357d273d0e37ea79898`), activated
  from the workspace emsdk.
- CMake `4.2.3`, Node `24.22.1`, npm `11.12.1` in the toolbox container.
- The release configuration reports `CMAKE_BUILD_TYPE=Release`; the compile
  flags are `-O3 -DNDEBUG -flto` and the link line carries `-O3 -DNDEBUG
  -flto`, `-sSINGLE_FILE=1`, `-sMIN_WEBGL_VERSION=2` and
  `-sMAX_WEBGL_VERSION=2` with no `-sUSE_WEBGL2=1`.

## Artifact measurements

| Artifact | Before | After |
|---|---|---|
| Embedded wasm | 98,112 bytes | 44,136 bytes |
| `lightmapper_wasm.mjs` | 230,583 bytes | 90,437 bytes |
| `dist/index.js` | 247,630 bytes | 107,484 bytes |

- Before wasm SHA-256:
  `3534fafccd4af9302f689b3fe6bd73725f22c86485f0230358179ac35f382ce8`
- After wasm SHA-256:
  `8d26a4c4eb52ab00e2240e80ca9f61940c0048be3a38a60ef97dbcb5bdfc284e`
- Before `.mjs` SHA-256:
  `ce37b31656757862b068bb00d23e1d3699154714a6ec0759a03f6c4dc0ad7910`
- Reproducibility: two clean `cmake --build build/wasm --clean-first` rebuilds
  produced the same wasm size and SHA-256; `diff` of the two reports was empty.
- `-flto` was adopted (the build instantiates and passes the probes; see the
  verification section). `LM_WASM_LTO` defaults to ON and can be disabled with
  `-DLM_WASM_LTO=OFF`.

## Debug flavour

- `npm run configure:wasm:debug && npm run build:wasm:debug` writes
  `build/wasm-debug/wasm/lightmapper_wasm.mjs` with `C_FLAGS = -g` (no
  `NDEBUG`).
- The release `build/wasm/wasm/lightmapper_wasm.mjs` SHA-256 was unchanged
  after the debug build.

## Toolchain check

- `npm run check:emsdk` reports `Emscripten 3.1.64 (expected 3.1.64)`.
- A stub `emcc` reporting `3.1.57` exits non-zero with:
  `check-emsdk: expected Emscripten 3.1.64, found 3.1.57.`
- The check runs through `preconfigure:wasm`, `prebuild:wasm` and the debug
  equivalents; CI pins `setup-emsdk` to 3.1.64 and runs `check:emsdk`.

## Submodule

- `.gitmodules` now uses `https://github.com/mode777/lightmapper.git` without
  the `mode777@` userinfo; the pinned commit remains
  `c111bb8e5a52a85b5031f08194ff9d5c85f40e8c`.
- `git submodule sync` and `git submodule update --init --recursive` succeed;
  `git ls-remote` against the canonical URL resolves the same commit.

## Verification (verification server, fresh tree)

A fresh tree without `build/`, `dist/` or `node_modules/` was created on the
verification server and built with Emscripten 3.1.64:

- `npm ci`, `npm run configure:wasm`, `npm run build:wasm`,
  `npm run build:dist` and `npm run typecheck` all exited 0.
- The remote release build reproduced the local measurements exactly:
  44,136-byte wasm, 90,437-byte `.mjs`, same SHA-256
  `8d26a4c4eb52ab00e2240e80ca9f61940c0048be3a38a60ef97dbcb5bdfc284e`.
- `npm run test:shader`: `✓ first-pass sampling probe passed: 64 output
  texels, 60x16 source, 24x8 weights`.
- `npm run test:readback`: all scenarios passed;
  `readbackHeights=[16,16,16,16,16,16,16] creates=1 deletes=0`.
- Packaged entry: `READBACK_PROBE_MODE=packaged READBACK_PROBE_ENTRY=dist`
  loaded `dist/index.js`, baked and destroyed the context successfully.
- Debug build: `build/wasm-debug` built with `C_FLAGS = -g`; the release
  `.mjs` SHA-256 was unchanged.
- `npm pack --dry-run --json` lists `LICENSE`, `LIGHTMAPPER.md`, `README.md`,
  `WASM_SETUP.md`, `dist/index.d.ts`, `dist/index.js` and `package.json`; no
  `.wasm`.

## Demo smoke bake

Headless Chrome/ANGLE SwiftShader with the gazebo scene (`730 triangles`,
`1 bounce`):

- Status: `Finished baking 730 triangles (1 bounce).`
- Console/page errors: none.
- 1024×768 capture, grayscale statistics:
  - `evidence/demo-before.png`: min 0, max 195, unique 14, mean 141.48.
  - `evidence/demo-after.png`: min 34, max 195, unique 131, mean 161.48.

The baked frame is finite, has no black pixels, and has visibly more tonal
variation than the unlit frame; no bake failure or WebGL error was reported.

