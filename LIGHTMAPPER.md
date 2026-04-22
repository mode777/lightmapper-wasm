# Lightmapper WASM — Comprehensive API Reference

A browser-ready JavaScript/WebAssembly wrapper around [ands/lightmapper](https://github.com/ands/lightmapper), a single-header C library for baking lightmaps using your existing OpenGL (WebGL2) renderer.

This package compiles `lightmapper.h` to WebAssembly via Emscripten and exposes every public C function through a thin, type-safe JavaScript API. It handles WASM heap memory management, Emscripten WebGL context binding, and float-texture capability probing automatically.

---

## Table of Contents

1. [Module Initialization](#module-initialization)
   - [`createLightmapperModule(options?)`](#createlightmappermoduleoptions)
   - [`CreateLightmapperModuleOptions`](#createlightmappermoduleoptions-1)
2. [WebGL Context Management](#webgl-context-management)
3. [WASM Heap Memory Helpers](#wasm-heap-memory-helpers)
   - [Allocation](#allocation)
   - [Views (zero-copy)](#views-zero-copy)
   - [Copy helpers](#copy-helpers)
   - [Freeing memory](#freeing-memory)
4. [Constants](#constants)
5. [Core Lightmapping API](#core-lightmapping-api)
   - [`lmCreate`](#lmcreate)
   - [`lmDestroy`](#lmdestroy)
   - [`lmSetTargetLightmap`](#lmsettargetlightmap)
   - [`lmSetGeometry`](#lmsetgeometry)
   - [`lmBegin` / `lmEnd` / `lmProgress`](#lmbegin--lmend--lmprogress)
   - [`makeBeginFrameBuffers`](#makebeginframebuffers)
6. [Image Post-Processing](#image-post-processing)
   - [`lmImageMin` / `lmImageMax`](#lmimagemin--lmimagemax)
   - [`lmImageAdd` / `lmImageScale` / `lmImagePower`](#lmimageadd--lmimagescale--lmimagepower)
   - [`lmImageDilate` / `lmImageSmooth`](#lmimagedilate--lmimagesmooth)
   - [`lmImageDownsample`](#lmimagedownsample)
   - [`lmImageFtoUB`](#lmimageftub)
7. [Validation Helpers](#validation-helpers)
8. [Minimal Annotated Example](#minimal-annotated-example)
9. [Multi-Bounce Global Illumination](#multi-bounce-global-illumination)
10. [Multi-Object Scene Baking (Shared Atlas)](#multi-object-scene-baking-shared-atlas)
11. [Quality Tips](#quality-tips)
12. [Architecture Overview](#architecture-overview)

---

## Module Initialization

### `createLightmapperModule(options?)`

```ts
function createLightmapperModule(options?: CreateLightmapperModuleOptions): Promise<LightmapperModule>;
```

Loads the WASM binary, resolves a WebGL2 context, performs a float-texture capability probe, and returns the fully initialized `LightmapperModule`.

**Returns** a `Promise<LightmapperModule>` — the single entry point for all subsequent API calls.

### `CreateLightmapperModuleOptions`

| Property | Type | Default | Description |
|---|---|---|---|
| `webglContext` | `WebGL2RenderingContext` | — | Existing WebGL2 context. Takes priority over `canvas`. |
| `canvas` | `HTMLCanvasElement \| OffscreenCanvas` | — | Canvas to obtain a WebGL2 context from. Ignored if `webglContext` is set. |
| `moduleFactory` | `(opts?) => Promise<any>` | auto-import | Custom Emscripten module factory. Defaults to dynamic import of the build output. |
| `wasmModuleOptions` | `Record<string, unknown>` | `{}` | Options forwarded to the Emscripten factory (e.g. `locateFile`). |
| `emscriptenContextHandle` | `number` | — | An already-registered Emscripten WebGL context handle. Skips auto-discovery. |
| `autoRegisterEmscriptenContext` | `boolean` | `true` | Auto-register the WebGL2 context with Emscripten if no handle is found. |
| `emscriptenWebGLContextAttributes` | `Record<string, unknown>` | — | Override attributes for `GL.registerContext`. |
| `strictContextBinding` | `boolean` | `true` | Assert the bound context is current before GL-dependent calls. |
| `skipCapabilityCheck` | `boolean` | `false` | Skip the RGBA32F readback probe during init. |

If neither `webglContext` nor `canvas` is provided, a hidden `<canvas>` is created automatically.

---

## WebGL Context Management

The wrapper manages the Emscripten-side WebGL context so that the C code's GL calls target the correct canvas.

| Method | Description |
|---|---|
| `boundContextHandle` | Read-only property: the Emscripten handle bound at init time, or `0`. |
| `getCurrentContextHandle()` | Returns the handle that is currently active in Emscripten. |
| `makeBoundContextCurrent()` | Makes the bound context current. **Call this before any GL-dependent API** (`lmCreate`, `lmBegin`, `lmEnd`, etc.) or before switching back from your own rendering. |
| `assertBoundContextCurrent()` | Throws if strict binding is on and the bound context is not current. Called automatically by GL-dependent APIs. |

### When to call `makeBoundContextCurrent()`

You typically need it:
- Once at startup, after `createLightmapperModule`.
- Before each bake pass if your application switches GL contexts.
- Before each render-loop frame if you render your own scene between bake calls.

---

## WASM Heap Memory Helpers

All lightmapper data (vertices, indices, lightmap buffers) lives on the **WASM linear-memory heap**. The module provides typed allocation, zero-copy views, and copy utilities.

### Allocation

| Method | Signature | Description |
|---|---|---|
| `allocF32(count)` | `(count: number) => Pointer` | Allocate `count` × 4 bytes for `float` values. |
| `allocU8(count)` | `(count: number) => Pointer` | Allocate `count` bytes for `uint8` values. |
| `allocU16(count)` | `(count: number) => Pointer` | Allocate `count` × 2 bytes for `uint16` values. |
| `allocU32(count)` | `(count: number) => Pointer` | Allocate `count` × 4 bytes for `uint32` values. |

All return a `Pointer` (byte offset into the WASM heap). Free with `free(ptr)`.

### Views (zero-copy)

| Method | Signature | Description |
|---|---|---|
| `viewF32(ptr, count)` | `(ptr, count) => Float32Array` | Float32 view into the WASM heap. **Invalidated by any subsequent `alloc*` call** (heap may grow). |
| `viewU8(ptr, count)` | `(ptr, count) => Uint8Array` | Uint8 view. |
| `viewU16(ptr, count)` | `(ptr, count) => Uint16Array` | Uint16 view. |
| `viewU32(ptr, count)` | `(ptr, count) => Uint32Array` | Uint32 view. |

> **Warning:** Views are invalidated whenever the WASM heap grows (e.g. after another `alloc*` or `copyToHeap`). Use `copyFromHeap` for data that must persist.

### Copy helpers

| Method | Signature | Description |
|---|---|---|
| `copyToHeap(data)` | `(data: TypedArray) => Pointer` | Allocate + copy a JS typed array to the WASM heap. Supports `Float32Array`, `Uint8Array`, `Uint16Array`, `Uint32Array`. Free with `free()`. |
| `copyFromHeap(ptr, out)` | `(ptr, out: T) => T` | Copy `out.byteLength` bytes from the WASM heap into `out`. Returns `out`. |

### Freeing memory

```ts
free(ptr: Pointer): void;
```

Free a pointer returned by any `alloc*` or `copyToHeap` call. Always free WASM memory when done to avoid leaks.

---

## Constants

Populated at module initialization from the compiled WASM exports. These mirror the C `#define` values in `lightmapper.h`.

| Constant | C Equivalent | Typical Value | Purpose |
|---|---|---|---|
| `LM_NONE` | `0` | `0` | No type / disabled |
| `LM_UNSIGNED_BYTE` | `GL_UNSIGNED_BYTE` | `0x1401` | 8-bit unsigned element type |
| `LM_UNSIGNED_SHORT` | `GL_UNSIGNED_SHORT` | `0x1403` | 16-bit unsigned element type |
| `LM_UNSIGNED_INT` | `GL_UNSIGNED_INT` | `0x1405` | 32-bit unsigned element type |
| `LM_FLOAT` | `GL_FLOAT` | `0x1406` | 32-bit float element type |
| `LM_FALSE` | `0` | `0` | Boolean false |
| `LM_TRUE` | `1` | `1` | Boolean true |
| `LM_ALL_CHANNELS` | `0x0f` | `0x0f` | Channel mask: all channels |

---

## Core Lightmapping API

### `lmCreate`

```ts
lmCreate(
  hemisphereSize: number,                   // Resolution of hemisphere renderings (power of 2, typical: 64)
  zNear: number,                            // Near clip distance
  zFar: number,                             // Far clip distance
  clearR: number,                           // Sky/clear color R (also acts as ambient)
  clearG: number,                           // Sky/clear color G
  clearB: number,                           // Sky/clear color B
  interpolationPasses: number,              // Hierarchical interpolation passes (0–8)
  interpolationThreshold: number,           // Error threshold for interpolation (~0.01)
  cameraToSurfaceDistanceModifier?: number  // Height modifier (-1..+∞, default 0)
): LmContextHandle;
```

Creates a lightmapper context. The context is **reusable** across multiple lightmaps.

**Parameters explained:**

- **`hemisphereSize`**: Must be a power of two. Higher = better quality, slower. Typical values: 32 (fast/draft), 64 (balanced), 128 (high quality).
- **`zNear` / `zFar`**: Hemisphere rendering clip distances. Use values that cover your scene without too much wasted depth range (e.g. `0.001` – `100.0`).
- **`clearR/G/B`**: Background color for hemisphere renders. Acts as ambient/sky contribution to the lightmap.
- **`interpolationPasses`**: Number of hierarchical selective interpolation passes (0 = none, 8 = aggressive). Higher values bake faster but may miss fine lighting variations. Recommended: 2.
- **`interpolationThreshold`**: Error below which a texel is interpolated instead of rendered. Lower = more texels rendered = slower but higher quality. Recommended: ~`0.01`.
- **`cameraToSurfaceDistanceModifier`**: Controls hemisphere camera height above the surface.
  - `-1.0` — stick to surface
  - `0.0` — minimum height for smooth normals (default)
  - `> 0.0` — reduces flat-horizon artifacts on smooth surfaces, but may introduce others

**Throws** if the WebGL state is invalid or parameters are incorrect.

---

### `lmDestroy`

```ts
lmDestroy(ctx: LmContextHandle): void;
```

Frees all native resources for the given context. Always call this when baking is complete.

---

### `lmSetTargetLightmap`

```ts
lmSetTargetLightmap(
  ctx: LmContextHandle,
  outLightmapPtr: Pointer,    // WASM heap pointer to w×h×channels floats
  w: number,                  // Width in pixels
  h: number,                  // Height in pixels
  channels: number            // 1=Greyscale, 2=Greyscale+Alpha, 3=RGB, 4=RGBA
): void;
```

Binds an output buffer for the lightmapper to write into. The buffer must be allocated on the WASM heap with `allocF32(w * h * channels)`.

Must be called **before** `lmSetGeometry`.

---

### `lmSetGeometry`

```ts
lmSetGeometry(
  ctx: LmContextHandle,
  transformationMatrixPtr: Pointer,       // 4×4 float matrix (object-to-world) or 0 (identity)
  positionsType: number,                  // Element type, e.g. LM_FLOAT
  positionsXYZPtr: Pointer,               // Vertex position data (XYZ, object space)
  positionsStride: number,                // Byte stride (0 = tightly packed)
  normalsType: number,                    // LM_FLOAT or LM_NONE (flat surfaces)
  normalsXYZPtr: Pointer,                 // Normal data or 0
  normalsStride: number,                  // Byte stride or 0
  lightmapCoordsType: number,             // e.g. LM_FLOAT
  lightmapCoordsUVPtr: Pointer,           // Lightmap UV data ([0..1]×[0..1])
  lightmapCoordsStride: number,           // Byte stride or 0
  count: number,                          // Number of indices (indexed) or vertices
  indicesType?: number,                   // LM_UNSIGNED_SHORT, LM_UNSIGNED_INT, or LM_NONE
  indicesPtr?: Pointer                    // Index buffer pointer, or 0
): void;
```

Binds triangle geometry to the current target lightmap.

**Vertex layout with interleaved position + UV (common pattern):**

If your vertex buffer is interleaved as `[x, y, z, u, v]` (5 floats = 20 bytes stride), you can point positions and UVs into the same buffer with different offsets:

```js
const STRIDE = 5 * 4; // 20 bytes
lm.lmSetGeometry(ctx, 0,                                   // no transform
  lm.LM_FLOAT, verticesPtr,           STRIDE,              // positions at offset 0
  lm.LM_NONE,  0,                     0,                   // no normals
  lm.LM_FLOAT, verticesPtr + 3 * 4,   STRIDE,              // UVs at offset 12
  indexCount, lm.LM_UNSIGNED_SHORT, indicesPtr);
```

---

### `lmBegin` / `lmEnd` / `lmProgress`

```ts
lmBegin(
  ctx: LmContextHandle,
  outViewport4Ptr: Pointer,          // Receives 4 ints: { x, y, w, h }
  outView4x4Ptr: Pointer,           // Receives 4×4 view matrix (16 floats)
  outProjection4x4Ptr: Pointer      // Receives 4×4 projection matrix (16 floats)
): boolean;

lmEnd(ctx: LmContextHandle): void;

lmProgress(ctx: LmContextHandle): number;   // 0.0 → 1.0
```

These three functions form the **bake loop**:

1. Call `lmBegin`. If it returns `true`, render your scene using the output camera parameters.
2. Call `lmEnd` after rendering.
3. Repeat until `lmBegin` returns `false` (all texels processed).
4. Optionally call `lmProgress` between begin/end to report progress.

> **Important:** Do **not** call `glClear` yourself inside the bake loop — the lightmapper manages the framebuffer state.

---

### `makeBeginFrameBuffers`

```ts
makeBeginFrameBuffers(): BeginFrameBuffers;
```

Convenience method that allocates the three WASM-heap buffers needed by `lmBegin` and returns an object with pointers and read helpers:

```ts
interface BeginFrameBuffers {
  viewportPtr: Pointer;               // 4 × int32
  viewPtr: Pointer;                   // 16 × float32
  projectionPtr: Pointer;             // 16 × float32
  readViewport(): Int32Array;         // copy viewport to JS
  readViewMatrix(): Float32Array;     // copy view matrix to JS
  readProjectionMatrix(): Float32Array; // copy projection matrix to JS
  dispose(): void;                    // free all three buffers
}
```

Always call `dispose()` when the bake loop is complete.

---

## Image Post-Processing

All post-processing functions operate on WASM-heap float image buffers. The `channels` parameter (`c`) must match the buffer layout (1–4). The optional `mask` parameter is a bitmask selecting which channels to affect (`0x01` = channel 0, `0x02` = channel 1, `0x04` = channel 2, `0x08` = channel 3, `0x0f` = all).

### `lmImageMin` / `lmImageMax`

```ts
lmImageMin(imagePtr, w, h, channels, mask?): number;
lmImageMax(imagePtr, w, h, channels, mask?): number;
```

Return the minimum/maximum value across the specified channels.

### `lmImageAdd` / `lmImageScale` / `lmImagePower`

```ts
lmImageAdd(imagePtr, w, h, channels, value, mask?): void;    // image[i] += value
lmImageScale(imagePtr, w, h, channels, factor, mask?): void;  // image[i] *= factor
lmImagePower(imagePtr, w, h, channels, exponent, mask?): void; // image[i] = pow(image[i], exponent)
```

In-place arithmetic on the specified channels. `lmImagePower` is typically used for **gamma correction**:

```js
// Apply gamma to RGB channels only (mask 0x7 = channels 0,1,2)
lm.lmImagePower(lightmapPtr, W, H, 4, 1.0 / 2.2, 0x7);
```

### `lmImageDilate` / `lmImageSmooth`

```ts
lmImageDilate(imagePtr, outImagePtr, w, h, channels): void;
lmImageSmooth(imagePtr, outImagePtr, w, h, channels): void;
```

- **Dilate**: Expands populated (non-zero) areas by 1 pixel. Useful for eliminating black-edge seams.
- **Smooth**: Box-filter blur applied only to non-zero values.

Both require **two separate buffers** (source and destination). To dilate multiple passes, ping-pong between them:

```js
for (let i = 0; i < 16; i++) {
  lm.lmImageDilate(lightmapPtr, tempPtr, W, H, C);
  lm.lmImageDilate(tempPtr, lightmapPtr, W, H, C);
}
```

### `lmImageDownsample`

```ts
lmImageDownsample(imagePtr, outImagePtr, w, h, channels): void;
```

Downsamples from `[w × h]` to `[w/2 × h/2]` by averaging only non-zero values. The output buffer must be allocated for `(w/2) * (h/2) * channels` floats.

### `lmImageFtoUB`

```ts
lmImageFtoUB(imagePtr, outImagePtr, w, h, channels, maxValue?): void;
```

Converts a float image to 8-bit unsigned byte format. Pass `maxValue = 0` to auto-detect the range from the image data. The output buffer must be allocated with `allocU8(w * h * channels)`.

---

## Validation Helpers

```ts
validateLightmapShape(w: number, h: number, channels: number, floatCount: number): void;
validateStrideBytes(stride: number, elementSize: number): void;
```

- **`validateLightmapShape`**: Asserts `w * h * channels === floatCount`. Catches allocation mismatches early.
- **`validateStrideBytes`**: Asserts stride is 0 (tightly packed) or ≥ `elementSize`.

---

## Minimal Annotated Example

A complete, minimal browser example that loads a mesh, bakes a single-bounce lightmap, post-processes it, and uploads the result to a GPU texture.

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Lightmapper Minimal</title></head>
<body>
<canvas id="viewport" width="800" height="600"></canvas>
<script type="module">
import { createLightmapperModule } from "lightmapper-wasm";

// ─── Your scene setup (replace with your own mesh loader) ───
// Vertex layout: [x, y, z, u, v] per vertex (interleaved)
// Indices: Uint16Array of triangle indices
// Lightmap UVs must be in [0..1]×[0..1] and non-overlapping.
const VERTEX_STRIDE = 5 * 4; // 20 bytes

async function main() {
  // ─── 1. Create WebGL2 context ───
  const canvas = document.getElementById("viewport");
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("WebGL2 not available");

  // ─── 2. Initialize lightmapper WASM module ───
  const lm = await createLightmapperModule({
    canvas,
    webglContext: gl,
    autoRegisterEmscriptenContext: true,
  });
  lm.makeBoundContextCurrent();

  // ─── 3. Load mesh data (your own loader) ───
  // For this example, assume loadMyMesh() returns:
  //   { vertices: Float32Array, indices: Uint16Array, indexCount: number }
  const mesh = await loadMyMesh();

  // ─── 4. Upload mesh to WASM heap ───
  const verticesPtr = lm.copyToHeap(mesh.vertices);
  const indicesPtr  = lm.copyToHeap(mesh.indices);

  // ─── 5. Allocate lightmap buffers ───
  const W = 256, H = 256, C = 4; // RGBA float lightmap
  const floatCount = W * H * C;
  const lightmapPtr = lm.allocF32(floatCount);
  const tempPtr     = lm.allocF32(floatCount);

  // Clear lightmap to black
  lm.viewF32(lightmapPtr, floatCount).fill(0);

  // ─── 6. Create lightmapper context ───
  const ctx = lm.lmCreate(
    64,         // hemisphereSize — quality/resolution (power of 2)
    0.001,      // zNear
    100.0,      // zFar
    0.0,        // clearR — sky/ambient red   (0 = no ambient)
    0.0,        // clearG — sky/ambient green
    0.0,        // clearB — sky/ambient blue
    2,          // interpolationPasses — speedup (0 = none, higher = faster)
    0.01,       // interpolationThreshold — quality vs speed tradeoff
    0.0         // cameraToSurfaceDistanceModifier
  );

  // ─── 7. Bind lightmap output and geometry ───
  lm.lmSetTargetLightmap(ctx, lightmapPtr, W, H, C);
  lm.lmSetGeometry(
    ctx,
    0,                                  // transformationMatrixPtr (0 = identity)
    lm.LM_FLOAT,                       // positionsType
    verticesPtr,                        // positionsXYZPtr — XYZ at byte offset 0
    VERTEX_STRIDE,                      // positionsStride
    lm.LM_NONE,                        // normalsType (LM_NONE = flat shading)
    0,                                  // normalsXYZPtr
    0,                                  // normalsStride
    lm.LM_FLOAT,                       // lightmapCoordsType
    verticesPtr + 3 * 4,               // lightmapCoordsUVPtr — UV at byte offset 12
    VERTEX_STRIDE,                      // lightmapCoordsStride
    mesh.indexCount,                    // count (number of indices)
    lm.LM_UNSIGNED_SHORT,              // indicesType
    indicesPtr                          // indicesPtr
  );

  // ─── 8. Bake loop ───
  // Allocate buffers for per-frame camera output
  const bufs = lm.makeBeginFrameBuffers();

  while (lm.lmBegin(ctx, bufs.viewportPtr, bufs.viewPtr, bufs.projectionPtr)) {
    // Read camera parameters from WASM heap
    const vp   = bufs.readViewport();        // Int32Array [x, y, w, h]
    const view = bufs.readViewMatrix();       // Float32Array (4×4 column-major)
    const proj = bufs.readProjectionMatrix(); // Float32Array (4×4 column-major)

    // Set viewport and render your scene (do NOT call gl.clear!)
    gl.viewport(vp[0], vp[1], vp[2], vp[3]);
    drawScene(gl, view, proj); // ← your scene render function

    // Signal that this hemisphere is done
    lm.lmEnd(ctx);
  }

  bufs.dispose(); // free camera output buffers

  // ─── 9. Post-process the lightmap ───
  // Dilate to fill seam gaps (ping-pong between buffers)
  for (let i = 0; i < 16; i++) {
    lm.lmImageDilate(lightmapPtr, tempPtr, W, H, C);
    lm.lmImageDilate(tempPtr, lightmapPtr, W, H, C);
  }

  // Smooth once to reduce noise
  lm.lmImageSmooth(lightmapPtr, tempPtr, W, H, C);
  lm.lmImageDilate(tempPtr, lightmapPtr, W, H, C);

  // Gamma correct RGB channels only (mask 0x7)
  lm.lmImagePower(lightmapPtr, W, H, C, 1.0 / 2.2, 0x7);

  // ─── 10. Read back and upload to GPU ───
  const finalData = lm.copyFromHeap(lightmapPtr, new Float32Array(floatCount));

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, W, H, 0, gl.RGBA, gl.FLOAT, finalData);

  // ─── 11. Clean up WASM resources ───
  lm.lmDestroy(ctx);
  lm.free(tempPtr);
  lm.free(lightmapPtr);
  lm.free(verticesPtr);
  lm.free(indicesPtr);

  console.log("Lightmap baked successfully!");
}

// Your scene drawing function — called once per hemisphere sample
function drawScene(gl, viewMatrix, projectionMatrix) {
  // Bind your VAO, set uniforms (view, projection, lightmap texture),
  // and issue gl.drawElements / gl.drawArrays.
  // The lightmapper reads back the framebuffer after each call.
  //
  // TIP: Write (gl_FrontFacing ? 1.0 : 0.0) into the alpha channel
  // so the lightmapper can discard invalid backface samples.
}

main().catch(console.error);
</script>
</body>
</html>
```

---

## Multi-Bounce Global Illumination

For indirect lighting (color bleeding, soft shadows), run multiple bounces. After each bounce, upload the intermediate lightmap to the GPU so subsequent bounces see the accumulated light.

```js
const totalBounces = 3;

for (let bounce = 0; bounce < totalBounces; bounce++) {
  // Create a fresh context per bounce
  const ctx = lm.lmCreate(64, 0.001, 100.0, 0.1, 0.1, 0.1, 2, 0.01, 0.0);

  // Clear the output buffer for this bounce
  lm.viewF32(lightmapPtr, floatCount).fill(0);

  // Bind target + geometry
  lm.lmSetTargetLightmap(ctx, lightmapPtr, W, H, C);
  lm.lmSetGeometry(ctx, 0, /* ...same as above... */);

  // Bake this bounce
  const bufs = lm.makeBeginFrameBuffers();
  while (lm.lmBegin(ctx, bufs.viewportPtr, bufs.viewPtr, bufs.projectionPtr)) {
    const vp = bufs.readViewport();
    gl.viewport(vp[0], vp[1], vp[2], vp[3]);
    drawScene(gl, bufs.readViewMatrix(), bufs.readProjectionMatrix());
    lm.lmEnd(ctx);
  }
  bufs.dispose();
  lm.lmDestroy(ctx);

  // Post-process this bounce
  for (let i = 0; i < 16; i++) {
    lm.lmImageDilate(lightmapPtr, tempPtr, W, H, C);
    lm.lmImageDilate(tempPtr, lightmapPtr, W, H, C);
  }
  lm.lmImageSmooth(lightmapPtr, tempPtr, W, H, C);
  lm.lmImageDilate(tempPtr, lightmapPtr, W, H, C);

  // Upload to GPU so the NEXT bounce sees this indirect light
  const bounceData = lm.copyFromHeap(lightmapPtr, new Float32Array(floatCount));
  gl.bindTexture(gl.TEXTURE_2D, lightmapTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, W, H, 0, gl.RGBA, gl.FLOAT, bounceData);
}

// Final gamma correction after all bounces
lm.lmImagePower(lightmapPtr, W, H, C, 1.0 / 2.2, 0x7);
```

---

## Multi-Object Scene Baking (Shared Atlas)

A common scenario is baking a full scene where multiple objects with individual geometry share a single lightmap texture atlas. Each object's lightmap UVs occupy a non-overlapping region of the atlas.

### CPU buffer vs. GPU texture — why it works

The lightmapper maintains two independent copies of the lightmap:

| Copy | Location | Role |
|---|---|---|
| **CPU buffer** | WASM heap (`lightmapPtr`) | `lmBegin`/`lmEnd` **write** baked results here |
| **GPU texture** | WebGL `TEXTURE_2D` | Your `drawScene` **reads** this during hemisphere rendering |

During baking, the hemisphere cameras render whatever your shader samples from the **GPU texture**. They never read the CPU buffer. This separation is what makes multi-object baking safe.

### The key rule

> **Do not upload the CPU lightmap to the GPU texture until all objects finish their current bounce.**

If you upload mid-bounce (after object A but before object B), object B's hemisphere cameras would see object A's freshly baked light on the GPU texture — creating asymmetric, incorrect single-bounce results where A's light "leaks" into B but not vice versa.

### Correct multi-object bake loop

```js
// Assume:
//   objects[]        — array of scene objects, each with its own geometry
//   atlasW, atlasH   — shared lightmap atlas dimensions
//   atlasTexture     — GPU texture handle for the shared atlas
//   lightmapPtr      — WASM heap buffer for the full atlas (atlasW × atlasH × C floats)
//   tempPtr          — WASM heap temp buffer (same size)

const C = 4;
const floatCount = atlasW * atlasH * C;
const totalBounces = 3;

for (let bounce = 0; bounce < totalBounces; bounce++) {
  // 1. Clear the CPU buffer once at the start of each bounce
  lm.viewF32(lightmapPtr, floatCount).fill(0);

  // 2. Bake every object — all write to different atlas regions
  for (const obj of objects) {
    const ctx = lm.lmCreate(64, 0.001, 100.0, 0.1, 0.1, 0.1, 2, 0.01, 0.0);

    // All objects share the same target lightmap buffer and atlas dimensions
    lm.lmSetTargetLightmap(ctx, lightmapPtr, atlasW, atlasH, C);

    // Each object binds its own geometry and UVs (non-overlapping atlas regions)
    lm.lmSetGeometry(
      ctx,
      obj.transformPtr,                           // per-object world transform (or 0)
      lm.LM_FLOAT, obj.verticesPtr, obj.stride,   // positions
      lm.LM_NONE, 0, 0,                           // normals (flat)
      lm.LM_FLOAT,                                // lightmap UV type
      obj.verticesPtr + obj.uvByteOffset,          // lightmap UVs
      obj.stride,
      obj.indexCount, lm.LM_UNSIGNED_SHORT, obj.indicesPtr
    );

    // Bake loop for this object
    const bufs = lm.makeBeginFrameBuffers();
    while (lm.lmBegin(ctx, bufs.viewportPtr, bufs.viewPtr, bufs.projectionPtr)) {
      const vp = bufs.readViewport();
      gl.viewport(vp[0], vp[1], vp[2], vp[3]);

      // IMPORTANT: draw ALL objects (the full scene), not just the current one.
      // The hemisphere camera needs to "see" the entire scene to capture
      // correct lighting, shadows, and inter-object light transfer.
      // The GPU lightmap texture is UNCHANGED at this point.
      drawAllObjects(gl, bufs.readViewMatrix(), bufs.readProjectionMatrix());

      lm.lmEnd(ctx);
    }
    bufs.dispose();
    lm.lmDestroy(ctx);
  }

  // 3. Post-process the combined atlas ONCE after all objects
  for (let i = 0; i < 16; i++) {
    lm.lmImageDilate(lightmapPtr, tempPtr, atlasW, atlasH, C);
    lm.lmImageDilate(tempPtr, lightmapPtr, atlasW, atlasH, C);
  }
  lm.lmImageSmooth(lightmapPtr, tempPtr, atlasW, atlasH, C);
  lm.lmImageDilate(tempPtr, lightmapPtr, atlasW, atlasH, C);

  // 4. Upload to GPU ONCE — now the next bounce will see indirect light
  const bounceData = lm.copyFromHeap(lightmapPtr, new Float32Array(floatCount));
  gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.RGBA32F, atlasW, atlasH, 0,
    gl.RGBA, gl.FLOAT, bounceData
  );
}

// Final gamma correction
lm.lmImagePower(lightmapPtr, atlasW, atlasH, C, 1.0 / 2.2, 0x7);
const finalData = lm.copyFromHeap(lightmapPtr, new Float32Array(floatCount));
gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, atlasW, atlasH, 0, gl.RGBA, gl.FLOAT, finalData);
```

### Why this is safe

1. **Non-overlapping UVs** — each object writes to distinct texels of the shared CPU buffer, so their results don't overwrite each other.
2. **Stable GPU texture within a bounce** — the GPU texture stays at its previous-bounce state (black on bounce 1) while all objects bake, so no object "sees" another's freshly-baked light.
3. **Symmetric light transfer** — every hemisphere camera sees the same GPU lightmap state, ensuring physically consistent results within each bounce.
4. **Indirect light across bounces** — bounce 2+ naturally picks up indirect light (color bleeding between objects) because the GPU texture now contains the combined result from all prior bounces.

### Common mistakes to avoid

| Mistake | Consequence |
|---|---|
| Uploading the CPU lightmap to the GPU texture **between objects** within the same bounce | Asymmetric lighting — earlier objects influence later ones but not vice versa |
| Drawing only the current object in `drawScene` during baking | Other objects become invisible to the hemisphere cameras → missing shadows and occlusion |
| Forgetting to clear the CPU buffer at the start of each bounce | Results accumulate incorrectly across bounces |
| Using overlapping UVs in the atlas | Objects overwrite each other's lightmap texels |

---

## Quality Tips

### Backface culling and alpha channel

Disable backface culling during bake renders and write `gl_FrontFacing ? 1.0 : 0.0` into the fragment alpha channel. The lightmapper uses this to discard samples that hit backfaces, and `lmImageDilate` fills in the resulting gaps.

```glsl
// Fragment shader during bake
out vec4 o_color;
void main() {
  vec3 lighting = /* your lighting calculation */;
  o_color = vec4(lighting, gl_FrontFacing ? 1.0 : 0.0);
}
```

### Interpolation tuning

| Setting | Effect |
|---|---|
| `interpolationPasses = 0` | Every texel rendered — highest quality, slowest |
| `interpolationPasses = 2, threshold = 0.01` | Good balance for most scenes |
| `interpolationPasses = 4, threshold = 0.05` | Fast previews, may miss sharp shadows |

Higher `interpolationPasses` with the same threshold gives larger speedups on bigger lightmaps (up to ~10× on large maps).

### Hemisphere resolution

| `hemisphereSize` | Quality | Speed |
|---|---|---|
| 16 | Very low (draft) | Very fast |
| 32 | Low | Fast |
| 64 | Medium (recommended) | Moderate |
| 128 | High | Slow |
| 256 | Very high | Very slow |

### Emissive surfaces

Any surface rendered with HDR emissive colors during the bake loop contributes light to the lightmap. This supports arbitrary light shapes — point lights, area lights, neon strips, etc. — by simply drawing emissive geometry in `drawScene`.

### Lightmap UV preparation

Lightmap UVs must:
- Be in the `[0..1]×[0..1]` range.
- Be **non-overlapping** (each triangle gets unique atlas space).
- Have adequate padding between charts to avoid bleed.

Use tools like [xatlas](https://github.com/jpcy/xatlas), [UVAtlas](https://github.com/microsoft/UVAtlas), or [thekla_atlas](https://github.com/Thekla/thekla_atlas) to generate lightmap UVs.

### Async bake loop for responsive UI

Avoid freezing the browser by yielding to the event loop periodically:

```js
const BUDGET_MS = 30; // ms per frame budget
let baking = true;
while (baking) {
  const start = performance.now();
  while (performance.now() - start < BUDGET_MS) {
    if (!lm.lmBegin(ctx, bufs.viewportPtr, bufs.viewPtr, bufs.projectionPtr)) {
      baking = false;
      break;
    }
    gl.viewport(...bufs.readViewport());
    drawScene(gl, bufs.readViewMatrix(), bufs.readProjectionMatrix());
    lm.lmEnd(ctx);
  }
  // Yield to browser — update progress UI
  const progress = lm.lmProgress(ctx);
  statusEl.textContent = `${(progress * 100).toFixed(1)}%`;
  await new Promise(r => requestAnimationFrame(r));
}
```

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│  Browser (ES Module)                                 │
│                                                      │
│  src/index.js                                        │
│  ├─ createLightmapperModule()  — module init         │
│  ├─ WASM heap helpers          — alloc/free/view     │
│  ├─ Context management         — Emscripten GL bind  │
│  └─ lm* wrappers              — validated API calls  │
│                                                      │
│  types/index.d.ts              — TypeScript types     │
├──────────────────────────────────────────────────────┤
│  WASM (Emscripten)                                   │
│                                                      │
│  wasm/lightmapper_wasm.c       — thin C shims        │
│  ├─ lmwCreate, lmwDestroy, …   (EMSCRIPTEN_KEEPALIVE)│
│  └─ constant getters            (LM_NONE, LM_FLOAT…) │
│                                                      │
│  thirdparty/lightmapper/lightmapper.h                │
│  └─ Full lightmapper implementation (header-only C)  │
├──────────────────────────────────────────────────────┤
│  WebGL2 (browser GPU)                                │
│  └─ Hemisphere rendering + lightmap readback         │
└──────────────────────────────────────────────────────┘
```

The data flow during baking:

1. JavaScript allocates lightmap/vertex/index buffers on the WASM heap.
2. `lmCreate` sets up internal GL framebuffers for hemisphere rendering.
3. Each `lmBegin` call outputs camera parameters for one lightmap texel.
4. JavaScript renders the scene via WebGL2 using those parameters.
5. `lmEnd` reads back the hemisphere render and accumulates into the lightmap buffer.
6. Post-processing functions operate on the WASM-heap lightmap in-place.
7. `copyFromHeap` transfers the final lightmap to JavaScript for GPU upload.

---

## License

The underlying [lightmapper.h](https://github.com/ands/lightmapper) by Andreas Mantler is **public domain**. This WASM wrapper inherits the same permissive terms.
