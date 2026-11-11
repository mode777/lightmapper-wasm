# Lightmapper WASM setup

This guide covers building `lightmapper-wasm` from source and running the
browser demo. The current release line is `0.1.2`; see
[`docs/wasm-improvements.md`](https://github.com/mode777/lightmapper-wasm/blob/Main/docs/wasm-improvements.md) for the roadmap and remaining
verification work.

## Toolchain requirements

| Tool | Version / notes |
|---|---|
| Emscripten | **3.1.64** is pinned; configure and build fail on any other version |
| CMake | 3.20+ |
| Node.js | 18+ (build tooling and dev server) |
| Make or Ninja | any generator supported by CMake |
| Git | required for the `thirdparty/lightmapper` submodule |

The wasm module targets **WebGL2 / OpenGL ES 3.0**. It requires the
`EXT_color_buffer_float` extension because the lightmapper renders to and reads
back RGBA32F render targets.

## Install Emscripten

### Linux / macOS

```sh
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install 3.1.64
./emsdk activate 3.1.64
source ./emsdk_env.sh
emcc --version
```

### Windows (PowerShell)

```powershell
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
.\emsdk install 3.1.64
.\emsdk activate 3.1.64
.\emsdk_env.ps1
emcc --version
```

## Configure and build

From the repository root:

```sh
# 1. Initialize the C submodule
git submodule update --init --recursive

# 2. Install the package build tooling
npm ci

# 3. Configure the Emscripten CMake target
npm run configure:wasm

# 4. Build the wasm module
npm run build:wasm
# or: npm run rebuild:wasm
```

### Build flavours

`configure:wasm` selects a Release build in `build/wasm` (`-O3`, `-DNDEBUG`
and LTO by default) with the default separate-asset layout. `build:wasm`
prints the emitted wasm size and SHA-256 plus the glue `.mjs` size through
`npm run report:artifact`.

The optional single-file flavour builds into its own directory:

```sh
npm run configure:wasm:single
npm run build:wasm:single
# or: npm run rebuild:wasm:single
```

It configures `build/wasm-single` with `-DLM_WASM_SINGLE_FILE=ON`, embedding
the wasm as a base64 data URI in one `.mjs`; the default build does not.

For a debug build with assertions enabled, use the separate debug directory:

```sh
npm run configure:wasm:debug
npm run build:wasm:debug
# or: npm run rebuild:wasm:debug
```

The debug artifact is written to
`build/wasm-debug/wasm/lightmapper_wasm.mjs` and never replaces the release
build. To evaluate a release without LTO, configure with
`-DLM_WASM_LTO=OFF`.

The configure and build scripts run `npm run check:emsdk` first and reject an
`emcc` other than 3.1.64. CI installs the same pinned version.

### Studio package

The `lightmap-studio` package is published from `mode777/lightmap-studio` and
installed from the npm registry; this repository no longer contains a studio
copy. The showcase declares `lightmap-studio: ^0.1.0` and keeps
`lightmapper-wasm: file:..`, so it always builds against the root `dist/`
artifact produced above. An npm override pins the published studio's
`lightmapper-wasm` requirement to that local link, and
`site/test/studio-dependency.test.ts` fails if the studio resolves locally or a
second wrapper copy appears:

```sh
npm ci --prefix site      # installs lightmap-studio from npm + the local wrapper
npm test --prefix site    # includes the studio dependency test
```

Studio source, tests and releases live in
[`mode777/lightmap-studio`](https://github.com/mode777/lightmap-studio); the
package is not published by `lightmapper-wasm`, and the root tarball excludes
studio and site files.

## What the build emits

### Default: separate-asset flavour

```
build/wasm/wasm/lightmapper_wasm.mjs    # Emscripten ES module glue, 32,247 bytes, no wasm payload
build/wasm/wasm/lightmapper_wasm.wasm   # separate wasm binary, 44,686 bytes
dist/index.js                           # wrapper + inlined glue, resolves ./lightmapper.wasm
dist/lightmapper.wasm                   # published copy of the binary (44,686 bytes)
dist/index.d.ts                         # TypeScript declarations
```

The default CMake target does not set `-sSINGLE_FILE=1`, so the glue and the
binary are separate files. `build-dist` copies the binary to
`dist/lightmapper.wasm`; `dist/index.js` resolves it with the literal
`new URL("./lightmapper.wasm", import.meta.url)` that bundler asset plugins
understand. The loader fetches the asset and uses
`WebAssembly.instantiateStreaming` with an `ArrayBuffer` fallback.

### Optional: single-file flavour

```
build/wasm-single/wasm/lightmapper_wasm.mjs  # 91,281 bytes, wasm embedded as base64
dist/single.js                               # embedded payload
dist/single.d.ts                             # declarations for lightmapper-wasm/single
```

`configure:wasm:single` sets `-DLM_WASM_SINGLE_FILE=ON`; that flavour emits no
`.wasm`. The published subpath `lightmapper-wasm/single` maps to
`dist/single.js` and never fetches an asset. `wasmModuleOptions.locateFile` is
irrelevant to it.

### Artifact report

`npm run report:artifact` reads the default build's separate
`build/wasm/wasm/lightmapper_wasm.wasm` directly and prints its byte size and
SHA-256 plus the glue `.mjs` size; when `build/wasm-single` exists it also
reports that flavour's embedded wasm. It never modifies the artifacts:

```text
report-artifact: build/wasm/wasm/lightmapper_wasm.wasm (separate-asset flavour)
  wasm bytes:   44686
  wasm sha256:  461ac514d00e2216c24bdd53a80f1756564f5f5131fc940b970f5a66e750bffe
  glue .mjs:    32247 bytes (build/wasm/wasm/lightmapper_wasm.mjs)
report-artifact: build/wasm-single/wasm/lightmapper_wasm.mjs (single-file flavour)
  glue .mjs:    91281 bytes
  embedded wasm bytes:  44665
  embedded wasm sha256:  3b2c738a2b2947c4790e655ed9c0b4631dfc2cb1e32de8530f91e9445eec85cf
report-artifact: dist
  dist/index.js: 53956 bytes
```

The report runs automatically as `postbuild:wasm` after every default release
build.

## Assemble the npm package

After a successful wasm build:

```sh
npm run build:dist
```

This requires both flavour builds (`build/wasm` and `build/wasm-single`). It
inlines the default factory into `src/index.js`, copies the emitted binary to
`dist/lightmapper.wasm`, copies the declarations, and assembles the single-file
entry from the `build/wasm-single` glue:

```
dist/index.js        # default entry
dist/lightmapper.wasm
dist/index.d.ts
dist/single.js       # lightmapper-wasm/single
dist/single.d.ts
```

Every textual replacement is asserted: a missing input, or a replacement that
matches zero or multiple times, fails the build with the replacement named.

To produce a tarball:

```sh
npm run pack
# or: npm pack --pack-destination dist
```

The published tarball contains `dist/`, `README.md`, `LIGHTMAPPER.md`,
`WASM_SETUP.md` and `LICENSE` (see the `files` field in `package.json`).

## Browser example

```sh
npm run rebuild:wasm
npm run serve:demo
```

Open <http://localhost:8080/examples/browser/index.html>. Serve the repository
root over HTTP: the default entry fetches `dist/lightmapper.wasm` and `file://`
cannot fetch, and the gazebo `.obj` asset has the same limitation. If you need
an embedded binary, import `lightmapper-wasm/single`.

Controls:

- mouse drag: look around
- W, A, S, D, E, Q: movement
- Shift: faster movement
- Space or **Bake**: start baking

## JavaScript API entry points

- Runtime wrapper: [`src/index.js`](https://github.com/mode777/lightmapper-wasm/blob/Main/src/index.js)
- Type definitions: [`types/index.d.ts`](https://github.com/mode777/lightmapper-wasm/blob/Main/types/index.d.ts)
- Full API reference: [`LIGHTMAPPER.md`](LIGHTMAPPER.md)
- Package default entry after `build:dist`: `dist/index.js`
- Single-file entry: `dist/single.js` (import `lightmapper-wasm/single`)

`createLightmapperModule` resolves a WebGL2 context, checks
`EXT_color_buffer_float` and RGBA32F readback, registers the context with
Emscripten and makes it current. `strictContextBinding` (default `true`) checks
the current handle before GL-dependent calls; call `lm.makeBoundContextCurrent()`
after switching contexts.

The default entry resolves `dist/lightmapper.wasm` beside the module and
fetches it after the capability probe. Pass `wasmBinary` (an `ArrayBuffer` or
`Uint8Array`) to supply pre-fetched bytes and skip the request, or
`locateWasm(filename)` to return a different location. Precedence is
`wasmModuleOptions.wasmBinary` → `options.wasmBinary` → `locateWasm` → the
default URL; the single-file entry skips resolution because its payload is
embedded.

## Troubleshooting

### `WebGL2 is not available in this browser.`

The browser, GPU or driver does not expose WebGL2. Use a WebGL2-capable
browser/device and update GPU drivers.

### `Missing WebGL2 extension EXT_color_buffer_float.`

The device cannot render to RGBA32F targets. Try another browser/GPU, disable
remote-desktop or virtualized GPU sessions, or use hardware that exposes the
extension. `skipCapabilityCheck: true` exists as an advanced escape hatch but
will not make an unsupported device render correctly.

### `Bound WebGL context is not current` / context-handle mismatch

The current Emscripten context changed after initialization. Call
`lm.makeBoundContextCurrent()` before `lmCreate`, `lmBegin`, `lmEnd` or other
GL-dependent calls, or keep `autoRegisterEmscriptenContext` enabled.

### Page loads but wasm or `.obj` fails

Serve the repository root over HTTP. Do not open `examples/browser/index.html`
from `file://`: the default entry fetches `dist/lightmapper.wasm` and the page
loads the gazebo `.obj` over HTTP as well.

### `npm run configure:wasm` / `build:wasm` cannot find `emcc`

The Emscripten environment is not active. Run `source /path/to/emsdk/emsdk_env.sh`
(Linux/macOS) or `.\emsdk_env.ps1` (Windows), then retry.

### `lightmapper.wasm` fails to load

The default entry fetches `dist/lightmapper.wasm`; `file://` pages cannot fetch.
Serve the file over HTTP (`application/wasm` enables streaming; other content
types fall back to `ArrayBuffer` instantiation). Pass `wasmBinary`, override
the location with `locateWasm`, or import `lightmapper-wasm/single` for an
embedded binary.

### The bake looks wrong

Finding F1 (incorrect GLES3 first-pass sample coordinates) is fixed in the
current source tree (upstream `5326e7c`) and covered by
`npm run test:shader`; published `0.1.2` artifacts predate the fix. The wrapper
still has no packaged golden bake, so visual output beyond the shader probe is
not fully verified.

## Related documents

- [`README.md`](README.md) — install, quick start and current status
- [`docs/wasm-improvements.md`](https://github.com/mode777/lightmapper-wasm/blob/Main/docs/wasm-improvements.md) — findings and change
  sequence
- [`docs/decisions.md`](https://github.com/mode777/lightmapper-wasm/blob/Main/docs/decisions.md) — ADR log
- [`AGENTS.md`](https://github.com/mode777/lightmapper-wasm/blob/Main/AGENTS.md) — contributor/agent workflow
