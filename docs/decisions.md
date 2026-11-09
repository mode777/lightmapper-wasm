# Design decisions (ADR log)

This file records the architectural decisions for `lightmapper-wasm` and the
upstream `lightmapper` C library it consumes. OpenSpec proposals must cite the
ADR IDs they implement, alter or supersede; a change that makes a new decision
adds the ADR in the same change.

Status legend: **Accepted** (in force) · **Proposed** (target, not yet
implemented) · **Superseded** (replaced by a newer ADR).

| ID | Decision | Status |
|---|---|---|
| AD-001 | Keep `lightmapper.h` a single-header, dependency-free, public-domain library | Accepted |
| AD-002 | Preserve the upstream desktop OpenGL 3.2 core path | Accepted |
| AD-003 | WebGL2 / OpenGL ES 3.0 is the only WebAssembly graphics target (no WebGL1) | Accepted |
| AD-004 | `lightmapper-wasm` owns the wasm product, package, loader and OpenSpec base; `lightmapper` owns the C header and reference WebGL2 path | Accepted |
| AD-005 | The package entry is `createLightmapperModule`, with a mandatory WebGL2/float-readback probe and strict context binding | Accepted |
| AD-006 | The package is ESM-only, browser-first and has no runtime dependencies | Accepted |
| AD-007 | Select the GLES3 path by GLES3 capability, not by `__EMSCRIPTEN__` alone | Accepted |
| AD-008 | Pin Emscripten 3.1.64 for reference builds and reject other toolchain versions | Accepted |
| AD-009 | Ship a separate `.wasm` asset resolved through an explicit loader, with `wasmBinary` and `locateWasm` escape hatches | Accepted |
| AD-010 | Verify the WebGL2 path with headless Chrome/ANGLE SwiftShader and golden lightmap hashes | Proposed |
| AD-011 | Cache readback FBOs and scratch buffers in `lm_context` and read only written regions | Accepted |
| AD-012 | Generate TypeScript declarations and ABI checks from the C surface instead of handwriting them | Proposed |
| AD-013 | Support Web Workers via `OffscreenCanvas`, or document main-thread-only explicitly | Proposed |
| AD-014 | Report readback failures on stderr, skip the transfer and keep the bake running; no public error API in this change | Accepted |
| AD-015 | The showcase is a separate consumer deployed from the tested artifact | Accepted |
| AD-016 | Use xatlas for every showcase lightmap atlas with a `[0,1)` UV clamp | Accepted |
| AD-017 | Bake linear equirectangular HDRI environments in the showcase | Accepted |

---

## AD-001 — Single-header, dependency-free core {#ad-001}

**Context.** The upstream library is used by dropping `lightmapper.h` into an
existing renderer. The wrapper must not turn it into a framework or add a
runtime dependency.

**Decision.** Keep the C library as one header with the
`LIGHTMAPPER_IMPLEMENTATION` pattern. Depend only on the C standard library and
the caller-provided OpenGL headers. Keep the public domain / Unlicense terms.

**Consequences.** The wrapper owns the shim and build system; it does not fork
the header’s API. C-side changes go through the `lightmapper` submodule.

## AD-002 — Preserve the upstream desktop GL 3.2 core path {#ad-002}

**Context.** The C fork must remain usable with the existing desktop example
and `#version 150 core` shaders.

**Decision.** The desktop path remains OpenGL 3.2 core. WebGL2/GLES3 behavior
is additive and must not change the desktop shader source, `glGetTexImage`
readback, or desktop build.

**Consequences.** The wrapper’s changes to the submodule must not regress the
desktop path. The C repository owns that verification; the wrapper consumes a
known-good commit.

## AD-003 — WebGL2 / GLES3 only {#ad-003}

**Context.** WebGL1 lacks `texelFetch`, integer textures, `textureSize`, and
the required float render-target behavior. The current ES shaders already use
`#version 300 es`.

**Decision.** The wasm target is WebGL2 (OpenGL ES 3.0). Do not add a WebGL1
fallback. Require `EXT_color_buffer_float` because RGBA32F render targets and
float readback are not core WebGL2 guarantees.

