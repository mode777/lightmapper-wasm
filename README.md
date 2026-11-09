# lightmapper-wasm

A browser-ready JavaScript/WebAssembly wrapper around
[ands/lightmapper](https://github.com/ands/lightmapper), a single-header C
library for baking lightmaps with your existing **WebGL2** renderer.

The original C library is included as the submodule
[`thirdparty/lightmapper`](https://github.com/mode777/lightmapper).

> **Status: `0.1.2`, browser-first ESM.**
> The default build ships `dist/lightmapper.wasm` beside `dist/index.js`; the
> loader fetches it and instantiates with streaming, falling back to
> `ArrayBuffer`. An embedded single-file entry remains available as
> `lightmapper-wasm/single`. The package has focused loader, packaging and
> shader/readback probes but no packaged golden suite. These are tracked, with
> the other known gaps, in
> [`docs/wasm-improvements.md`](https://github.com/mode777/lightmapper-wasm/blob/Main/docs/wasm-improvements.md).

## Requirements

| Requirement | Version / notes |
|---|---|
| Browser with WebGL2 | Chrome 56+, Firefox 51+, Safari 15+, Edge 79+ |
| `EXT_color_buffer_float` | Required: the lightmapper renders to and reads back RGBA32F targets |
| Emscripten (build only) | 3.1.64 is the pinned toolchain; configure/build reject other versions |
| CMake (build only) | 3.20+ |
| Node.js (dev server / packaging) | 18+ |

The npm package is not a Node rendering library: it needs a real WebGL2
context. Node is used for tooling, packaging and (eventually) headless tests.

## Install

```sh
npm install lightmapper-wasm
```

The package is ESM-only. CommonJS consumers can load it with dynamic
`import()`.

## Quick start

```js
import { createLightmapperModule } from "lightmapper-wasm";

// 1. Use an existing WebGL2 context (or pass { canvas })
const canvas = document.getElementById("viewport");
const gl = canvas.getContext("webgl2");
const lm = await createLightmapperModule({ canvas, webglContext: gl });

// 2. Allocate a lightmap buffer on the WASM heap
const W = 256, H = 256, C = 4;
const floatCount = W * H * C;
const lightmapPtr = lm.allocF32(floatCount);
lm.viewF32(lightmapPtr, floatCount).fill(0);

// 3. Create a lightmapper context
lm.makeBoundContextCurrent();
const ctx = lm.lmCreate(64, 0.001, 100.0, 0, 0, 0, 2, 0.01, 0.0);

// 4. Bind the lightmap and geometry
lm.lmSetTargetLightmap(ctx, lightmapPtr, W, H, C);
lm.lmSetGeometry(ctx, 0,
  lm.LM_FLOAT, verticesPtr, strideBytes,
  lm.LM_NONE, 0, 0,
  lm.LM_FLOAT, verticesPtr + 12, strideBytes, // UV offset = 3 floats × 4 bytes
  indexCount, lm.LM_UNSIGNED_SHORT, indicesPtr);

// 5. Render the hemispheres
const bufs = lm.makeBeginFrameBuffers();
while (lm.lmBegin(ctx, bufs.viewportPtr, bufs.viewPtr, bufs.projectionPtr)) {
  const vp = bufs.readViewport();
  const view = bufs.readViewMatrix();
  const proj = bufs.readProjectionMatrix();

  gl.viewport(vp[0], vp[1], vp[2], vp[3]);
  drawScene(gl, view, proj);
  lm.lmEnd(ctx);
}
bufs.dispose();

// 6. Post-process and read back
const tmpPtr = lm.allocF32(floatCount);
lm.lmImageDilate(lightmapPtr, tmpPtr, W, H, C);
lm.lmImageDilate(tmpPtr, lightmapPtr, W, H, C);
lm.lmImagePower(lightmapPtr, W, H, C, 1.0 / 2.2, 0x7); // gamma-correct RGB

const result = lm.copyFromHeap(lightmapPtr, new Float32Array(floatCount));

// 7. Clean up
lm.lmDestroy(ctx);
lm.free(tmpPtr);
lm.free(lightmapPtr);
```

See [`LIGHTMAPPER.md`](LIGHTMAPPER.md) for the full API reference, multi-bounce
examples and quality tips.

## How the wasm is loaded

The package publishes two ESM entries:

| Entry | Import | Wasm source |
|---|---|---|
| Default | `lightmapper-wasm` → `dist/index.js` | separate `dist/lightmapper.wasm` fetched beside the entry |
| Single-file | `lightmapper-wasm/single` → `dist/single.js` | embedded base64 payload, no request |

**Default entry.** `createLightmapperModule` resolves the asset as
`new URL("./lightmapper.wasm", import.meta.url)`, fetches it and instantiates
with `WebAssembly.instantiateStreaming` when the response is served as
`application/wasm`, falling back to `arrayBuffer()` + `WebAssembly.instantiate`
otherwise. A non-OK response or failed fetch rejects with the asset URL and
status named. The WebGL2/`EXT_color_buffer_float` capability probe and context
registration run before any fetch, so an unsupported device never downloads
the binary.

**Single-file entry.** `dist/single.js` inlines the Emscripten glue with the
wasm as a base64 payload and never fetches an asset. Use it when an embedded
binary is required.

Both entries accept the same loader options:

| Option | Type | Behavior |
|---|---|---|
| `wasmBinary` | `ArrayBuffer \| Uint8Array` | Pre-fetched wasm bytes. Takes precedence over any URL resolution and performs no fetch. |
| `locateWasm` | `(filename: string) => string \| URL` | Returns the asset location to fetch instead of the default `new URL(...)`. |

Precedence: `wasmModuleOptions.wasmBinary` (raw Emscripten passthrough) →
`options.wasmBinary` → single-file entry or `options.moduleFactory` (resolution
skipped) → `options.locateWasm` → the default `lightmapper.wasm` URL.
`wasmModuleOptions.locateFile` is not part of this chain; use `locateWasm` or
`wasmBinary` instead. `options.moduleFactory` callers continue to own their
own resolution.

**Bundlers and HTTP.** The literal
`new URL("./lightmapper.wasm", import.meta.url)` is the form bundler asset
plugins recognize. Vite emits the asset with its default configuration (no wasm
plugin needed); `npm run test:consumer` builds a Vite 6.4.5 consumer and
asserts exactly one hashed `.wasm` asset, byte-identical to
`dist/lightmapper.wasm`. Because the default entry fetches, it does not work
from `file://` pages: serve the package over HTTP (as the demo does) or import
`lightmapper-wasm/single`.

**Migration note.** The default entry no longer embeds the wasm. Consumers who
relied on the inlined bytes — for example, pages opened from `file://` or
bundles without asset handling — should import `lightmapper-wasm/single`
instead; its API is identical.

`npm run configure:wasm`/`build:wasm` build the default separate-asset flavour;
`npm run rebuild:wasm:single` builds the opt-in single-file flavour used for
`dist/single.js`.

## Build from source

```sh
# 1. Check out with the upstream C submodule
git clone --recursive https://github.com/mode777/lightmapper-wasm.git
cd lightmapper-wasm

# 2. Activate the reference Emscripten toolchain (3.1.64)
source /path/to/emsdk/emsdk_env.sh

# 3. Install build tooling
npm ci

# 4. Configure and build the default separate-asset wasm module
npm run configure:wasm
npm run build:wasm
# or: npm run rebuild:wasm

# optional: build the single-file flavour for dist/single.js
npm run rebuild:wasm:single

# 5. Assemble dist/
npm run build:dist
```

`configure:wasm` selects `CMAKE_BUILD_TYPE=Release`, so the default artifact is
compiled with `-O3 -DNDEBUG` and LTO. `build:wasm` also prints the separate
wasm size and SHA-256 plus the glue `.mjs` size through
`npm run report:artifact`. A debug build with assertions enabled is available in
a separate directory:

```sh
npm run configure:wasm:debug
npm run build:wasm:debug
# or: npm run rebuild:wasm:debug
```

The build scripts, artifact layout, debug flavour and package entry are
explained in [`WASM_SETUP.md`](WASM_SETUP.md).

## Browser example

The gazebo demo is in
[`examples/browser/`](https://github.com/mode777/lightmapper-wasm/tree/Main/examples/browser).

```sh
npm run rebuild:wasm
npm run serve:demo
# open http://localhost:8080/examples/browser/index.html
```

Serve the repository root over HTTP; opening the page from `file://` will not
load the module or the `.obj` asset. The demo needs WebGL2 and
`EXT_color_buffer_float`; the page reports a clear error when either is missing.

## Testing

```sh
npm test                        # Node smoke test (constants, heap helpers, error paths)
npm run test:bake               # Headless Chrome golden bake against dist/index.js
npm run test:update-golden      # Regenerate test/golden/ from a fresh bake (review the diff)
npm run test:dist               # assembled dist/ layout
npm run test:loader             # loader asset-resolution scenarios
npm run test:consumer           # packaged Vite consumer build
npm run test:shader             # GLES3 first-pass sampling
npm run test:readback           # readback state and failure paths
SSH_HOST=… SSH_USER=… SSH_PASSWORD=… npm run verify:remote   # full build + tests on the verification box
```

`test:bake` needs `chrome-headless-shell`; set `CHROME_SHELL_PATH` if it is
not in the default location. Golden data lives in `test/golden/quad-bake.f32`
and `test/golden/quad-bake.stats.json`. CI runs `npm test` and
`npm run test:bake` on every push to `Main`.

The focused checks are:

- `npm run test:dist` — the assembled `dist/` layout: entry, byte-identical
  asset, single-file payload and declarations.
- `npm run test:loader` — headless Chrome loader scenarios: exactly one asset
  fetch, supplied `wasmBinary` wins with zero requests, `locateWasm` failures
  name the location, the capability probe precedes the fetch, and the
  single-file entry bakes with zero `.wasm` requests.
- `npm run test:consumer` — `npm pack` → Vite 6.4.5 consumer build → exactly one
  hashed `.wasm` asset, byte-identical to `dist/lightmapper.wasm`.
- `npm run test:shader` (first-pass sampling) and `npm run test:readback`
  (readback state, resource reuse and failure paths), both in headless
  Chrome/ANGLE SwiftShader.

Remaining gaps (capability-failure coverage and worker support) are tracked in
[`docs/wasm-improvements.md`](https://github.com/mode777/lightmapper-wasm/blob/Main/docs/wasm-improvements.md).

The upstream first-pass sampling defect (F1) is fixed in the current source
tree (`5326e7c`) and covered by `npm run test:shader`; published `0.1.2`
artifacts predate the fix. See `docs/wasm-improvements.md`.

## Documentation and planning

| Document | Contents |
|---|---|
| [`LIGHTMAPPER.md`](LIGHTMAPPER.md) | Full JavaScript API reference |
| [`WASM_SETUP.md`](WASM_SETUP.md) | Build, artifact and troubleshooting guide |
| [`docs/wasm-improvements.md`](https://github.com/mode777/lightmapper-wasm/blob/Main/docs/wasm-improvements.md) | Findings F1–F14 and the proposed OpenSpec change sequence |
| [`docs/decisions.md`](https://github.com/mode777/lightmapper-wasm/blob/Main/docs/decisions.md) | ADR log |
| [`openspec/`](https://github.com/mode777/lightmapper-wasm/tree/Main/openspec) | OpenSpec specs, changes and project rules |
| [`AGENTS.md`](https://github.com/mode777/lightmapper-wasm/blob/Main/AGENTS.md) | Agent/contributor workflow and constraints |

## Contributing

All work happens directly on `Main`; do not create feature branches, pull
requests or git worktrees unless explicitly requested.

All functional work goes through OpenSpec changes. Use `/opsx-propose "<idea>"`
in OpenCode, or:

```sh
npx @fission-ai/openspec@latest new change <change-name>
npx @fission-ai/openspec@latest validate --all --strict
```

Read [`AGENTS.md`](https://github.com/mode777/lightmapper-wasm/blob/Main/AGENTS.md)
and [`openspec/config.yaml`](https://github.com/mode777/lightmapper-wasm/blob/Main/openspec/config.yaml)
first. C-side changes are upstream `[lightmapper]` tasks; do not hand-edit the
`thirdparty/lightmapper` submodule.

## License

The wrapper is released under the Unlicense; see [`LICENSE`](LICENSE). The
upstream lightmapper library is public domain; see the
[original repository](https://github.com/ands/lightmapper).
