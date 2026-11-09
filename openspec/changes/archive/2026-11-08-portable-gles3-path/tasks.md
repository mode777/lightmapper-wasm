# Tasks

## 1. Wrapper shader-probe update (this repository)

- [x] 1.1 Update `test/first-pass-sampling.mjs` to locate the first-pass ES branch by the new `#if LM_GLES3` selector instead of the literal `#if defined(__EMSCRIPTEN__)` marker, and fail loudly when the selector, the `#else` or the `#version 300 es` shader is missing. Verify: against the current pin the probe exits non-zero with a clear "missing LM_GLES3 selector" message rather than testing the desktop branch; the post-bump pass is covered by 3.2.
- [x] 1.2 Add a `LIGHTMAPPER_HEADER` override to the probe (defaulting to the submodule header) and assert that the extracted first-pass branch is guarded by `LM_GLES3`, not by `__EMSCRIPTEN__`. Verify: pointing the probe at a scratch copy of the header with the guard changed to `#if defined(__EMSCRIPTEN__)` makes it fail with the selector assertion, and the real header passes after the bump (3.2).

## 2. Upstream portable selector (`[lightmapper]`)

- [x] 2.1 `[lightmapper]` Add the `LM_GLES3` detection block near the top of `lightmapper.h` (`GL_ES_VERSION_3_0` auto-detection, explicit `LM_GLES3` 0/1 override) and replace the three `#if defined(__EMSCRIPTEN__)` sites — final readback, hemisphere downsample shaders and first-pass shaders — with `#if LM_GLES3`. Verify: the header contains no `__EMSCRIPTEN__` path selection, compiling with Emscripten's GLES3 header sets `LM_GLES3` to 1, and the wrapper shader/readback probes pass after the bump (3.2).
- [x] 2.2 `[lightmapper]` Document the `EXT_color_buffer_float` requirement next to the ES readback path and in the upstream README, including the include-order rule (GL headers before `lightmapper.h`) and the `LM_GLES3` override. Verify: the documented requirement matches the RGBA32F FBO readback behavior and the wrapper's existing capability probe.
- [x] 2.3 `[lightmapper]` Add a native GLES3 verification program under the upstream test tree that includes `<EGL/egl.h>` and `<GLES3/gl3.h>`, has `#if !LM_GLES3 #error ... #endif`, creates an EGL surfaceless GLES3 context, checks `EXT_color_buffer_float`, and runs a small bake through `lmCreate`/`lmSetTargetLightmap`/`lmSetGeometry`/`lmBegin`/`lmEnd` with a cleared hemisphere framebuffer. Verify: on the verification server with Mesa llvmpipe the program compiles without `__EMSCRIPTEN__`, both shader programs link, the bake completes, the lightmap is finite and non-zero, and no GL error is reported.
- [x] 2.4 `[lightmapper]` Add compile-only selector checks for GLES3 headers (auto-detect `LM_GLES3 == 1`), desktop GL headers (auto-detect `LM_GLES3 == 0`), `-DLM_GLES3=0` and `-DLM_GLES3=1`. Verify: each check compiles and reports the expected macro value; the desktop case does not pull in the ES readback or shader branch.
- [x] 2.5 `[lightmapper]` Keep the desktop example and `glGetTexImage` behavior unchanged; build and run the example under Xvfb/llvmpipe and confirm the selector check reports `LM_GLES3 == 0` for desktop headers, the `#version 150 core` shaders compile and the bake progresses with no shader or GL errors. Verify: the example output and GL state are unchanged from the previous pin.
- [x] 2.6 `[lightmapper]` Land the upstream change and record the commit SHA plus the native GLES3 and desktop verification evidence in this change's notes. Verify: the SHA contains the selector, documentation and test changes, and the checks in 2.3–2.5 pass at that SHA.

## 3. Consume the fix in this repository

- [x] 3.1 Bump `thirdparty/lightmapper` to the SHA recorded in 2.6. Verify: `git submodule status` reports the new SHA and the submodule diff contains only the intended selector, documentation and test changes.
- [x] 3.2 Run `npm run test:shader` and `npm run test:readback` against the bumped submodule. Verify: the shader probe passes 64/64 texels through the updated extractor and every readback scenario still passes.
- [x] 3.3 Run the upstream native GLES3 test from the bumped submodule on the verification server. Verify: it compiles against the submodule header without `__EMSCRIPTEN__`, selects `LM_GLES3 == 1`, completes the bake with finite non-zero output and reports no GL errors.
- [x] 3.4 Build with Emscripten 3.1.64: `npm run configure:wasm`, `npm run build:wasm`, `npm run build:dist`, `npm run typecheck`. Verify: every command exits 0, `dist/index.js` and `dist/index.d.ts` exist, and the single-file artifact layout is unchanged (no separate `.wasm`).
- [x] 3.5 Run the browser demo's asymmetric-scene bake in headless Chrome/ANGLE SwiftShader. Verify: the bake completes without WebGL errors and produces finite, non-uniform lighting; attach the capture to the change notes.
- [x] 3.6 Confirm the package entry and loader behavior are unchanged: import the built `dist/index.js` in a scratch page, create the module and run a tiny bake, and check `npm pack --dry-run` lists the same `dist/` payload with no new files. Verify: the packaged entry loads and the file list matches the current release line.

## 4. Documentation and decisions

- [x] 4.1 Update `docs/decisions.md`: move AD-007 from Proposed to Accepted and refine its wording to record the single `LM_GLES3` macro, `GL_ES_VERSION_3_0` auto-detection, the explicit override and the native EGL verification consequence. Verify: the index row and section agree, no Accepted ADR is rewritten, and no new ADR ID is introduced.
- [x] 4.2 Update `docs/wasm-improvements.md`: mark F3 fixed, update the current-state bullets and the roadmap row for change 3 to Implemented, record the upstream SHA and the native test command, and point the next change at `wasm-release-build`. Verify: no F3 or change-3 text still describes `__EMSCRIPTEN__` selection as current.
- [x] 4.3 Check `README.md`, `WASM_SETUP.md` and `LIGHTMAPPER.md` for claims about `__EMSCRIPTEN__`, GLES3 selection or the `EXT_color_buffer_float` requirement. Verify: any stale statement is updated, or the change notes state why none needed changing.
- [x] 4.4 Run `npx @fission-ai/openspec@latest validate --all --strict`. Verify: zero errors and zero warnings.

## 5. Integration verification

- [x] 5.1 From a clean checkout with submodules initialized, run `npm ci`, the wasm configure/build, `npm run build:dist`, `npm run typecheck`, `npm run test:shader`, `npm run test:readback`, the native GLES3 test and the headless smoke bake. Verify: all pass on the final submodule pin.
- [x] 5.2 Re-run `npx @fission-ai/openspec@latest validate --all --strict` after the documentation updates. Verify: zero errors and zero warnings.

## Workflow follow-up

- Review the completed implementation and evidence with the maintainer.
- Archive the change after approval and verify the archived `c-library-port` requirement.