**Consequences.** Builds must request WebGL2 (`MIN_WEBGL_VERSION=2` /
`MAX_WEBGL_VERSION=2`). Devices without `EXT_color_buffer_float` fail the
capability check with a clear message rather than producing wrong output.

## AD-004 — Repository ownership {#ad-004}

**Context.** The C library lives in `mode777/lightmapper`; the Emscripten build
shim, npm wrapper, loader, browser demo and release workflow live in
`mode777/lightmapper-wasm`, which consumes the C library as a submodule.

**Decision.** `lightmapper-wasm` is the wasm product and the OpenSpec base for
the whole program. It owns the build, C shim, loader, package, browser demo,
verification and release work. `lightmapper` owns `lightmapper.h`, the desktop
example and the reference WebGL2 logic; changes there are proposed upstream and
tagged `[lightmapper]` here.

**Consequences.** A wrapper change that needs a C fix includes both:
the upstream `[lightmapper]` task and a submodule bump to the commit that
contains it. The wrapper does not hand-edit `thirdparty/lightmapper`.

## AD-005 — One entry point with a capability probe {#ad-005}

**Context.** The C code makes GL calls that must target a live WebGL2 context;
the library also needs RGBA32F render targets.

**Decision.** Keep `createLightmapperModule(options)` as the public entry. It
resolves a WebGL2 context, probes `EXT_color_buffer_float` plus RGBA32F
framebuffer readback unless `skipCapabilityCheck` is set, registers the context
with Emscripten, makes it current, and enforces `strictContextBinding` before
GL-dependent calls.

**Consequences.** Misconfigured contexts fail before wasm rendering begins.
`skipCapabilityCheck` is an explicit advanced escape hatch, not the default.
Changes that move loading to a separate `.wasm` keep this initialization shape.

## AD-006 — ESM-only, browser-first, no runtime dependencies {#ad-006}

**Context.** The package is consumed by browser bundlers and demos; WebGL2 is a
browser API.

**Decision.** Ship one ESM entry, no runtime dependencies, and a browser-first
artifact. Node is supported for packaging/tooling and, if a real WebGL2
implementation is supplied, for tests; Node rendering is not a product claim.

**Consequences.** `package.json` must not imply Node rendering support.
CommonJS consumers use dynamic `import()`. Worker support is a separate decision
(AD-013).

## AD-007 — Select GLES3 by capability, not compiler {#ad-007}

**Context.** The upstream `#if defined(__EMSCRIPTEN__)` branches work for
Emscripten but leave native GLES3 builds on the desktop `#version 150 core` /
`glGetTexImage` path.

**Decision.** Use one `LM_GLES3` capability macro for the shader and readback
path. Auto-detect it from `GL_ES_VERSION_3_0`, which GLES3 headers define, and
allow an explicit `LM_GLES3` 0/1 override. Do not select a GLSL or readback
path from `__EMSCRIPTEN__`; keep that macro only for Emscripten-specific
integration. GL headers must be included before `lightmapper.h`.

**Consequences.** Native GLES3 and WebGL2 share the shader/readback path and
the RGBA32F/`EXT_color_buffer_float` requirement. Upstream verification
compiles the header against GLES3 and desktop headers, checks the explicit
override, and runs an EGL surfaceless GLES3 smoke bake; the desktop GL 3.2
example remains the AD-002 regression check.

## AD-008 — Pin Emscripten 3.1.64 {#ad-008}

**Context.** CI previously installed `latest`, and small Emscripten changes can
alter generated glue, shader validation or wasm output.

**Decision.** Reference builds use Emscripten 3.1.64 in CI and locally.
`npm run check:emsdk` parses `emcc --version` and rejects any other version
before CMake configures a build directory; `configure:wasm` and `build:wasm`
run the check through their `pre` hooks, and CI installs the same 3.1.64
release.

**Consequences.** Reproducible artifacts and comparable golden results. A patch
difference is rejected as well as a different major/minor version. Toolchain
upgrades become explicit OpenSpec changes that update this ADR and the goldens.

## AD-009 — Separate wasm asset and explicit loader {#ad-009}

**Context.** The package previously built with `-sSINGLE_FILE=1`, which
embedded the wasm as base64 in the JS bundle. That prevented streaming
compilation, asset caching and `locateFile`, and made the generated JS several
times larger than the binary.

