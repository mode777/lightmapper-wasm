# Design

## Context

See `proposal.md` for motivation. The relevant state is:

- `thirdparty/lightmapper/lightmapper.h` selects the ES path at three sites
  with `#if defined(__EMSCRIPTEN__)`: the final readback (~line 735), the
  hemisphere downsample shaders (~line 1285) and the first-pass shaders
  (~line 1384). The header includes no GL headers itself; the consumer must
  include them first, and `wasm/lightmapper_wasm.c` includes
  `<GLES3/gl3.h>` before defining `LIGHTMAPPER_IMPLEMENTATION`.
- `GL_ES_VERSION_3_0` is defined by Khronos GLES3 headers, including the
  Emscripten copy, so it is a reliable capability signal once GL headers are
  included. `__EMSCRIPTEN__` says which compiler is running, not which GL
  dialect the target supports.
- The upstream repository has only the desktop example build. There is no
  native GLES3 harness and no CI. The verification server has `GLES3/gl3.h`,
  `EGL/egl.h`, `libGLESv2`, `libEGL` and Mesa llvmpipe; `eglinfo` reports
  OpenGL ES 3.2 (llvmpipe) with `GL_EXT_color_buffer_float`, so an EGL
  surfaceless run is available without a physical GPU.
- `test/first-pass-sampling.mjs` extracts the ES first-pass shaders by
  searching for the literal `#if defined(__EMSCRIPTEN__)` marker. Changing the
  selector without updating the probe would make the probe fail (or worse,
  extract the desktop branch).
- Change 1 fixed the ES sampling math and change 2 hardened the ES readback.
  Both behaviors must stay unchanged; this change only changes how the ES
  branch is selected and documents its float-target requirement.

Constraints: the header stays single-header and dependency-free (AD-001); the
desktop GL 3.2 path and `glGetTexImage` behavior must not change (AD-002);
WebGL2/GLES3 is the only wasm graphics target and `EXT_color_buffer_float` is
required (AD-003); upstream C changes are owned by `mode777/lightmapper` and
consumed by a submodule bump (AD-004); the public JS entry, context probe and
strict binding stay as they are (AD-005); verification must run headlessly
(AD-010). Readback failure and state behavior stay as accepted in AD-011 and
AD-014.

## Goals / Non-Goals

**Goals:**

- Select the ES shader and readback paths from GLES3 capability, with a single
  `LM_GLES3` macro and an explicit override.
- Remove `__EMSCRIPTEN__` from path selection while keeping Emscripten
  integration in the shim.
- Prove the same header works on native GLES3 (EGL surfaceless/llvmpipe) and
  still works on desktop GL 3.2.
- Keep the browser probes, wasm build and package artifact behavior unchanged.
- Document the RGBA32F/`EXT_color_buffer_float` requirement where the ES
  readback is defined.

**Non-Goals:**

- Changing shader math, readback state handling, readback bounds or resource
  caching.
- Supporting native GLES3 or desktop GL as a product target; the native harness
  is verification only.
- Adding a public C API, changing `lm_context`, or changing the JS wrapper.
- Changing the Emscripten build flags, artifact layout or npm package.
- Worker support, a separate `.wasm` asset, generated types or release docs.

## Decisions

### D1 — One `LM_GLES3` macro with auto-detection and an override

Add one selector near the top of `lightmapper.h`:

```c
#ifndef LM_GLES3
#  if defined(GL_ES_VERSION_3_0)
#    define LM_GLES3 1
#  else
#    define LM_GLES3 0
#  endif
#endif
```

