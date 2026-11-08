# lightmapper-wasm

A browser-ready JavaScript/WebAssembly wrapper around [ands/lightmapper](https://github.com/ands/lightmapper), a single-header C library for baking lightmaps using your existing WebGL2 renderer.

The original C library is included as a submodule under [`thirdparty/lightmapper`](thirdparty/lightmapper/).

## Prerequisites

| Requirement | Version |
|---|---|
| Browser with **WebGL2** | Chrome 56+, Firefox 51+, Safari 15+, Edge 79+ |
| **Emscripten** (build only) | 3.x recommended |
| **CMake** (build only) | 3.13+ |
| **Node.js** (dev server) | 18+ |

See [WASM_SETUP.md](WASM_SETUP.md) for detailed Emscripten installation and build instructions.

## Installation

```bash
npm install lightmapper-wasm
```

Then import in your project:

```js
import { createLightmapperModule } from "lightmapper-wasm";
```

## Build from source

```bash
# 1. Ensure Emscripten is on your PATH (see WASM_SETUP.md)
# 2. Configure & compile
npm run configure:wasm
npm run build:wasm
# 3. Serve the demo
npm run serve:demo
```

### Testing

```bash
npm test                        # Node smoke test (constants, heap helpers, error paths)
npm run test:bake               # Headless Chrome golden bake against dist/index.js
npm run test:update-golden      # Regenerate test/golden/ from a fresh bake (review the diff)
SSH_HOST=… SSH_USER=… SSH_PASSWORD=… npm run verify:remote   # Full build + tests on the verification box
```

`test:bake` needs `chrome-headless-shell`; set `CHROME_SHELL_PATH` if it is not in the default location. Golden data lives in `test/golden/quad-bake.f32` and `test/golden/quad-bake.stats.json`.

## Quick Start

```js
import { createLightmapperModule } from "lightmapper-wasm";

// 1. Initialize with an existing WebGL2 canvas
const canvas = document.getElementById("viewport");
const gl = canvas.getContext("webgl2");
const lm = await createLightmapperModule({ canvas, webglContext: gl, autoRegisterEmscriptenContext: true });

// 2. Allocate a lightmap buffer on the WASM heap
const W = 256, H = 256, C = 4;
const floatCount = W * H * C;
const lightmapPtr = lm.allocF32(floatCount);
lm.viewF32(lightmapPtr, floatCount).fill(0);           // clear to black

// 3. Create a lightmapper context
lm.makeBoundContextCurrent();
const ctx = lm.lmCreate(64, 0.001, 100.0, 0, 0, 0, 2, 0.01, 0.0);

// 4. Bind lightmap + geometry
lm.lmSetTargetLightmap(ctx, lightmapPtr, W, H, C);
lm.lmSetGeometry(ctx, 0,
  lm.LM_FLOAT, verticesPtr, strideBytes,
  lm.LM_NONE, 0, 0,
  lm.LM_FLOAT, verticesPtr + 12, strideBytes,          // UV offset = 3 floats × 4 bytes
  indexCount, lm.LM_UNSIGNED_SHORT, indicesPtr);

// 5. Render loop — keep calling lmBegin until it returns false
const bufs = lm.makeBeginFrameBuffers();
while (lm.lmBegin(ctx, bufs.viewportPtr, bufs.viewPtr, bufs.projectionPtr)) {
  const vp   = bufs.readViewport();
  const view = bufs.readViewMatrix();
  const proj = bufs.readProjectionMatrix();

  gl.viewport(vp[0], vp[1], vp[2], vp[3]);
  drawScene(gl, view, proj);                            // your scene draw call
  lm.lmEnd(ctx);
}
bufs.dispose();

// 6. Post-process and read back
const tmpPtr = lm.allocF32(floatCount);
lm.lmImageDilate(lightmapPtr, tmpPtr, W, H, C);
lm.lmImageDilate(tmpPtr, lightmapPtr, W, H, C);
lm.lmImagePower(lightmapPtr, W, H, C, 1.0 / 2.2, 0x7); // gamma correct RGB

const result = lm.copyFromHeap(lightmapPtr, new Float32Array(floatCount));

// 7. Clean up
lm.lmDestroy(ctx);
lm.free(tmpPtr);
lm.free(lightmapPtr);
```

## Documentation

- [LIGHTMAPPER.md](LIGHTMAPPER.md) — full API reference
- [WASM_SETUP.md](WASM_SETUP.md) — Emscripten installation & build guide

## License

See the [original lightmapper repository](https://github.com/ands/lightmapper) for license details.