**Decision.** The npm package ships `dist/lightmapper.wasm` beside the ES
module (`dist/index.js`) and resolves it through an explicit loader with
`wasmBinary` and `locateWasm` options (the model proven by `libfive-wasm`). The
loader fetches the asset, prefers `WebAssembly.instantiateStreaming` and falls
back to `ArrayBuffer` instantiation; supplied bytes win over every URL path. A
single-file build remains available as the opt-in `lightmapper-wasm/single`
entry (`dist/single.js`), not the default.

**Consequences.** Bundlers must treat the `.wasm` as an asset. The published
default entry must keep the literal
`new URL("./lightmapper.wasm", import.meta.url)` form, because bundler asset
plugins (Vite included) only rewrite literal expressions; `test:consumer`
covers that path. The capability probe runs before any asset request, so an
unsupported device performs no fetch. The single-file entry preserves the
previous embedded-bytes behavior without a `.wasm` request. `SINGLE_FILE` docs
must no longer claim a `.wasm` artifact that is not emitted, and the loader and
packaging tests must cover asset resolution, the `./single` entry and a Vite
consumer.

## AD-010 — Headless WebGL2 verification {#ad-010}

**Context.** The wrapper has no rendering tests, so a shader regression such as
the upstream `gl_FragCoord` offset is invisible until a user sees wrong
lighting.

**Decision.** Add deterministic WebGL2 tests running in headless Chrome with
ANGLE SwiftShader: a smoke bake, a golden lightmap hash using an asymmetric
scene, capability-failure tests and a packaged-consumer test.

**Consequences.** CI gains a real rendering gate. Goldens are captured from a
release artifact and recaptured only when the toolchain or shader behavior
changes intentionally.

## AD-011 — Bounded upstream readback {#ad-011}

**Context.** The upstream readback allocates a lightmap-sized float buffer and
reads the full storage texture once per pass; it also creates and deletes a
framebuffer each time.

**Decision.** The upstream C library caches the readback framebuffer and
scratch buffer in `lm_context`, reads only the rows that were written, and
saves/restores the read and draw framebuffer bindings separately.

**Consequences.** Lower wasm heap churn and fewer GPU syncs on large lightmaps.
The wrapper API and output remain unchanged; the wrapper consumes the updated
submodule.

## AD-012 — Generated TypeScript surface {#ad-012}

**Context.** `types/index.d.ts` is handwritten and can drift from the JS
wrapper and the C shim.

**Decision.** Generate the TypeScript declarations from the C shim/header
surface, or add a checked ABI/type test that fails when the wrapper and
declarations diverge.

**Consequences.** ABI changes become explicit. The generated files are checked
in and verified in CI, matching the `libfive-wasm` model.

## AD-013 — Worker support or an explicit limitation {#ad-013}

**Context.** The wrapper builds with `-sENVIRONMENT=web`, so it runs only on the
main thread. Lightmap baking is long-running and is a natural worker task, but
it needs `OffscreenCanvas` plus an Emscripten WebGL context in the worker.

**Decision.** Either support Web Workers with `OffscreenCanvas` and a
worker-safe context registration path, or document main-thread-only as a hard
limitation and remove the Node engine claim.

**Consequences.** Worker support requires a real browser test; the alternative
must be stated in the README, `WASM_SETUP.md` and the package `engines` field.

## AD-014 — Readback failure is non-fatal {#ad-014}

**Context.** The WebGL2 readback can fail at runtime: the storage texture may
be attached to an incomplete framebuffer, or the CPU staging buffer may fail
to allocate. The previous code asserted on framebuffer completeness, which
aborted assertion-enabled builds and disappeared under `NDEBUG`.

**Decision.** An incomplete readback framebuffer or a failed readback buffer
allocation is reported on standard error and the transfer is skipped. The
write position and position-map rows are still reset so the bake can continue
with a consistent context. No public error accessor is added in this change;
surfacing runtime readback errors to JavaScript belongs to the typed API work.

**Consequences.** A failed readback leaves the affected lightmap rows
unwritten but does not abort a long bake. The error is visible on the console;
JavaScript callers cannot branch on it until the typed API exposes an error
surface.

