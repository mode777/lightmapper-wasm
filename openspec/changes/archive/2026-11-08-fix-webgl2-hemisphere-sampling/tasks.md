# Tasks

## 1. Regression probe (this repository)

- [x] 1.1 Add `test/first-pass-sampling.mjs` with a Node driver that extracts the ES first-pass vertex/fragment shader strings from `thirdparty/lightmapper/lightmapper.h`, fails with an explicit message when the expected `#if defined(__EMSCRIPTEN__)` markers are missing, launches `chrome-headless-shell` with ANGLE SwiftShader, and parses the probe result from the dumped DOM. Verify: running it with a temporarily renamed marker exits non-zero with the marker error.
- [x] 1.2 Implement the probe's WebGL2 render: compile the extracted shader, upload an asymmetric source pattern that encodes each texel's coordinates plus a fixed weights pattern, render into an RGBA32F target, read back, and assert that output `(x, y)` contains exactly columns `6x..6x+5` of rows `2y` and `2y+1` for a grid including `(0, 0)` and non-zero texels. Verify: the probe passes against a corrected shader and reports the exact mismatching coordinates against the current one.
- [x] 1.3 Add a `test:shader` script to `package.json` that runs the probe with no new dependency. Verify: `npm run test:shader` works from a clean checkout when `CHROME_SHELL_PATH` points at `chrome-headless-shell`.
- [x] 1.4 Run the probe against the current unmodified submodule pin and record the F1 reproduction: origin `(0, 0)` reads `(3, 1)` and the block is shifted right/up. Verify: the captured failure output shows the expected versus actual block origins.

## 2. Upstream shader fix (`[lightmapper]`)

- [x] 2.1 `[lightmapper]` In `mode777/lightmapper`, change the ES first-pass shader to `ivec2 h_uv = ivec2(gl_FragCoord.xy) * ivec2(6, 2);` and derive `w_uv` from `h_uv`; add a comment explaining GLES3 half-integer pixel centers. Verify: the ES shaders compile and the shader probe passes against that checkout for the origin and non-zero grid.
- [x] 2.2 `[lightmapper]` Keep the desktop `#version 150 core` first-pass shader byte-identical. Verify: `git diff` touches only the ES branch and the desktop shader block hash matches the pinned revision.
- [x] 2.3 `[lightmapper]` Build and run the upstream desktop example under Xvfb/llvmpipe to confirm AD-002 is preserved. Verify: the example builds and runs without shader compile errors or GL errors.
- [x] 2.4 `[lightmapper]` Land the upstream fix and record the resulting commit SHA plus verification evidence in this change's notes. Verify: the SHA contains the ES shader change and the probe passes when checked out at that SHA.

## 3. Consume the fix in this repository

- [x] 3.1 Bump the `thirdparty/lightmapper` submodule to the SHA recorded in 2.4. Verify: `git submodule status` reports the new SHA and the submodule diff contains only the intended ES shader change.
- [x] 3.2 Run `npm run test:shader` against the bumped submodule. Verify: all probe scenarios pass, including origin `(0, 0)` and non-zero texels.
- [x] 3.3 Build the current artifact with Emscripten 3.1.64: `npm run configure:wasm`, `npm run build:wasm`, `npm run build:dist`, `npm run typecheck`. Verify: every command exits 0, `dist/index.js` and `dist/index.d.ts` exist, and the single-file (no separate `.wasm`) layout is unchanged.
- [x] 3.4 Run the browser demo's asymmetric-scene bake in headless Chrome/ANGLE SwiftShader. Verify: the bake completes without WebGL errors and produces finite, non-uniform lighting; attach the before/after capture to the change notes.

## 4. Documentation and decisions

- [x] 4.1 Update `docs/wasm-improvements.md`: mark F1 fixed, add the regression note with the probe command and upstream SHA, and change the row-1 status to Implemented. Verify: no F1 or change-1 text still describes the defect as open.
- [x] 4.2 Review `docs/decisions.md`: no new decision is expected, because this implements AD-003 and preserves AD-002. Verify: either the file is unchanged with that rationale recorded in the change notes, or any newly surfaced decision has the next sequential ADR ID and an updated index row.
- [x] 4.3 Check `README.md`, `WASM_SETUP.md` and `LIGHTMAPPER.md` for claims about sampling correctness or the current artifact. Verify: any stale statement is updated, or the change notes state why none needed changing.

## 5. Integration verification

- [x] 5.1 From a clean checkout with submodules initialized, run `npm ci`, the wasm configure/build, `npm run build:dist`, `npm run typecheck`, `npm run test:shader` and the headless smoke bake. Verify: all pass on the final submodule pin.
- [x] 5.2 Run `npx @fission-ai/openspec@latest validate --all --strict`. Verify: zero errors and zero warnings.

## Workflow follow-up

- Review the completed implementation and evidence with the maintainer.
- Archive the change after approval and verify the archived `c-library-port` requirement.
