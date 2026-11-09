# Tasks

## 1. Readback regression probe (this repository)

- [x] 1.1 Add `test/readback-state.mjs` with a Node driver that starts a local HTTP server for the workspace (ES module imports do not work from `file://`), builds a minimal two-triangle scene, launches `chrome-headless-shell` with ANGLE SwiftShader, runs a multi-pass bake through `src/index.js` and the compiled module (the packaged `dist` entry is covered by the packaged mode), and reports a base64 JSON result from the dumped DOM. Verify: `npm run test:readback` runs end to end and, against the current pin, exits non-zero with a clear assertion/abort or lost-read-binding failure rather than a harness error.
- [x] 1.2 Interpose `createFramebuffer`, `deleteFramebuffer`, `bindFramebuffer`, `readPixels`, `readBuffer` and `getParameter` on the WebGL2 context and assert: no framebuffer create/delete between readbacks; `glReadPixels` height is the written-row bound rather than the full lightmap height and never exceeds the lightmap height; the post-`readPixels` restore binds the captured read and draw framebuffers separately and reselects the captured read buffer; distinct sentinel bindings and a non-default read buffer are returned for the capture queries. Verify: each scenario is reported by name and the full-height-transfer and distinct-binding cases fail against the current code.
- [x] 1.3 Add the forced-failure scenario: after a successful `lmCreate`, make `checkFramebufferStatus` return `FRAMEBUFFER_INCOMPLETE_ATTACHMENT`, run a bake and assert it completes without aborting, emits one clear stderr/console error, and leaves the context usable. Verify: the probe's failure-path scenario passes after the fix and reports the assertion/abort before it.
- [x] 1.4 Add a `test:readback` script to `package.json` with no new dependency. Verify: `npm run test:readback` works from a clean checkout when `CHROME_SHELL_PATH` points at `chrome-headless-shell`.
- [x] 1.5 Support a temporary `-DNDEBUG` wasm flavor for the probe (separate build directory, not shipped) and add a full-height one-pass mode that checks the oversized-row clamp. Verify: without the clamp the probe records a `glReadPixels` height above the lightmap height; with the clamp it records the lightmap height.

## 2. Upstream readback hardening (`[lightmapper]`)

- [x] 2.1 `[lightmapper]` Replace the `assert(glCheckFramebufferStatus(...))` in `lm_writeResultsToLightmap` with an explicit status check that prints one clear error to stderr, skips the transfer and still resets the write position and clears the consumed position-map rows. Verify: the forced-incomplete-framebuffer scenario logs once, does not abort, and a subsequent bake still works.
- [x] 2.2 `[lightmapper]` Capture and restore `GL_READ_FRAMEBUFFER_BINDING`, `GL_DRAW_FRAMEBUFFER_BINDING` and `GL_READ_BUFFER` separately, restoring the read buffer after the read framebuffer; use the same single exit path on success and failure. Verify: the probe's distinct read/draw sentinel scenario shows the correct restore order and values.
- [x] 2.3 `[lightmapper]` Add `readbackFramebuffer`, `readbackBuffer` and `readbackBufferCount` to `lm_context.hemisphere.storage`; create and attach the FBO lazily on the ES path, grow the CPU buffer only when the target lightmap needs more space, and delete both in `lmDestroy`. Verify: the probe observes no framebuffer create/delete between readbacks and repeated readbacks reuse the same buffer; a larger target grows the buffer once.
- [x] 2.4 `[lightmapper]` Bound the ES transfer to `min(writePosition.y + fbHemiCountY, lightmap.height)` for both `glReadPixels` and the result loop, and do not index the position map beyond that bound. Verify: the probe records a write-bound height below the full lightmap height on the multi-pass bake, and the `-DNDEBUG` full-height mode records the clamped lightmap height instead of an oversized bound.
- [x] 2.5 `[lightmapper]` Remove the duplicate `glDeleteTextures` of `hemisphere.storage.texture` and release the cached readback FBO and buffer in `lmDestroy`. Verify: destroy completes without GL errors and the probe reports no leaked readback objects.
- [x] 2.6 `[lightmapper]` Keep the desktop `#else` branch on `glGetTexImage` and only share the cached CPU buffer allocation there. Verify: the upstream desktop example builds and runs under Xvfb/llvmpipe through several bake progress steps with no shader or GL errors, and the header diff for the desktop readback behavior is limited to buffer reuse.
- [x] 2.7 `[lightmapper]` Land the upstream change and record the commit SHA plus desktop verification evidence in this change's notes. Verify: the probe passes when checked out at that SHA.

## 3. Consume the fix in this repository

- [x] 3.1 Bump `thirdparty/lightmapper` to the SHA recorded in 2.7. Verify: `git submodule status` reports the new SHA and the submodule diff contains only the intended readback, context-field and destroy changes.
- [x] 3.2 Run `npm run test:readback` and `npm run test:shader` against the bumped submodule. Verify: every readback scenario passes and the shader probe still passes 64/64 output texels.
- [x] 3.3 Build with Emscripten 3.1.64: `npm run configure:wasm`, `npm run build:wasm`, `npm run build:dist`, `npm run typecheck`. Verify: every command exits 0, `dist/index.js` and `dist/index.d.ts` exist, and the single-file artifact layout is unchanged (no separate `.wasm`).
- [x] 3.4 Run the browser demo's asymmetric-scene bake in headless Chrome/ANGLE SwiftShader. Verify: the bake completes without WebGL errors and produces finite, non-uniform lighting; attach the capture to the change notes.
- [x] 3.5 Confirm the package entry and loader behavior are unchanged: import the built `dist/index.js` in the scratch page, create the module and run a tiny bake, and check `npm pack --dry-run` lists the same `dist/` payload with no new `.wasm`. Verify: the packaged entry loads and the file list matches the current release line.

## 4. Documentation and decisions

- [x] 4.1 Add AD-014 ("Readback failures are non-fatal and reported on stderr") to `docs/decisions.md` and move AD-011 from Proposed to Accepted on implementation; update the index table and note that AD-002/AD-003/AD-004 are preserved. Verify: every decision cited by the proposal and design exists with the correct status, no Accepted ADR text is rewritten, and the index matches the sections.
- [x] 4.2 Update `docs/wasm-improvements.md`: mark F2 and F9 fixed, note the duplicate `storage.texture` deletion from F14 as fixed, set the roadmap row for change 2 to Implemented, and record the upstream SHA and probe command. Verify: no F2/F9 or roadmap text still describes the readback defects as open.
- [x] 4.3 Check `README.md`, `WASM_SETUP.md` and `LIGHTMAPPER.md` for claims about readback behavior, framebuffer state or FBO allocation. Verify: any stale statement is updated, or the change notes state why none needed changing.
- [x] 4.4 Run `npx @fission-ai/openspec@latest validate --all --strict`. Verify: zero errors and zero warnings.

## 5. Integration verification

- [x] 5.1 From a clean checkout with submodules initialized, run `npm ci`, the wasm configure/build, `npm run build:dist`, `npm run typecheck`, `npm run test:shader`, `npm run test:readback` and the headless smoke bake. Verify: all pass on the final submodule pin.
- [x] 5.2 Re-run `npx @fission-ai/openspec@latest validate --all --strict` after the documentation updates. Verify: zero errors and zero warnings.

## Workflow follow-up

- Review the completed implementation and evidence with the maintainer.
- Archive the change after approval and verify the archived `c-library-port` requirements.