## AD-015 — Showcase is a separate consumer deployed from the tested artifact {#ad-015}

**Context.** The repository has no public gallery and no reusable bake path;
every demo repeats the same GL setup, lightmap allocation, bounce loop and
readback plumbing. The package must stay browser-first and dependency-free
(AD-006), and the split between the C library, wrapper and package (AD-004)
means the showcase is a consumer, not part of the published API. The loader
already ships a separate wasm asset (AD-009), so the showcase must prove that
artifact instead of rebuilding wasm.

**Decision.** Add a private Vite + TypeScript application under `site/`. It
consumes `lightmapper-wasm` from the local checkout with `file:..`, is not
included in the npm tarball and adds no runtime dependency to the package. The
build workflow uploads the tested `dist` artifact; a `site` job downloads it,
installs `site/`, typechecks, runs the site tests, the harness test and the
smoke bake, builds with `SITE_BASE=/lightmapper-wasm/` and checks the production
layout; a `deploy` job publishes that output to GitHub Pages only on `Main`
pushes or manual dispatch. The site-local bake harness and three.js display
remain package-shaped and are promoted by follow-up changes (AD-018/AD-019).

**Consequences.** The Pages source must be GitHub Actions and the deployed URL
is `https://mode777.github.io/lightmapper-wasm/`. CI never installs
`lightmapper-wasm` from the registry and never rebuilds the wasm in the site
job. Site-only dependencies stay confined to `site/package.json`, and the site
build doubles as a packaged-consumer check. The package tarball still excludes
`site/`, and the root package keeps no runtime dependencies.

## AD-016 — xatlas-everywhere lightmap UVs {#ad-016}

**Context.** The lightmapper samples its lightmap with positive-mod semantics,
so an exactly normalized UV of `1.0` wraps to `0.0`. xatlas produces texel-space
UVs that can sit exactly on the atlas edge. The repository documented a
multi-object shared-atlas recipe but had no consumer that exercised it.

**Decision.** Every showcase scenario unwraps every lit mesh into one
`xatlas-wasm` atlas. Positions and normals are copied through each output
vertex's `xref`; normalized UVs are clamped to `[0, 1 - 1e-6]`, and coordinates
outside the atlas are rejected. Emissive-only meshes are drawn during the bake
but are not added to the atlas. The shared atlas is uploaded to the GPU once
after all objects finish each bounce.

**Consequences.** `xatlas-wasm` is a site-only dependency; the core package
remains dependency-free. The Atlas view and the scene tests depend on the same
pipeline, and the `[0,1)` bound is a tested invariant rather than a convention.
Promoting the harness and display to package entries (AD-018/AD-019) keeps this
UV contract unchanged.

## AD-017 — HDRI environment baking in the showcase {#ad-017}

**Context.** The showcase can bake constant ambient colors and emissive
geometry but not the HDR environment maps used by most studio and product
scenes. The C library already integrates whatever the caller draws during each
hemisphere pass, so environment lighting does not require a C change.

**Decision.** The site-local bake harness accepts an optional linear
equirectangular HDR environment, draws it as a fullscreen skybox for every
lightmapper hemisphere side before scene geometry, and uses the full decoded
data as a linear equirectangular three.js background. The bake receives a
prefiltered 128 × 64 irradiance copy of the same source, so the diffuse
lightmap does not resolve the HDRI's softbox/sun-grid detail. The environment
assets are checked-in CC0 Poly Haven HDRIs with recorded provenance and a
developer refresh script; the site does not fetch them at runtime. No C header,
wasm build, loader or package API changes.

**Consequences.** The showcase gains `hdri-studio` and `hdri-outdoor` scenarios
and an `environment` section; the harness keeps its display-agnostic boundary;
the display gains an equirectangular background path; and the assets are
site-only and excluded from the npm tarball. Prefiltering the diffuse
environment and using a fine interpolation pass plus twelve smoothing passes
avoids the softbox/sun-grid aliasing and coarse interpolation diamonds seen
with raw 1k HDRIs. Environment orientation, intensity, validation and lifecycle
are covered by headless WebGL2 tests. The future `lightmapper-wasm/bake`
promotion (AD-018) must preserve the environment input.
