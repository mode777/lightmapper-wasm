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
| AD-020 | Well-sampled area sun and cosine weighting in the showcase | Accepted |
| AD-021 | Lightmap studio is a separate, engine-agnostic package; the AD-018/AD-019 promotion reservation is withdrawn | Accepted |
| AD-022 | Studio lighting is environment plus emissive geometry plus point-light sphere proxies; no directional-light input | Accepted |
| AD-023 | The studio loader lazily loads two wasm binaries through one option surface with preflight and typed errors | Accepted |
| AD-024 | Seed the lightmapper rotation jitter before each studio bake so repeated bakes are deterministic | Accepted |
| AD-025 | The studio is published from its own `lightmap-studio` repository; the local copy is frozen until the consume stage | Accepted |
| AD-026 | Studio releases are tag-gated, require the seeded `lightmapper-wasm` dependency floor and publish with provenance | Accepted |
| AD-027 | The showcase consumes the published `lightmap-studio` package; the local staging copy is removed | Accepted |

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
pushes or manual dispatch. The site-local bake harness and unwrap pipeline
move into the private `lightmap-studio` package (AD-021); the three.js display
stays a sample consumer and is not part of that package.

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
The studio package (AD-021) keeps this UV contract unchanged; three.js remains
sample-only.

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
are covered by headless WebGL2 tests. The studio package (AD-021/AD-023) must preserve the environment input.

## AD-020 — Well-sampled area sun and cosine weighting in the showcase {#ad-020}

**Context.** The outdoor showcase scenes read as multi-source even though each
environment contains one sun. At H64 a `0.06 rad` sun is only about five
hemicube texels across, and the deterministic 3×3 hemicube rotation plus the
lightmap smoothing turned the resulting sampling variation into ragged,
doubled shadow edges. The `hdri-outdoor` scene also used a narrow prefilter and
twelve smoothing passes. A separate shadow-map or direct-light pass would fix
the symptom by bypassing lightmapper and creating a second lighting model.

**Decision.** Keep the hemicube as the only lighting path. Make the bake sun a
well-sampled area light by using a larger, softer bake-only lobe while the
display keeps its current visible disk; enforce a six-texel sampling budget at
the standard H64 and high H128 presets. Expose the library's existing
`lmSetHemisphereWeights` API through a built-in cosine-weight shim and an
optional `hemisphereWeight: "cosine"` harness setting, defaulting to uniform.
Use four smoothing passes for the procedural outdoor scene while keeping the
HDRI outdoor scene at twelve to suppress line artifacts from its dense cloud
prefilter, and widen that prefilter. The environment and outdoor scenes use
1024² atlases. The non-outdoor scenes keep uniform weighting and their current
presets.

**Consequences.** The outdoor shadows become one soft area-light shadow per
occluder rather than multiple hemicube lobes; they are not crisp or parallel
sun shadows. The two outdoor scenes use cosine weighting and recalibrated
exposure; `hdri-outdoor` remains an intentionally multi-source partly cloudy
environment. The wasm shim and wrapper gain one additive method, but there is
no `lightmapper.h` change, no submodule bump, and no package entry or artifact
layout change. This decision extends AD-017; it does not supersede it. AD-021
withdraws the AD-018/AD-019 reservation: the studio owns the harness, while
three.js remains a sample-only display dependency.


## AD-021 — Lightmap studio is a separate, engine-agnostic package {#ad-021}

**Context.** The reusable part of the showcase (xatlas unwrap, shared-atlas bake
harness, environment prefilter and quality presets) lives next to demo scenes,
a gallery and a three.js display. A consumer that wants "unwrap my meshes and
bake a lightmap" must copy code out of `site/`. The reserved AD-018/AD-019
promotions would have split the workflow across `lightmapper-wasm/bake` and
`lightmapper-wasm/three`, kept xatlas out of the result, and still required the
consumer to compose the pieces.

**Decision.** Withdraw the AD-018/AD-019 promotion reservation. Introduce a
separate `lightmap-studio` package with an engine-agnostic API that owns the
mesh-to-lightmap path: shared xatlas atlas, WebGL2 bake, environment
prefiltering, presets and plain-data results. Stage the work in three changes:
isolate the code as a private package inside this repository, extract it to its
own repository and publish it, then remove the local copy and consume the npm
package from the sample. three.js is a sample-only display dependency; the
studio never bundles or exports it.

