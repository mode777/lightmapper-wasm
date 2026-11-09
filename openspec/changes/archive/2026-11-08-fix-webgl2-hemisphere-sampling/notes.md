# Implementation notes — fix-webgl2-hemisphere-sampling

## Upstream fix

- Repository: `mode777/lightmapper`
- Commit: `5326e7cdc3669551f22fe214e81fa2a7bc3c4569` — “Fix GLES3 first-pass sample coordinates”
- Pushed to `origin/master`.
- The diff touches only the ES first-pass shader. The desktop first-pass
  shader block hash is unchanged:
  `a457cd2f0cc3d7c038c68d4e254d07a2ac27f527ad792936dfea4499d2267558`.

## Shader probe

`npm run test:shader` (with `CHROME_SHELL_PATH` pointing at
`chrome-headless-shell` and ANGLE SwiftShader).

- Against the previous pin `72b69e9`: **64/64 output texels failed**. Origin
  `(0, 0)` sampled `(3, 1)`; every other texel was shifted by the same
  `(3, 1)` offset.
- Against `5326e7c`: **64/64 output texels passed** (60×16 source, 24×8
  weights).
- The probe is `test/first-pass-sampling.mjs`; it extracts the ES first-pass
  shaders from the pinned header, renders them against an asymmetric
  coordinate-encoding pattern, and fails if the expected origin is not
  `(6x, 2y)`.

## Desktop verification

- Built the upstream `example/` with CMake/Release; GLFW is bundled.
- Ran under `Xvfb` with `LIBGL_ALWAYS_SOFTWARE=1` and llvmpipe.
- Sent SPACE with an XTEST helper to start the bake. The first-pass desktop
  shaders compiled and the bake progressed (`1.29%`, `5.26%`, `8.01%`) with no
  shader compile or GL errors. The run was stopped after progress was
  confirmed; the desktop shader block is byte-identical to the previous pin.

## Wrapper build and smoke bake

- Toolchain: Emscripten `3.1.64` (a1fe3902bf73a3802eae0357d273d0e37ea79898).
- `npm ci`, `configure:wasm`, `build:wasm`, `build:dist` and `typecheck` all
  passed.
- Artifact layout is unchanged: `build/wasm/wasm/lightmapper_wasm.mjs` plus
  `dist/index.js` and `dist/index.d.ts`; there is no separate `.wasm`.
- Headless Chrome/ANGLE SwiftShader demo bake finished:
  “Finished baking 730 triangles (1 bounce).”
- Captures:
  - `evidence/bake-before.png` — ready, lightmap still black.
  - `evidence/bake-after.png` — finished bake, non-uniform lighting.
- Grayscale statistics for the 1000×600 canvas crop: before `min 0`, `max
  195`, `unique 48`; after `min 17`, `max 195`, `unique 151`, with visible
  variation across the gazebo. No WebGL errors were reported.

## ADR and docs review

- `docs/decisions.md` is unchanged. This change implements AD-003 and preserves
  AD-002 (desktop path); it introduces no new decision, so no ADR was added or
  superseded.
- `docs/wasm-improvements.md`: F1 is marked fixed with the upstream SHA and
  probe command; the 3.1/3.2 state, roadmap row 1, section 7.1 and section 9
  are updated. This is the regression note.
- `README.md` and `WASM_SETUP.md`: the “current defect” text now says the fix
  is in the source tree and that published `0.1.2` artifacts predate it.
  `LIGHTMAPPER.md` had no stale sampling claim.

## Final clean-checkout verification

- Fresh tree with no `build/`, `dist/` or `node_modules/`; submodule cloned
  fresh from `https://github.com/mode777/lightmapper.git` at
  `5326e7cdc3669551f22fe214e81fa2a7bc3c4569`.
- Emscripten 3.1.64; `npm ci`, `configure:wasm`, `build:wasm`, `build:dist`
  and `typecheck` all passed.
- Artifact layout: `build/wasm/wasm/lightmapper_wasm.mjs`, `dist/index.js`,
  `dist/index.d.ts`; no `.wasm` (single-file build unchanged).
- `npm run test:shader`: 64/64 output texels passed.
- Headless smoke bake: “Finished baking 730 triangles (1 bounce).”