Replace all three `#if defined(__EMSCRIPTEN__)` sites with `#if LM_GLES3`.
`LM_GLES3` may be defined to `1` to force the ES path or `0` to force the
desktop path; a bare `-DLM_GLES3` is `1` in `#if`. Document that GL headers must
be included before `lightmapper.h` (already required by the header's GL types)
and that a GLES3 consumer that includes only GLES2 headers must either include
`GLES3/gl3.h` or define `LM_GLES3`. Forcing `LM_GLES3=0` selects the desktop
branch during preprocessing, but compiling that branch still requires desktop
GL declarations (`glGetTexImage`), so the override is intended for header sets
that provide them or for selection checks that do not compile the
implementation.

*Alternatives considered:*

- `#if defined(__EMSCRIPTEN__) || defined(GL_ES_VERSION_3_0)` — fixes native
  GLES3 but keeps the compiler identity in path selection and has no explicit
  override. Rejected: it does not satisfy AD-007 and leaves two sources of
  truth.
- Detect only `GL_ES_VERSION_3_0` with no override — simpler, but consumers
  with custom GL loaders that do not expose the Khronos macro have no escape
  hatch. Rejected: AD-007 explicitly calls for an override.
- A runtime GL version query — the header's shader strings must be chosen at
  compile time and `lmCreate` is not the place to branch on a context. Rejected:
  it would add runtime state and a failure mode for no benefit.

### D2 — Keep Emscripten-specific code in the shim, not the header

After the selector change the header has no `__EMSCRIPTEN__` references. The
Emscripten integration stays where it belongs: `wasm/lightmapper_wasm.c`
includes the GLES3 and Emscripten headers and uses
`emscripten_webgl_get_current_context` / `emscripten_webgl_make_context_current`.
No build flag changes are needed because Emscripten's GLES3 header defines
`GL_ES_VERSION_3_0`.

This preserves AD-001 and AD-004: the header remains dependency-free, and the
wrapper does not hand-edit the submodule.

### D3 — Verify native GLES3 with an EGL surfaceless smoke test

Add an upstream test program that includes `<EGL/egl.h>`, `<EGL/eglext.h>` and
`<GLES3/gl3.h>`, defines `LIGHTMAPPER_IMPLEMENTATION`, and has compile-time
guards:

```c
#if !LM_GLES3
#  error "GLES3 headers did not select the ES path"
#endif
```

The test creates an EGL surfaceless context (Mesa `EGL_PLATFORM_SURFACELESS_MESA`
or `EGL_PLATFORM=surfaceless`), requests a GLES3 context, checks
`EXT_color_buffer_float`, creates a small triangle scene and a 128×128 lightmap
whose UVs cover a 64×64 region. The larger target keeps the 32×32 hemisphere
batch inside the storage texture; the known batch-flush bounds assert is
outside this change. The test runs `lmCreate` → `lmSetTargetLightmap` →
`lmSetGeometry` → `lmBegin`/`lmEnd` until complete. Each pass clears the
library's bound hemisphere framebuffer with a non-zero color and alpha 1.0 so
the samples count as valid; the test then asserts the lightmap contains finite,
non-zero values and that no GL error is raised.

The value of this test is that `lmCreate` compiles both shader programs. On a
GLES3 context the desktop `#version 150 core` shaders fail to compile, so a
successful `lmCreate` plus a completed bake proves the ES branch was selected.
The FBO readback path is exercised by the final flush.

A compile-only selector check includes the header without
`LIGHTMAPPER_IMPLEMENTATION` and asserts `LM_GLES3` is `0` for desktop headers
and `1` for GLES3 headers; the same check is compiled with `-DLM_GLES3=0` and
`-DLM_GLES3=1` to cover the override. The existing desktop example is then
built and run under Xvfb/llvmpipe to prove the `glGetTexImage` path still
works.

*Alternatives considered:*

- A preprocessor-only test — cheap but does not prove the shaders compile or
  that readback works. Rejected as the primary check; it remains a supplement.
- A native Android/iOS test — requires a device or emulator and is outside the
  verification server's capability. Rejected.
- Reusing the browser probe only — it proves Emscripten/WebGL2, not a
  non-Emscripten GLES3 build, which is the defect. Rejected.

### D4 — Update the wrapper shader probe to the new selector

`test/first-pass-sampling.mjs` will locate the first-pass ES branch by the new
`#if LM_GLES3` marker instead of `#if defined(__EMSCRIPTEN__)`, and fail loudly
if the marker, the `#else`, or the `#version 300 es` shader is missing. It will
also assert that the extracted block is the ES branch (not the desktop one).

Sequencing: the updated probe is expected to fail against the current pin
because `LM_GLES3` does not exist there; that failure is the signal to bump the
submodule. After the bump, the probe must pass 64/64 texels again. This is a
test-harness change, not a change to the sampling contract.

### D5 — Consume upstream and record the decision

The upstream `[lightmapper]` repository lands the selector change, the native
GLES3 test and the desktop check. This repository bumps
`thirdparty/lightmapper` to the smallest commit containing them, reviews the
header diff, and re-runs the probes and build.

`docs/decisions.md` updates AD-007 from Proposed to Accepted and refines its
wording to record the single-macro auto-detection, the `LM_GLES3` override and
the native EGL verification consequence. No new ADR is added: AD-007 already
owns this decision, and the verification approach extends its consequences
rather than creating a separate architectural choice. The other ADRs
(including Accepted AD-002, AD-003, AD-004 and AD-005, and the verification
and readback decisions in AD-010, AD-011 and AD-014) are not rewritten.

`docs/wasm-improvements.md` marks F3 fixed, updates the roadmap row for change 3
to Implemented with the upstream SHA, updates the "current state" bullets, and
points the next change at `wasm-release-build`. The F3 evidence text is kept as
historical context, matching how F1 and F2 are recorded.

## Verification

Run without a physical GPU:

1. **Native GLES3 smoke:** on the verification server, build and run the new
   EGL surfaceless test against GLES3 headers. Assert `LM_GLES3 == 1`,
   `EXT_color_buffer_float` is present, both shader programs compile, the bake
   completes, and the lightmap is finite and non-zero.
2. **Selector overrides:** compile the selector check with auto-detection
   against GLES3 and desktop headers, then with `-DLM_GLES3=0` and
   `-DLM_GLES3=1`. Assert the expected macro value in each case.
3. **Desktop regression:** the selector check asserts `LM_GLES3 == 0` for
   desktop headers; build and run the upstream example under Xvfb/llvmpipe and
   confirm the `#version 150 core` shaders compile and the `glGetTexImage` bake
   progresses without GL errors.
4. **Shader probe:** `npm run test:shader` with `CHROME_SHELL_PATH` pointing at
   `chrome-headless-shell`; all 64 output texels pass on the bumped submodule.
5. **Readback probe:** `npm run test:readback`; all scenarios still pass, since
   the readback code itself is unchanged.
6. **Wrapper build:** with Emscripten 3.1.64, run `npm run configure:wasm`,
   `npm run build:wasm`, `npm run build:dist` and `npm run typecheck`. Confirm
   the single-file artifact layout is unchanged (no separate `.wasm`).
7. **Browser smoke bake:** run the demo bake in headless Chrome/ANGLE
   SwiftShader and confirm finite, non-uniform lighting with no new GL errors.
8. **Validator:** `npx @fission-ai/openspec@latest validate --all --strict`.

## Risks / Trade-offs

- **Consumers that include only GLES2 headers** now get the desktop branch and
  fail to compile instead of silently selecting a broken GLES3 path → document
  the include requirement and the `LM_GLES3` override in the header and README;
  the Emscripten shim already includes GLES3 headers.
- **`LM_GLES3` collides with a consumer macro** → use a namespaced name and
  document the 0/1 semantics; the override is opt-in.
- **EGL surfaceless is unavailable or lacks float render targets** → the build
  server has Mesa llvmpipe, `libEGL` and GLES3 headers; the test fails with a
  clear capability message rather than skipping. If the environment regresses,
  the compile-only selector check still catches the selection bug, but the
  native runtime proof is lost and must be restored before release.
- **The shader probe extracts the wrong branch** → the updated extractor
  asserts the `LM_GLES3` marker, the `#else` and the `#version 300 es` content,
  and the probe fails loudly on a missing marker.
- **A submodule bump pulls unrelated commits** → pin the smallest upstream
  commit containing the selector and test changes, review the diff, and re-run
  every check after the bump.
- **Desktop behavior regresses through the shared selector** → the desktop
  example and the compile-only `LM_GLES3 == 0` check both run before the bump is
  accepted.
- **No new public error or capability API is added** → a missing
  `EXT_color_buffer_float` still fails through the existing JS probe and the
  native test's clear message; this change does not expand the API surface.

## Migration Plan

There is no API or data migration. Consumers that compile the header against
GLES3 headers now get the ES path automatically; consumers that relied on
`__EMSCRIPTEN__` keep working because Emscripten's headers define
`GL_ES_VERSION_3_0`. Consumers with non-standard headers can define
`LM_GLES3=1`. Rollback is a revert of the submodule pointer and the probe
extractor change. The browser package behavior is unchanged.