**Consequences.** The root `lightmapper-wasm` package keeps its existing entries
and zero runtime dependencies. The studio depends on both `lightmapper-wasm` and
`xatlas-wasm`. The showcase becomes a consumer of the private studio package
before the repository split. The ADR log and roadmap must describe the staged
state, not the withdrawn promotion. `site/` may keep sample-only display code,
but it must not own the unwrap or bake implementation.

**Status update (2026-11-11).** Stage 3 (`consume-lightmap-studio`) is complete:
the local `studio/` copy is removed and the showcase installs
`lightmap-studio@^0.1.0` from the npm registry. AD-027 records the dependency
shape; this ADR is implemented, not superseded.

## AD-022 — Studio lighting is environment plus geometry {#ad-022}

**Context.** The lightmapper has no punctual or directional light model: it
integrates radiance from the geometry and sky the caller draws during each
hemisphere pass. The showcase already covers the useful cases with an
equirectangular environment, emissive meshes and a procedural sky that is
generated into environment data.

**Decision.** The studio exposes one lighting input: an optional linear
equirectangular environment as the only sky source, an optional ambient color,
emissive meshes as area lights, and point lights. There is no directional-light
input. A point light is `{ position, color, power, radius? }`; the studio models
it as an emissive sphere with uniform radiance
`power / (4 * pi^2 * radius^2)`, using a documented default radius and returning
the proxy geometry in the result. The procedural sky remains a sample-local
environment generator.

**Consequences.** Sky lighting must be supplied as HDRI or generated
environment data; a caller cannot ask the studio for a sun/directional light.
Point-light shadows are area-light shadows whose softness follows the proxy
radius. The result includes the generated proxies so a sample can render the
same bulb. This decision builds on AD-017 and AD-020 and does not change the C
library.

## AD-023 — Studio loader and asset contract {#ad-023}

**Context.** The studio sits on two wasm packages with different loader
vocabulary (`locateWasm` versus `locateFile`), different runtime targets
(lightmapper is browser-only; xatlas also runs in Node and workers) and a
capability probe that must precede the lightmapper fetch. Consumers should not
have to understand both loaders to use one library.

**Decision.** Expose one `wasm` option with `lightmapper` and `xatlas` entries,
each accepting `binary` bytes or a `url`. Add a `modules` injection point for
callers that already own an initialized module. Resolution order per module is
injected module, then binary, then URL, then the dependency's own default asset
resolution. Loading is lazy: studio creation fetches nothing, unwrap loads
xatlas, and bake probes WebGL2/`EXT_color_buffer_float` before loading
lightmapper. Failures use one `StudioError` code set and preserve the original
error as the cause. The studio does not reimplement asset path logic, so the
proven bundler behavior of both packages is preserved.

**Consequences.** A bundler consumer emits two wasm assets. `unwrap` works
without WebGL; `bake` fails with the `webgl2` code when no context exists.
Injected modules remain caller-owned and are not disposed by the studio.
Callers do not need to use `locateWasm` or `locateFile` directly, but those
escape hatches remain available through the underlying packages.

## AD-024 — Deterministic rotation seed {#ad-024}

**Context.** The lightmapper adds a small `0.1 rad` random rotation to each
hemisphere sample to break up structured sampling patterns. The jitter draws
from the C `rand()` sequence, so a second bake in the same module instance
uses a different sequence and produces a different lightmap. The golden tests,
quality comparisons and the studio's deterministic-output contract need a
reproducible sequence.

**Decision.** Export `srand` from the wasm module, add an additive
`lmSeed(seed)` wrapper method and declarations, and call `lmSeed(0)` before
each studio bake. The method needs no WebGL context and rejects a non-negative
integer requirement violation. The jitter amplitude and sampling math are
unchanged. Re-instantiating the lightmapper module per bake was rejected
because it costs a new wasm instantiation and heap per bake and can leak module
instances.

**Consequences.** The root package gains one additive method and a wasm
rebuild; its entries and existing behavior are otherwise unchanged. Repeated
bakes of the same scene and options produce the same atlas and lightmap
values, which the studio headless suite asserts. A caller that wants a
different jitter sequence can still call `lmSeed` with another seed before a
bake.

## AD-025 — The studio is published from its own repository {#ad-025}

