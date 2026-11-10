# WASM port improvements — findings and OpenSpec roadmap

**Status:** planning baseline
**Last updated:** 2026-11-09
**Sources:** `mode777/lightmapper` @ `72b69e9` (“add WASM support”),
`mode777/lightmapper-wasm` @ `f0fa005`, `mode777/libfive-wasm` @ `d59d540`
**Audience:** maintainers creating OpenSpec changes from this roadmap.

**Contents**

1. [Purpose](#1-purpose)
2. [Repository split and scope](#2-repository-split-and-scope)
3. [Current state](#3-current-state)
4. [Findings](#4-findings)
5. [How the wasm is loaded today](#5-how-the-wasm-is-loaded-today)
6. [Proposed OpenSpec change sequence](#6-proposed-openspec-change-sequence)
7. [Change details](#7-change-details)
8. [Non-goals](#8-non-goals)
9. [Creating the OpenSpec changes](#9-creating-the-openspec-changes)
10. [References](#10-references)

---

## 1. Purpose

This document records the review of the lightmapper WebAssembly port against
`libfive-wasm`, lists every suggested improvement with evidence, and proposes a
sequence of OpenSpec changes. It is the shared source of truth for the program;
the actual change proposals live under `openspec/changes/<name>/` and must
follow `openspec/config.yaml`.

`lightmapper-wasm` is the wasm product and the OpenSpec base. The C library is
the upstream submodule `thirdparty/lightmapper`; C-side changes are marked
`[lightmapper]` and are implemented upstream. A change that touches both must
state ownership per task.

---

## 2. Repository split and scope

| Repository | Owns | Not in scope here |
|---|---|---|
| `mode777/lightmapper-wasm` (this repo) | Emscripten CMake target, C shim, npm wrapper, loader, browser demo, package tests, publish workflow, baseline specs, ADRs and this roadmap | the C header’s internal rendering logic |
| `mode777/lightmapper` | `lightmapper.h`, the desktop example, the reference GLES3/WebGL2 path and the upstream C verification | npm packaging, Emscripten CMake build, JS loader, browser demo, release workflow |
| `mode777/libfive-wasm` | reference implementation for process, loader, packaging, tests and docs | not a dependency of lightmapper |

This repo consumes the C library as the `thirdparty/lightmapper` submodule. A
C-side change lands upstream first; this repo then bumps the submodule pointer
and re-runs verification. Wrapper-only improvements do not require a C change.

---

## 3. Current state

### 3.1 What already works

- `lightmapper.h` compiles as a single header for desktop GL 3.2 core and for
  Emscripten/GLES3. The ES path uses `#version 300 es` shaders and replaces
  `glGetTexImage` with an FBO attachment plus `glReadPixels`.
- `lightmapper-wasm` builds a browser module, registers an existing WebGL2
  context with Emscripten, enforces strict context binding, probes
  `EXT_color_buffer_float` and RGBA32F readback before loading, and ships a
  working gazebo browser demo.
- The wrapper exposes heap helpers, typed views, `lmBegin` frame buffers and
  wrappers for the public C functions.
- `[lightmapper]` The ES first-pass shader truncates `gl_FragCoord.xy` to the
  output texel before scaling, so each output texel samples its exact 6×2
  source block. `test/first-pass-sampling.mjs` (run with
  `npm run test:shader`) covers the origin and non-zero texels in headless
  WebGL2 (F1, upstream `5326e7c`).
- `[lightmapper]` The ES readback caches one framebuffer and one CPU staging
  buffer in `lm_context`, transfers only the written rows (clamped to the
  lightmap), restores distinct read/draw framebuffer bindings and the read
  buffer, and reports an incomplete framebuffer without aborting.
  `test/readback-state.mjs` (run with `npm run test:readback`) covers the
  multi-pass and forced-failure paths in headless WebGL2 (F2/F9, upstream
  `3013f2d`).
- `[lightmapper]` The GLES3 shader and readback path is selected from
  `GL_ES_VERSION_3_0` with an explicit `LM_GLES3` 0/1 override, not from
  `__EMSCRIPTEN__`. `test/run-native.sh` checks both selectors and runs an EGL
  surfaceless GLES3 smoke bake (F3, upstream `c111bb8`).
- The release build is configured with `CMAKE_BUILD_TYPE=Release`, `-O3`,
  `-DNDEBUG` and LTO. `npm run check:emsdk` enforces Emscripten 3.1.64 and
  `npm run report:artifact` prints the wasm size and SHA-256 plus the glue size
  (F4/F13).
- The default package entry resolves a separate `dist/lightmapper.wasm` through
  an explicit loader: `wasmBinary`/`locateWasm` precedence, `fetch` +
  `WebAssembly.instantiateStreaming` with an `ArrayBuffer` fallback, and the
  capability probe before any fetch. `lightmapper-wasm/single` (`dist/single.js`)
  keeps the embedded flavour. `npm run test:dist`, `npm run test:loader` and
  `npm run test:consumer` cover the dist layout, loader scenarios and a Vite
  6.4.5 consumer (F5, F12 packaging).
- The public showcase lives under `site/` and consumes the tested `dist`
  artifact with `lightmapper-wasm: file:..` (AD-015). It has seven procedural
  scenarios, an xatlas-everywhere UV pipeline with the `[0,1)` clamp (AD-016),
  an environment path for the bake skybox and display background (AD-017) that
  accepts checked-in HDRIs and generated procedural skies, a display-agnostic
  raw-WebGL bake harness, a three.js display layer, checked-in thumbnails and a
  `Main`-only Pages deployment. The harness and display stay site-local until
  `promote-bake-harness` and `add-three-adapter`.

### 3.2 What is missing or wrong

- The wrapper has no tests; CI only typechecks and publishes (F6).
- Types are handwritten and can drift; there is no generated ABI surface (F7).
- The docs describe the default separate asset and the optional single-file
  entry, but the package has no CHANGELOG, tag/version gate or packaged-docs
  check (F8).
- `[lightmapper]` The C example remains desktop-only (`glad`, GL 3.2,
  `#version 150 core`, unsized `GL_RGBA` + `GL_FLOAT` upload) (F10).
- The wrapper is `ENVIRONMENT=web` only; no workers; `engines.node >= 18`
  implies Node runtime support that does not exist (F11).
- The wrapper’s `build-dist.mjs` still patches Emscripten output with regexes;
  every replacement is now asserted, but a bundler-based assembly remains open
  (F12).
- The C fork still has no version/tag/changelog for consumers of the wasm path
  (F13).
- `[lightmapper]` The ES shader strings are duplicated and `lmCreate` still
  uses asserts for parameter validation (F14, minor); the duplicate
  `lmDestroy` delete is fixed.

---

## 4. Findings

Owner tags: `[lightmapper]` means upstream C work; everything else is owned by
this repository.

### F1 — WebGL2 first-pass shader sampled the wrong block (P0, `[lightmapper]`; fixed)

**Status:** Fixed in upstream `5326e7c` (“Fix GLES3 first-pass sample
coordinates”) and consumed by this repository’s submodule bump. The regression
probe is `test/first-pass-sampling.mjs`:

```sh
CHROME_SHELL_PATH=/path/to/chrome-headless-shell npm run test:shader
```

It renders the extracted ES shader against an asymmetric coordinate-encoding
source pattern and checks 64 output texels, including origin `(0, 0)`. Against
the old expression the probe fails with the expected `(3, 1)` shift; against
`5326e7c` it passes 64/64.

**Evidence:** `lightmapper.h` lines ~1269–1271 (Emscripten first-pass shader)
at the previous pin `72b69e9`.

The desktop shader declares `layout(pixel_center_integer) in vec4
gl_FragCoord;`, so at output texel `(x, y)` the fragment coordinate is
`(x, y)` and this code produces the block origin `(6x, 2y)`:

```glsl
vec2 in_uv = gl_FragCoord.xy * vec2(6.0, 2.0) + vec2(0.5);
ivec2 h_uv = ivec2(in_uv);
```

The ES branch correctly drops the desktop-only layout qualifier, but keeps the
same math. In GLES3/WebGL2, `gl_FragCoord.xy` is `(x + 0.5, y + 0.5)`, so the
result is `(6x + 3, 2y + 1)`: the 6×2 sample block is shifted three texels to
the right and one row up. The downsample shader already truncates first
(`ivec2(gl_FragCoord.xy) * 2`) and is correct, which makes the inconsistency
easy to spot.

**Fix:** truncate the fragment coordinate before scaling:

```glsl
ivec2 h_uv = ivec2(gl_FragCoord.xy) * ivec2(6, 2);
ivec2 w_uv = ivec2(mod(vec2(h_uv), vec2(textureSize(weights, 0))));
```

**Impact:** baked lighting in the npm package was wrong; this was not an API
or build issue. The shader probe now catches a regression, and change 7
(`wasm-verification`) will add the packaged golden bake with an asymmetric
scene.

### F2 — Readback asserts and clobbers framebuffer state (P0/P1, `[lightmapper]`; fixed)

**Status:** Fixed in upstream `3013f2d` (“Harden WebGL2 readback and reuse
staging resources”) and consumed by this repository’s submodule bump.
`npm run test:readback` covers repeated readbacks, distinct read/draw binding
restoration, read-buffer restoration, the incomplete-framebuffer failure path
and teardown in headless WebGL2. The evidence below records the previous
defect.

**Evidence:** `lightmapper.h` lines ~714–735 (ES readback), `lmDestroy` lines
~1428–1438.

- `assert(glCheckFramebufferStatus(GL_FRAMEBUFFER) == GL_FRAMEBUFFER_COMPLETE)`
  aborts in assertion-enabled builds and disappears under `NDEBUG`, leaving
  `glReadPixels` to raise `INVALID_FRAMEBUFFER_OPERATION`.
- The code saves `GL_FRAMEBUFFER_BINDING` (the draw binding alias) and restores
  with `glBindFramebuffer(GL_FRAMEBUFFER, prev)`, so a distinct read framebuffer
  binding is lost. Save `GL_READ_FRAMEBUFFER_BINDING` and
  `GL_DRAW_FRAMEBUFFER_BINDING` separately.
- The readback framebuffer is created and deleted on every pass; cache it in
  `lm_context`.
- `lmDestroy` deletes `storage.texture` twice. Harmless with GL’s delete
  semantics, but it hides cleanup bugs.

### F3 — GLES3 path is tied to Emscripten (P1, `[lightmapper]`; fixed)

**Status:** Fixed in upstream `c111bb8` (“Select GLES3 path by capability”)
and consumed by this repository’s submodule bump. `test/run-native.sh` checks
the `GL_ES_VERSION_3_0` auto-detection, the explicit `LM_GLES3` override and an
EGL surfaceless GLES3 smoke bake; the desktop example remains on
`#version 150 core` / `glGetTexImage`. The evidence below records the previous
defect.

**Evidence:** `#if defined(__EMSCRIPTEN__)` at lines ~714, ~1239, ~1339.

Native Android/iOS/other wasm runtimes compile GLES3 but take the desktop
`#version 150 core` and `glGetTexImage` path. Select the ES path from
`GL_ES_VERSION_3_0` (or an explicit `LM_GLES3`) and keep `__EMSCRIPTEN__` only
for Emscripten-specific integration.

### F4 — Wrapper build was unoptimised (P0 build, this repo; fixed)

**Status:** Fixed in `wasm-release-build`. `configure:wasm` selects
`CMAKE_BUILD_TYPE=Release`, the release compiles with `-O3 -DNDEBUG`, and
`-flto` is enabled through `LM_WASM_LTO` (default ON). The release artifact
reports **44,136 bytes** of embedded wasm (was 98,112), a **90,437-byte**
`.mjs` (was 230,583) and a **107,484-byte** `dist/index.js` (was 247,630).
`npm run report:artifact` prints the wasm size and SHA-256, and two clean
rebuilds produced the same digest.

**Evidence (previous defect):** `wasm/CMakeLists.txt`, `package.json`
scripts, local build.

- `configure:wasm` never set `CMAKE_BUILD_TYPE`.
- `build:wasm` ran `cmake --build ... --config Release`, which Unix Makefiles
  ignore. Compile flags were empty; no `-O3`, no `-DNDEBUG`.
- The old embedded wasm was **98,112 bytes**; the `-O3 -flto` rebuild is
  **44,136 bytes** (~55% smaller).
- `-sUSE_WEBGL2=1` was deprecated (it only sets `MAX_WEBGL_VERSION=2`) and
  redundant with `-sMIN_WEBGL_VERSION=2`; it is now removed.

### F5 — Base64-inlined wasm instead of a loadable asset (P1; fixed)

**Status:** Fixed in `separate-wasm-loader`. The default build emits a
32,031-byte glue `.mjs` beside a 44,136-byte `lightmapper_wasm.wasm` (SHA-256
`8d26a4c4eb52ab00e2240e80ca9f61940c0048be3a38a60ef97dbcb5bdfc284e`);
`dist/index.js` is 53,648 bytes (was 107,484) and resolves `./lightmapper.wasm`
through the literal `new URL(..., import.meta.url)`. `dist/single.js`
(112,073 bytes) keeps the embedded flavour behind `lightmapper-wasm/single`.
`npm run test:loader` checks exactly one asset fetch, supplied bytes win with
zero requests, `locateWasm` failure naming and probe-before-fetch ordering;
`npm run test:dist` checks the assembled layout; `npm run test:consumer` packs
the tarball and proves a Vite 6.4.5 build emits exactly one hashed `.wasm`
asset, byte-identical to the package asset.

**Evidence (previous defect):** `-sSINGLE_FILE=1` in `wasm/CMakeLists.txt`;
`scripts/build-dist.mjs` prepends the Emscripten source to `src/index.js`.

- No `.wasm` is emitted, so there is no streamable or cacheable binary asset.
- `WebAssembly.instantiateStreaming` cannot be used.
- The JS bundle is ~107 KB for a ~44 KB (optimised) wasm; base64 adds ~33%
  plus the Emscripten runtime.
- `wasmModuleOptions.locateFile` is a no-op with a data-URI binary.
- No HTTP cache entry keyed to the wasm artifact.

### F6 — No verification (P0 process)

The wrapper has no `test` script and no tests. CI (`publish.yml`) builds,
typechecks and publishes. There is no smoke bake, no golden lightmap, no
capability-failure test, no packaged-consumer test. F1 is exactly the class of
bug this would catch.

### F7 — Handwritten types and ABI drift (P2)

`types/index.d.ts` is maintained by hand alongside `src/index.js` and the C
shim. Nothing fails when a function signature, an
export name or a struct layout changes. `libfive-wasm` generates its stdlib
surface from the C header and drift-checks it in the build.

The wrapper now exposes a built-in `lmSetCosineWeights` shim over
`lmSetHemisphereWeights` (see AD-020), but arbitrary callback weights and the
TGA helpers (filesystem disabled) remain omitted. A complete API should either
expose callback-based weights with `addFunction` and TGA as a byte array, or
document the omission and the supported alternative.

### F8 — No release record; docs were stale (P1)

The artifact-layout and `locateFile` documentation has been corrected for the
current `SINGLE_FILE` build, and the upstream C README now points to this
repository’s roadmap. Remaining:

- No `CHANGELOG.md` and no tag/version gate for the package.
- No packaged-consumer check that `LIGHTMAPPER.md`/`WASM_SETUP.md` are present
  in the tarball and their links resolve.

### F9 — Readback cost and heap churn (P2, `[lightmapper]`; fixed)

**Status:** Fixed in upstream `3013f2d`. The CPU staging buffer and readback
FBO are cached per context, the buffer grows only when a larger lightmap is
used, and the transfer reads only
`min(writePosition.y + fbHemiCountY, lightmap.height)` rows. The readback probe
records 16-row transfers on a 64×64 multi-pass bake (previously 64 rows) and a
clamped 64-row transfer for a full-height `-DNDEBUG` bake.

`lm_writeResultsToLightmap` previously allocated `width * height * 4` floats
every pass and read the full storage texture, although the final loop only
consumed rows up to `writePosition.y + fbHemiCountY`. For a 2048² lightmap that
was 64 MB per pass.

### F10 — Desktop example is not a wasm reference (P2, `[lightmapper]`)

`example/example.c` still includes `glad/glad.h`, requests GL 3.2 core, uses
`#version 150 core`, uploads the lightmap with `GL_RGBA` + `GL_FLOAT`, and
reads `gazebo.obj` through `fopen`. None of that works under Emscripten
without a port. `lightmapper-wasm` has a separate browser example; the C repo’s
example should either gain an Emscripten branch or explicitly document that it
is desktop-only and point at the wrapper demo.

### F11 — Browser main thread only (P2)

`-sENVIRONMENT=web` excludes Web Workers. Baking is long-running and a natural
worker task, but it needs `OffscreenCanvas` plus Emscripten context
registration in the worker. `package.json` declares `engines.node >= 18`, but
the package cannot create a WebGL2 context in Node. Either support workers or
document the limitation and fix the engine claim.

### F12 — Fragile packaging script (P2; partially fixed)

**Status:** Partially fixed in `separate-wasm-loader`. `scripts/build-dist.mjs`
uses an `assertReplace` helper that exits non-zero and names the replacement
when a pattern matches zero or multiple times, and `npm run test:consumer`
proves the Vite path. The remaining open item is replacing the regex patches
with a bundler-based assembly.

**Evidence (previous defect):** `scripts/build-dist.mjs` removed constants and
replaced a dynamic import with three regexes. If Emscripten changed its output
formatting, the replacements failed silently and the package could ship a
broken entry point. The source path `../build/wasm/wasm/lightmapper_wasm.mjs`
only works inside the repo; the dist patch is the only thing that makes the
package usable.

### F13 — Pin/version hygiene (P2; partially fixed)

**Status:** CI pins `setup-emsdk` to 3.1.64 and `npm run check:emsdk` rejects
any other `emcc` before configure/build. `.gitmodules` now uses the canonical
`https://github.com/mode777/lightmapper.git` URL. The C fork still has no tag
or changelog for the wasm commit.

- Fixed: CI used `setup-emsdk@v14` with `latest` and had no version assertion.
- Open: the C fork has no tag or changelog for the wasm commit.
- Fixed: `.gitmodules` recorded `https://mode777@github.com/mode777/lightmapper`;
  it now uses the canonical URL without userinfo.

### F14 — Minor cleanup (P3, `[lightmapper]`; partially fixed)

- Duplicate `glDeleteTextures` of `storage.texture` in `lmDestroy` — fixed in
  `3013f2d`; the readback FBO and staging buffer are released there too.
- Nearly identical first-pass/downsample shader strings duplicated between the
  desktop and ES branches; a shared prologue would keep the coordinate math in
  one place.
- `lmCreate` uses `assert` for parameter validation; release builds with
  `NDEBUG` lose those checks.

---

## 5. How the wasm is loaded today

### 5.1 libfive-wasm (reference)

1. `scripts/build-wasm.sh` links a separate `dist/libfive.wasm` and
   `dist/libfive.js` with `MODULARIZE=1`, `EXPORT_ES6=1`,
   `EXPORT_NAME=createLibfiveModule`, `ENVIRONMENT=web,node,worker` and
   `--no-entry`.
2. `scripts/build-js.mjs` esbuild-bundles `src/index.ts` with the Emscripten
   glue inlined into `dist/index.js`; the `.wasm` remains a sibling asset.
3. `init(options)` dynamically imports `./libfive.js` relative to
   `import.meta.url`.
4. The glue resolves `libfive.wasm` with
   `new URL("libfive.wasm", import.meta.url)`. Node uses
   `createRequire`/`fs`; the browser uses `fetch` +
   `WebAssembly.instantiateStreaming` with an ArrayBuffer fallback.
5. `wasmBinary` wins over resolution; `locateWasm` maps to `locateFile`;
   failures become `LibfiveError`. Every `init()` gets an independent heap.

### 5.2 lightmapper-wasm (current)

1. `npm run configure:wasm` / `build:wasm` run CMake + Emscripten with
   `-sMODULARIZE=1`, `-sEXPORT_ES6=1`, `-sENVIRONMENT=web`, `-sFILESYSTEM=0`,
   `-sMIN_WEBGL_VERSION=2`, `-sMAX_WEBGL_VERSION=2`. `SINGLE_FILE` is not set
   by default, so `build/wasm/wasm/` contains `lightmapper_wasm.mjs` beside
   `lightmapper_wasm.wasm`. The opt-in `configure:wasm:single` /
   `build:wasm:single` build in `build/wasm-single` adds `-sSINGLE_FILE=1` and
   emits one `.mjs` with no `.wasm`.
2. `scripts/build-dist.mjs` inlines the default glue into `src/index.js`,
   copies the emitted binary to `dist/lightmapper.wasm`, writes `dist/index.js`
   + `dist/index.d.ts`, and assembles the single-file entry `dist/single.js` +
   `dist/single.d.ts` from the single-flavour build. Every textual replacement
   is asserted.
3. `createLightmapperModule(options)` resolves the wasm bytes in this order:
   `wasmModuleOptions.wasmBinary` → `options.wasmBinary` → skip for the
   single-file marker or a custom `moduleFactory` → `options.locateWasm` → the
   default `new URL("./lightmapper.wasm", import.meta.url)` beside the entry.
   The loader `fetch`es the location, prefers
   `WebAssembly.instantiateStreaming` and falls back to `arrayBuffer()` +
   `WebAssembly.instantiate`; failures name the URL and status. The published
   entry keeps the literal `new URL(...)` form so bundler asset plugins emit
   the asset.
4. `createLightmapperModule(options)` also resolves a WebGL2 context, probes
   `EXT_color_buffer_float` + RGBA32F readback (before any fetch), loads the
   factory (source dynamic import or inlined), registers the context with
   Emscripten and makes it current. `strictContextBinding` checks the current
   handle before each GL-dependent call.

### 5.3 Assessment

`libfive-wasm`’s loader is more flexible and standard: separate asset,
streaming, caching, Node and workers, explicit bytes/URL escape hatches.
`lightmapper-wasm` now follows the same shape for the browser: a separate
`lightmapper.wasm`, streaming with an `ArrayBuffer` fallback, and
`wasmBinary`/`locateWasm` escape hatches, with `SINGLE_FILE` retained only as
the optional `lightmapper-wasm/single` entry. Node and worker support remain
open (AD-006/AD-013).

---

## 6. Proposed OpenSpec change sequence

The order is risk-first and keeps every change independently reviewable. Names
are the intended kebab-case change names.

| # | Change | Owner | Depends on | Status | Goal |
|---|---|---|---|---|---|
| 1 | `fix-webgl2-hemisphere-sampling` | `lightmapper` (upstream) | — | Implemented (`5326e7c`) | Correct the first-pass shader under GLES3 `gl_FragCoord` |
| 2 | `harden-webgl2-readback` | `lightmapper` (upstream) | 1 | Implemented (`3013f2d`) | Graceful FBO readback, state preservation, cached resources |
| 3 | `portable-gles3-path` | `lightmapper` (upstream) | 1, 2 | Implemented (`c111bb8`) | Select GLES3 by capability; document the extension requirement |
| 4 | `wasm-release-build` | this repo | 1–3 | Implemented (44,136-byte wasm) | `-O3`/LTO release build, pinned Emscripten, artifact digest |
| 5 | `separate-wasm-loader` | this repo | 4 | Implemented (separate 44,136-byte asset + `./single`) | Separate `.wasm`, `init` options, asset resolution |
| 6 | `worker-support` | this repo | 5 | Proposed | `OffscreenCanvas` workers or an explicit limitation |
| 7 | `wasm-verification` | this repo | 4, 5 | Proposed | Headless WebGL2 smoke, golden bake, package consumer |
| 8 | `typed-wasm-api` | this repo | 5 | Proposed | Generated types, error class, heap validation, lifecycle |
| 9 | `wasm-release-docs` | both | 1–8 | Proposed | CHANGELOG, tag gate, docs, vendor pin, example cleanup |
| 10 | `add-showcase-site` (AD-015, AD-016) | this repo | 5 | Implemented | Gallery, xatlas-everywhere UVs, bake harness, three.js display, Pages deploy |
| 11 | `add-hdri-environment-baking` (AD-017) | this repo | 10 | Implemented (two 1k Poly Haven HDRIs) | Environment skybox, studio and outdoor HDRI scenarios |
| 12 | `add-sun-sky-outdoor-lighting` | this repo | 10, 11 | Implemented (procedural sky + sun disk) | Non-HDRI outdoor scenario with a directional sun and generated sky |
| 13 | `improve-outdoor-sun-lighting` (AD-020) | this repo | 10–12 | Implemented (cosine weights + well-sampled bake sun) | Replace multi-lobed outdoor sun sampling with a soft area-light response |
| 14 | `promote-bake-harness` (AD-018) | this repo | 10, 11, 12, 13 | Planned | `lightmapper-wasm/bake` package entry |
| 15 | `add-three-adapter` (AD-019) | this repo | 14 | Planned | Optional `lightmapper-wasm/three` package entry |

Changes 1–3 are upstream C work: this repo tracks them, includes the
`[lightmapper]` tasks and bumps the submodule to the commit that contains the
fix. Changes 4 and 5 are implemented here; changes 6–8 remain proposed. Change
9 spans both and is the final documentation/release gate. Changes 10–13 are the
implemented showcase sequence; changes 14–15 are the planned harness/display
promotions.

---

## 7. Change details

### 7.1 `fix-webgl2-hemisphere-sampling` — upstream `[lightmapper]`

**Status:** Implemented in upstream `5326e7c` and consumed by this
repository’s submodule bump.

**Goal:** make the ES first-pass shader’s sample coordinates exact.

**Why:** finding F1; the shift produced incorrect lighting and is now removed.

**Scope:** upstream `lightmapper.h` ES first-pass shader; add a comment
explaining the half-integer rule; optionally factor the shared shader prologue
to avoid duplicating the coordinate math. This repo consumes the fix with a
submodule bump and a verification run.

**Acceptance:**
- `ivec2(gl_FragCoord.xy) * ivec2(6, 2)` is used before scaling.
- The block origin at output `(x, y)` is `(6x, 2y)` for `x, y` across the
  integration viewport, including `x = 0` and `y = 0`.
- The desktop shader path is byte-for-byte behaviorally unchanged.
- A deterministic check exists in `wasm-verification` (change 7) or a local
  shader-math test before that change lands.

**Verification:**
- `npm run test:shader` passes 64/64 output texels on `5326e7c`; against the
  old expression it fails at origin `(0, 0)` with actual origin `(3, 1)`.
- The desktop first-pass shader block hash is unchanged
  (`a457cd2f0cc3d7c038c68d4e254d07a2ac27f527ad792936dfea4499d2267558`).
- The upstream desktop example builds and starts baking under Xvfb/llvmpipe
  with no shader compile errors.
- The Emscripten 3.1.64 wasm build, `build:dist`, `typecheck` and the browser
  demo bake (730 triangles, one bounce) complete on the bumped submodule.

**ADR footprint:** implements no new decision; clarifies AD-003. No ADR was
added or superseded (AD-002 desktop behavior is preserved).

**Regression note:** the probe is `test/first-pass-sampling.mjs`; it is wired
to `npm run test:shader` and uses `CHROME_SHELL_PATH` with ANGLE SwiftShader.

**Capability delta:** `c-library-port` — clarify the sampling requirement with
the exact block-origin scenario (already recorded in the baseline spec).

### 7.2 `harden-webgl2-readback` — upstream `[lightmapper]` (implemented)

**Status:** Implemented in upstream `3013f2d` (“Harden WebGL2 readback and
reuse staging resources”) and consumed by this repository’s submodule bump.
The probe is `test/readback-state.mjs` (`npm run test:readback`).

**Goal:** fail gracefully and preserve caller GL state during readback.

**Why:** finding F2 and F9.

**Scope:** upstream `lightmapper.h` `lm_writeResultsToLightmap`, `lmDestroy`,
the `lm_context` fields for a cached readback FBO/scratch buffer. This repo
consumes the fix with a submodule bump and a verification run.

**Acceptance:**
- A failed `glCheckFramebufferStatus` returns/logs a clear error; no assert-only
  path.
- `GL_READ_FRAMEBUFFER_BINDING` and `GL_DRAW_FRAMEBUFFER_BINDING` are saved and
  restored separately, along with `GL_READ_BUFFER`.
- The readback FBO and scratch buffer are allocated once per context (or
  resized only when the lightmap or batch size changes).
- Only rows up to `writePosition.y + fbHemiCountY` are read; the unused rows
  are not transferred.
- `lmDestroy` deletes `storage.texture` once.
- Desktop `glGetTexImage` behavior is unchanged.

**ADR footprint:** implements AD-011 (proposed). Add the ADR status update and
the `docs/wasm-improvements.md` status.

**Capability delta:** `c-library-port` — add the readback-state requirement and
scenario.

### 7.3 `portable-gles3-path` — upstream `[lightmapper]` (implemented)

**Status:** Implemented in upstream `c111bb8` (“Select GLES3 path by
capability”) and consumed by this repository’s submodule bump.

**Goal:** make the GLES3 path usable outside Emscripten.

**Why:** finding F3.

**Scope:** the three `#if defined(__EMSCRIPTEN__)` selections in upstream
`lightmapper.h`; add `GL_ES_VERSION_3_0`/`LM_GLES3` detection; document the
`EXT_color_buffer_float` requirement near the ES path. This repo consumes the
fix with a submodule bump and a verification run.

**Acceptance:**
- Compiling against GLES3 headers without Emscripten selects `#version 300 es`
  and FBO readback.
- Compiling against desktop GL 3.2 headers selects the desktop path.
- `__EMSCRIPTEN__` is used only for Emscripten-specific integration, not for
  GLSL/readback selection.
- The desktop example still builds on a desktop GL 3.2 context.

**Verification:** `test/run-native.sh` in the upstream submodule checks the
selectors and runs the EGL surfaceless GLES3 smoke bake; the wrapper probes and
the headless browser bake are re-run after the bump.

**ADR footprint:** implements AD-007 (Proposed → Accepted).

**Capability delta:** `c-library-port` — add the portable-detection requirement
and scenarios.

### 7.4 `wasm-release-build` — this repo (implemented)

**Status:** Implemented. `configure:wasm` selects Release, `-O3 -DNDEBUG` and
`-flto`; `check:emsdk` enforces Emscripten 3.1.64; `report:artifact` prints the
embedded wasm size and SHA-256; CI pins 3.1.64 and `.gitmodules` uses the
canonical URL. The release artifact is a 44,136-byte wasm (was 98,112), a
90,437-byte `.mjs` (was 230,583) and a 107,484-byte `dist/index.js` (was
247,630); two clean rebuilds produced the same digest.

**Goal:** produce a small, optimized, reproducible wasm artifact.

**Why:** finding F4, F6, F13.

**Scope:** `wasm/CMakeLists.txt`, `package.json` scripts, CI workflow,
`.gitmodules` URL, artifact reporting.

**Acceptance:**
- `configure:wasm` sets `CMAKE_BUILD_TYPE=Release` (or explicit `-O3`);
  `-flto` is evaluated for release.
- The build script asserts Emscripten 3.1.64 and prints the wasm SHA-256 and
  size.
- CI installs the pinned version, not `latest`.
- The produced wasm is measurably smaller than the current 98 KB artifact and
  the improvement is recorded.
- The submodule URL uses `https://github.com/mode777/lightmapper.git`; the
  pinned commit is recorded.
- Debug/release flavours are documented; release uses `-DNDEBUG` and the F2
  error handling is in place first.

**ADR footprint:** implements AD-008 (now Accepted); supports AD-004.

**Capability delta:** `wasm-build-pipeline` requirements for the release
build, debug flavour, toolchain pin, artifact report and WebGL2 flags.

### 7.5 `separate-wasm-loader` — this repo

**Status:** Implemented. The default build and published entry load a separate
`dist/lightmapper.wasm` (44,136 bytes, SHA-256
`8d26a4c4eb52ab00e2240e80ca9f61940c0048be3a38a60ef97dbcb5bdfc284e`) beside
`dist/index.js` (53,648 bytes, from 32,031-byte glue); the opt-in single-file
flavour still publishes `lightmapper-wasm/single` (`dist/single.js`,
112,073 bytes). `build-dist` asserts every replacement and fails naming the
missing one. The loader implements the `wasmBinary`/`locateWasm` precedence,
`fetch` + `WebAssembly.instantiateStreaming` with an `ArrayBuffer` fallback,
and the probe-before-fetch order. Verified with `test:dist` (10 layout checks),
`test:loader` (5 headless scenarios), `test:consumer` (npm pack → Vite 6.4.5 →
one hashed `.wasm` asset byte-identical to the package asset) and
`report:artifact`. D3 records the bundler finding: the published entry must use
the literal `new URL("./lightmapper.wasm", import.meta.url)` because asset
plugins only rewrite literal expressions.

**Goal:** ship `dist/lightmapper.wasm` beside the ES module and load it through
an explicit async API.

**Why:** finding F5, F8.

**Scope:** CMake flags (`SINGLE_FILE=0` default), build-dist, `src/index.js`
(loader), `package.json` `files`/`exports`, README/WASM_SETUP/API docs.

**Acceptance:**
- `dist/` contains a separate `.wasm` and a JS entry that resolves it via
  `new URL('./lightmapper.wasm', import.meta.url)`.
- `createLightmapperModule` accepts `wasmBinary` (bytes win) and `locateWasm`
  (maps to Emscripten `locateFile`), plus the existing context options.
- Browser uses `fetch` + `WebAssembly.instantiateStreaming` with an ArrayBuffer
  fallback; Node path is either supported or explicitly out of scope.
- A single-file build remains available as an optional entry and its docs do
  not claim a separate `.wasm`.
- A Vite/webpack consumer test proves the asset is emitted and loaded.

**ADR footprint:** implements AD-009 (now Accepted); supersedes the implicit
“inline-only” packaging behavior.

**Capability delta:** new `wasm-loader`/`npm-package` capabilities here.

### 7.6 `worker-support` — this repo

**Goal:** make baking usable off the main thread, or state the limitation.

**Why:** finding F11.

**Scope:** Emscripten `ENVIRONMENT=web,worker`, context registration options,
worker example/test, README/engine fields.

**Acceptance:**
- If supported: a worker creates an `OffscreenCanvas` WebGL2 context, registers
  it, bakes, and transfers the lightmap back; the capability probe runs in the
  worker.
- If not supported: README, `WASM_SETUP.md` and `package.json` say
  main-thread-only; `engines.node` does not imply Node rendering support.
- The chosen behavior is covered by a test or an explicit documented
  limitation.

**ADR footprint:** implements AD-013 (proposed).

### 7.7 `wasm-verification` — this repo (with upstream C goldens)

**Goal:** catch rendering, loader and packaging regressions automatically.

**Why:** finding F6; F1 would have been caught by an asymmetric golden.

**Scope:** new test scripts, CI workflow, golden data, headless Chrome/ANGLE
SwiftShader setup, package consumer test.

**Acceptance:**
- A headless WebGL2 smoke test creates a context, checks
  `EXT_color_buffer_float`, initializes the module, bakes a tiny scene and
  asserts non-zero finite output.
- A golden test bakes a fixed asymmetric scene at fixed parameters and compares
  a lightmap hash; the capture procedure is documented and the goldens are
  checked in.
- Failure tests cover: no WebGL2, missing `EXT_color_buffer_float`, wrong
  current context, invalid pointers/strides, missing wasm asset.
- A package consumer test packs the tarball, installs it in a scratch Vite
  project and runs `createLightmapperModule` + a bake.
- CI runs all suites on every push/PR; the artifact digest is reported.

**ADR footprint:** implements AD-010 (proposed).

**Capability delta:** new `wasm-verification` capability here; the upstream
`lightmapper` change contributes the shader/golden scene requirements.

### 7.8 `typed-wasm-api` — this repo

**Goal:** make the JS surface type-safe, harder to misuse and easier to adopt.

**Why:** finding F7 and the manual-pointer API.

**Scope:** generate `index.d.ts` from the C shim/header or add ABI/type tests;
add `LightmapperError`; validate heap bounds, strides, counts and sizes;
add allocation tracking/`FinalizationRegistry`; add a high-level `bake()`
convenience while keeping the low-level API.

**Acceptance:**
- A signature/export change fails a generated-types or ABI test.
- `createTypedView`, `copyFromHeap`, `lmSetGeometry` and `lmCreate` reject
  out-of-bounds/invalid inputs with `LightmapperError` before entering wasm.
- Leaked pointers are reported in debug mode; explicit `free()` remains
  idempotent.
- A `bake()` helper accepts typed arrays and returns a lightmap plus stats;
  the low-level functions remain available.
- Tests cover the error and lifecycle paths.

**ADR footprint:** implements AD-012 (proposed); supports AD-001.

### 7.9 `wasm-release-docs` — both repos

**Goal:** make the wasm path release-ready and self-describing.

**Why:** findings F8, F10, F13, F14; missing changelog/release gate.

**Scope:** this repo’s README/WASM_SETUP/LIGHTMAPPER docs and CHANGELOG; the
tag/version gate; the upstream `lightmapper` example and README; the vendor pin;
ADR/roadmap status.

**Acceptance:**
- This repo’s README has an accurate status/build/loading section with the
  Emscripten version, WebGL2 + `EXT_color_buffer_float` requirement, artifact
  layout and a link to the roadmap.
- `WASM_SETUP.md` matches the actual artifact layout and no longer advertises a
  missing `.wasm` or a no-op `locateFile`.
- The upstream `lightmapper` README points to this repo’s roadmap; its
  `example/` is either ported to Emscripten (GLES3 shaders, no glad, preloaded
  obj, `GL_RGBA32F` upload) or explicitly marked desktop-only with the browser
  example as the reference.
- The package has a `CHANGELOG.md`, a tag/version gate and a
  `publishConfig`/provenance path consistent with `libfive-wasm`.
- The published tarball includes `LIGHTMAPPER.md` and `WASM_SETUP.md` so the
  README’s relative documentation links resolve for npm consumers.
- `docs/decisions.md` and `docs/wasm-improvements.md` describe the implemented
  state; no roadmap item is marked done before its acceptance criteria pass.
- The submodule URL and pin are canonical.

**ADR footprint:** updates AD-004/AD-008/AD-009 statuses; adds a release ADR if
the package adopts a tag gate.

### 7.10 `add-showcase-site` — this repo (implemented)

**Status:** Implemented. The site is a private Vite + TypeScript consumer under
`site/`; it is not part of the npm tarball and adds no runtime dependency to
the root package.

**Goal:** give the package a public product surface and prove the recommended
multi-object/shared-atlas workflow with a reusable bake path.

**Why:** there was no gallery and every demo repeated the same GL setup,
lightmap allocation, bounce loop and readback plumbing.

**Scope:** `site/` (gallery, seven scenarios, xatlas unwrap, raw-WebGL bake
harness, three.js display, preview/atlas/code views, thumbnails and tests),
the build workflow's dist artifact, a site job and a `Main`-only Pages deploy.

**Acceptance:**
- `ao-studio`, `cornell-box`, `emissive-alcove`, `tabletop-atlas`,
  `hdri-studio`, `hdri-outdoor` and `sun-sky-outdoor` build procedurally and
  share the catalog metadata contract.
- Every lit mesh is packed into one xatlas atlas; positions/normals are copied
  through `xref`; normalized UVs are clamped below `1.0`; emitters are not in
  the atlas.
- The harness bakes a shared atlas with one GPU upload per bounce, reports
  monotonic progress, yields, cancels and returns finite statistics.
- The display consumes the bake result as a linear `THREE.DataTexture` and
  never bakes.
- Preview routes hide page chrome, use a 16:10 stage and complete a draft bake;
  checked-in thumbnails carry source hashes and a preview version.
- The site build with `SITE_BASE=/lightmapper-wasm/` emits hashed
  `lightmapper.wasm` and `xatlas.wasm` assets and the build check references
  both.
- CI runs the site typecheck, unit tests, harness test, smoke bake, production
  build and build check from the tested `dist` artifact.

**Verification:** `npm run check --prefix site`, `npm test --prefix site`,
`npm run test:harness --prefix site`, `npm run test:smoke --prefix site`,
`SITE_BASE=/lightmapper-wasm/ npm run build --prefix site` and
`SITE_BASE=/lightmapper-wasm/ npm run build:check --prefix site`.

**ADR footprint:** adds AD-015 (separate showcase consumer deployed from the
tested artifact) and AD-016 (xatlas-everywhere lightmap UVs); implements
AD-004, AD-006 and AD-009 and respects AD-013.

### 7.11 `add-hdri-environment-baking` — this repo (implemented)

**Status:** Implemented. The site-local harness accepts an optional linear
equirectangular HDRI, draws it as a fullscreen skybox for every lightmapper
hemisphere side, and uses the full decoded data for the three.js background.
The bake uses a 128 × 64 prefiltered irradiance copy of the same source. The
checked-in assets are Poly Haven's CC0 `studio_small_09` and
`kloofendal_48d_partly_cloudy` 1k HDRs; the site serves them from its own
origin and the refresh script verifies their sizes/MD5s through the Poly Haven
API.

**Goal:** prove environment-only studio and outdoor lighting and give the
showcase two more techniques.

**Why:** the gallery could only bake constant ambient/emissive lighting, while
HDRI environments are the common way studio and product scenes are lit.

**Scope:** `site/src/bake/` (environment input, shaders, ray helper, texture
lifecycle, interpolation and smoothing controls), `site/src/environment/hdr.ts`
(HDRLoader decode, bottom-up normalization, prefiltered bake irradiance,
full-resolution display texture), `site/src/display/` (HDRI background),
`site/src/demos/hdri-studio.ts`, `site/src/demos/hdri-outdoor.ts`, the
`environment` section, the gallery attribution/navigation copy, the checked-in
HDRIs and provenance, tests, thumbnails, README/config/ADR updates. No C or
package changes.

**Acceptance:**
- A constant environment with black ambient and no emitters produces a finite,
  non-zero lightmap; a black environment stays black.
- Environment intensity scales the result; top/bottom orientation matches the
  display background; invalid dimensions/length/non-finite/negative values are
  rejected with a clear error.
- The environment texture and VAO are released on success, failure and
  cancellation.
- `hdri-studio` has six lit meshes and `hdri-outdoor` has eight lit meshes;
  both have no emitters, black ambient and a 512²/H32 two-bounce preset, and
  their preview bakes complete in headless SwiftShader.
- The raw 1k softbox/sun detail does not produce large diamond artifacts: the
  bake uses a prefiltered irradiance copy, one fine interpolation pass and
  twelve smoothing passes, verified by a headless stage capture.
- The site emits and references both hashed HDRIs, and never requests Poly
  Haven at runtime.
- The gallery lists seven scenarios with an `environment` filter (including
  the two HDRI scenarios and the procedural-sky scenario), attributes
  `lightmapper.h` with an upstream link, and does not feature an individual
  scenario in the global navigation or hero.

**Verification:** `npm run check --prefix site`, `npm test --prefix site`,
`npm run test:harness --prefix site`, `npm run test:smoke --prefix site`,
`SITE_BASE=/lightmapper-wasm/ npm run build --prefix site`,
`SITE_BASE=/lightmapper-wasm/ npm run build:check --prefix site` and
`npm run verify:remote`.

**ADR footprint:** adds AD-017 (HDRI environment baking in the showcase);
implements AD-015/AD-016 and AD-009 and respects AD-006/AD-013. It does not
supersede an accepted ADR.

### 7.12 `add-sun-sky-outdoor-lighting` — this repo (implemented)

**Status:** Implemented. The showcase has a seventh scenario,
`sun-sky-outdoor`, which uses a generated linear equirectangular procedural sky
instead of a checked-in HDRI. The sky is a zenith/horizon/ground gradient with
a soft-edged sun disk; the sun disk provides the directional direct light and
shadows, and the gradient provides sky fill. The scene has black ambient and no
emissive meshes, and the environment is generated deterministically at runtime
with no asset request. The `environment` section now covers both checked-in
HDRI and procedural-sky scenes.

**Goal:** prove a non-HDRI outdoor workflow and give the gallery a directional
sun-and-sky reference.

**Why:** the environment path was only exercised with Radiance files, while a
generated sky is the lightweight alternative when an HDRI is too large,
unavailable or unnecessary.

**Scope:** `site/src/environment/sky.ts` (procedural descriptor, validation,
bottom-up RGBA generation, sun disk, display texture), `site/src/demos/types.ts`
(the `kind: "hdr"` / `kind: "sky"` environment union), `site/src/demo-page.ts`
(environment-kind resolution), `site/src/demos/sun-sky-outdoor.ts`, the
`environment` section text, catalog/source/coverage registration, generator and
scene tests, harness/smoke checks, thumbnails, README and this roadmap. No C,
package, loader or build-workflow changes.

**Acceptance:**
- The gallery lists seven scenarios and `sun-sky-outdoor` appears in the
  environment filter with a preview route and thumbnail.
- The scene has lit meshes only, black ambient and no checked-in HDRI; a bake
  is non-black because of the generated sky and sun, and the page requests no
  `.hdr` file.
- The generator writes bottom-up linear RGBA data with the zenith at the top
  row, the ground at the bottom row and a bright sun disk at the declared
  direction; identical descriptors produce identical data; invalid dimensions,
  colors, intensities, directions and angular radii are rejected with a clear
  field name.
- The same data feeds the bake and the display background. A sun above the
  horizon lights an up-facing surface, a sun below the horizon leaves only sky
  fill, higher sun intensity raises radiance, and scene geometry occludes the
  sun disk.
- The production build still emits and references the hashed
  `lightmapper.wasm`, `xatlas.wasm` and both HDRI assets, and the procedural
  scene adds no file asset.

**Verification:** `npm run check --prefix site`, `npm test --prefix site`,
`npm run test:harness --prefix site`, `npm run test:smoke --prefix site`,
`SITE_BASE=/lightmapper-wasm/ npm run build --prefix site`,
`SITE_BASE=/lightmapper-wasm/ npm run build:check --prefix site`, thumbnail
capture and `npm run verify:remote`.

**ADR footprint:** implements AD-017's environment contract with generated
data and implements AD-015/AD-016 and AD-009; it respects AD-006/AD-013. It
adds no ADR and does not supersede one. AD-018/AD-019 remain reserved for the
harness/display promotions.

### 7.13 `improve-outdoor-sun-lighting` — this repo (implemented)

**Status:** Implemented. The outdoor scenes no longer rely on a near-delta sun
sampled by the low-resolution hemicube. `sun-sky-outdoor` keeps its `0.06 rad`
display disk but bakes a larger, softer `0.22 rad` lobe with a flux-preserving
intensity scale; `hdri-outdoor` uses a seven-tap prefiltered bake copy and
fewer smoothing passes. Both use the
library's cosine hemisphere weight through the new
`lmSetCosineWeights` wrapper method, and the site enforces a six-texel sampling
budget at H64/H128. The shadows are intentionally soft area-light shadows, not
crisp parallel sun shadows.

**Goal:** remove the multiple hemicube-shaped shadow lobes while staying inside
lightmapper's hemicube model and preserving the display backgrounds.

**Why:** the small sun disk was undersampled at H64, the default uniform
weighting over-emphasized grazing sun/horizon light, and the outdoor presets
used too much smoothing. A direct shadow map was rejected because it introduced
a second lighting model.

**Scope:** `wasm/lightmapper_wasm.c`, `wasm/CMakeLists.txt`, `src/index.js`,
`types/index.d.ts`, `LIGHTMAPPER.md`, `site/src/bake/`, `site/src/environment/`,
`site/src/demos/`, the site tests/thumbnails and this roadmap. No
`lightmapper.h` or submodule change.

**Acceptance:**
- The wrapper exposes `lmSetCosineWeights`; a context configured with it uses
  `cos(theta)` weighting, while the default remains uniform.
- The outdoor bake sun covers at least six hemicube texels at H64 and H128; the
  procedural display still shows the `0.06 rad` disk.
- The outdoor scenes use cosine weighting; the non-outdoor scenes keep uniform.
- The outdoor smoothing is reduced below the previous four/twelve passes, and
  the bake no longer produces multiple hemicube-shaped lobes in the harness or
  captured stage.
- `hdri-outdoor` remains a partly cloudy multi-source scene; its clouds are
  documented as soft fill.
- Root wasm/dist layout, loader behavior and the published npm entry remain
  unchanged apart from the additive wrapper method and declarations.

**Verification:** wasm and dist rebuild, `npm test`, `npm run test:dist`,
`npm run test:shader`, `npm run test:readback`, `npm run test:loader`,
`npm run test:consumer`, `npm run typecheck`, the site check/unit/harness/smoke
suites, thumbnail capture, production build/check and `npm run verify:remote`.

**ADR footprint:** adds AD-020; extends AD-017 without superseding it and does
not change `add-sun-sky-outdoor-lighting`'s environment-only decision.
AD-018/AD-019 remain reserved.

---

## 8. Non-goals

- Adding a WebGL1 fallback (AD-003).
- Changing the public C API, rendering math or lightmap format beyond the
  defects above.
- Requiring threads, SIMD or `SharedArrayBuffer` in the reference wasm build.
- Supporting Node rendering without a real WebGL2 implementation; Node may be
  supported for packaging/tests only, or explicitly excluded.
- Merging `lightmapper` and `lightmapper-wasm` into one repository in this
  program; the split is accepted in AD-004.
- Publishing a new npm version as part of the planning work.

---

## 9. Creating the OpenSpec changes

From this repository:

```sh
npx @fission-ai/openspec@latest new change <change-name>
# or, in OpenCode:
/opsx-propose "fix the WebGL2 first-pass sampling"
```

Then fill `proposal.md`, `specs/<capability>/spec.md`, `design.md` and
`tasks.md`. Validate with:

```sh
npx @fission-ai/openspec@latest validate --all --strict
```

The first change, `fix-webgl2-hemisphere-sampling`, is implemented (upstream
`5326e7c`, consumed by the submodule bump). It was small, independent and
directly addressed the highest-impact defect, but it is upstream `lightmapper`
work: this repo’s proposal carries the `[lightmapper]` task and the submodule
bump. The second change, `harden-webgl2-readback`, is implemented as well
(upstream `3013f2d`); together they make the C side safe enough to build a
release artifact and a golden test on top of. The third change,
`portable-gles3-path`, is implemented in upstream `c111bb8`. The fourth change,
`wasm-release-build`, is implemented with a 44,136-byte wasm. The fifth
change, `separate-wasm-loader`, is implemented with the same 44,136-byte wasm
shipped as a separate asset beside the default entry plus a `./single`
embedded entry. Change 10, `add-showcase-site`, is implemented with the seven
scenarios, the xatlas-everywhere pipeline, the bake harness/display and the
Pages deployment. Change 11, `add-hdri-environment-baking`, is implemented with
the environment skybox, `hdri-studio`, `hdri-outdoor`, the checked-in Poly
Haven assets and the attribution/navigation copy. Change 12,
`add-sun-sky-outdoor-lighting`, is implemented with the procedural-sky
generator, the `sun-sky-outdoor` scenario and the seven-scenario catalog.
Change 13, `improve-outdoor-sun-lighting`, is implemented with the cosine
weight shim, well-sampled bake sun, reduced outdoor smoothing and sampling
budget. The next planned changes in the showcase sequence are
`promote-bake-harness` and `add-three-adapter`; `worker-support` remains an
independent open item.

For upstream C changes, propose them in `lightmapper` (or carry a
`[lightmapper]` task here) and mirror the status in this roadmap. This repo’s
own changes are proposed here.

---

## 10. References

- `thirdparty/lightmapper/lightmapper.h` — upstream ES shaders and readback:
  lines ~714–735, ~1239–1400.
- `thirdparty/lightmapper/example/example.c` — desktop example,
  `#version 150 core` at lines ~253/267, `GL_RGBA`/`GL_FLOAT` upload at
  line ~111.
- `wasm/CMakeLists.txt` — Emscripten flags.
- `scripts/build-dist.mjs` — regex inlining.
- `src/index.js` — context probing, registration and wrappers.
- `types/index.d.ts` — handwritten declarations.
- `libfive-wasm/src/loader/index.ts`, `src/loader/glue.ts` — reference loader.
- `libfive-wasm/scripts/build-wasm.sh`, `scripts/build-js.mjs` — reference
  build and packaging.
- `libfive-wasm/docs/roadmap.md`, `docs/decisions.md` — reference planning
  model.