**Context.** Stage 1 (AD-021) left the studio as a private package under
`studio/` with a `file:..` dependency, parent-relative test paths and no
published artifact. The showcase therefore consumed a local link, and no
external consumer could install the pipeline.

**Decision.** Extract the package to the public `mode777/lightmap-studio`
repository with a history-preserving `studio/` subtree split, publish it as the
unscoped npm package `lightmap-studio`, and give the repository its own build,
test and release workflow. The package is ESM-only, keeps the API and loader
contracts from `lightmap-studio`/`studio-loader`, depends directly on
`lightmapper-wasm` and `xatlas-wasm`, and does not depend on three.js. The
parent repository keeps its `studio/` copy frozen for the showcase until stage
3 (`consume-lightmap-studio`), which removes the copy and switches the site to
the registry package. The functional initial release is `0.1.0`; a
`0.0.0-bootstrap.0` placeholder may claim the registry name on the `bootstrap`
tag without becoming the latest functional release.

**Consequences.** The studio now has independent versions, CI and release
notes. `site/` still uses `file:../studio` during the staging window, so
urgent fixes must be mirrored mechanically between the two copies rather than
forked. The root `lightmapper-wasm` tarball, exports and dependency graph stay
unchanged, and the root README/ADR log point at the standalone repository.
AD-021 is implemented, not superseded.

**Status update (2026-11-11).** Stage 3 (`consume-lightmap-studio`) closed the
staging window: `studio/` is removed, `site/` installs
`lightmap-studio@^0.1.0` from the registry, and the mirroring requirement no
longer applies. AD-025 is implemented, not superseded.

## AD-026 — Studio releases are tag-gated and declare a dependency floor {#ad-026}

**Context.** The studio is the first package in this program whose published
artifact depends on the seeded `lightmapper-wasm` wrapper. A release that
resolved an older lightmapper version would silently skip the rotation-seed
reset and break deterministic bakes.

**Decision.** Publish only from a `v<version>` tag in
`mode777/lightmap-studio`, and fail the release when the tag and
`package.json` version differ. The release workflow runs the build, typecheck,
unit, packed-consumer, tarball-layout and headless bake gates before
`npm publish --provenance --access public`. Trusted publishing through GitHub
OIDC is the default; an `NPM_TOKEN` secret is the fallback when the registry
account requires a token. The package declares
`lightmapper-wasm@^0.2.0` (the first release with `lmSeed` and the `_srand`
export) and `xatlas-wasm@^0.2.0` as direct dependencies; the loader test fails
when the installed lightmapper predates that floor.

**Consequences.** A broken or downgraded dependency fails the publish gate
instead of silently degrading the bake. First-publish ownership can be claimed
with a `0.0.0-bootstrap.0` placeholder on the `bootstrap` tag; `0.1.0` becomes
`latest` when the real release lands. Consumers get two emitted wasm assets and
no parent checkout, Emscripten or local link requirement.

## AD-027 — The showcase consumes the published studio package {#ad-027}

**Context.** AD-021 and AD-025 planned three stages: isolate the studio, extract
and publish it, then remove the local copy and consume the registry package.
Stages 1 and 2 left a frozen `studio/` mirror in this repository and a
`lightmap-studio: file:../studio` link in `site/`, so two copies had to be kept
in sync by hand and CI built the staging copy instead of the published artifact.

**Decision.** Complete stage 3. Remove `studio/` and the root scripts that build
or test it, and make `site/` depend on `lightmap-studio@^0.1.0` from the npm
registry. The showcase keeps `lightmapper-wasm: file:..` so the site still
builds against the tested local `dist` artifact (AD-015); an npm override pins
the published studio's `lightmapper-wasm` requirement to that local link so the
site resolves exactly one wrapper copy. A site test fails when the studio
resolves from a local path, leaves `^0.1.0`, or a second wrapper copy appears.
Studio build, unit, consumer and headless gates stay in the standalone
repository (AD-026); this repository keeps the site harness, smoke and
production-build coverage of the installed package.

**Consequences.** The studio has one source of truth and independent releases;
a studio fix arrives here as a version bump. The root tarball, exports and
dependency graph are unchanged, CI no longer builds a studio package, and the
showcase build still emits one hashed `lightmapper.wasm` and `xatlas.wasm`.
AD-021's stage 3 and AD-025's handoff are complete; neither is superseded.
