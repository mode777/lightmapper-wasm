/**
 * Opaque WASM heap pointer represented as a non-negative integer.
 * Obtained via `alloc*` or `copyToHeap` and freed with `free`.
 */
export type Pointer = number;

/**
 * Opaque handle to a native `lm_context` allocated on the WASM heap.
 * Created by {@link LightmapperModule.lmCreate} and destroyed by {@link LightmapperModule.lmDestroy}.
 */
export type LmContextHandle = number;

/**
 * Numeric constants mirroring the C lightmapper type/flag enums.
 * Populated at module initialization from the compiled WASM exports.
 */
export interface LightmapperConstants {
  /** No type / disabled. Corresponds to C `LM_NONE` (0). */
  readonly LM_NONE: number;
  /** Unsigned 8-bit element type, maps to `GL_UNSIGNED_BYTE`. */
  readonly LM_UNSIGNED_BYTE: number;
  /** Unsigned 16-bit element type, maps to `GL_UNSIGNED_SHORT`. */
  readonly LM_UNSIGNED_SHORT: number;
  /** Unsigned 32-bit element type, maps to `GL_UNSIGNED_INT`. */
  readonly LM_UNSIGNED_INT: number;
  /** 32-bit float element type, maps to `GL_FLOAT`. */
  readonly LM_FLOAT: number;
  /** Boolean false (0). */
  readonly LM_FALSE: number;
  /** Boolean true (1). */
  readonly LM_TRUE: number;
  /** Channel mask selecting all channels (0x0f). */
  readonly LM_ALL_CHANNELS: number;
}

/**
 * Pre-allocated WASM-heap buffers used to receive per-frame camera
 * parameters from {@link LightmapperModule.lmBegin}.
 *
 * Call {@link dispose} when the lightmapping loop is complete to free
 * the underlying WASM memory.
 */
export interface BeginFrameBuffers {
  /** Pointer to a 4-element `int` array: `{ x, y, w, h }`. */
  viewportPtr: Pointer;
  /** Pointer to a 16-element `float` array (4×4 view matrix, column-major). */
  viewPtr: Pointer;
  /** Pointer to a 16-element `float` array (4×4 projection matrix, column-major). */
  projectionPtr: Pointer;
  /** Copy the current viewport from the WASM heap into a new `Int32Array`. */
  readViewport(): Int32Array;
  /** Copy the current view matrix from the WASM heap into a new `Float32Array`. */
  readViewMatrix(): Float32Array;
  /** Copy the current projection matrix from the WASM heap into a new `Float32Array`. */
  readProjectionMatrix(): Float32Array;
  /** Free all three underlying WASM heap allocations. */
  dispose(): void;
}

/**
 * The main API surface returned by {@link createLightmapperModule}.
 *
 * Provides WASM heap memory helpers, Emscripten WebGL context management,
 * and thin wrappers around every public C `lm*` function from `lightmapper.h`.
 */
export interface LightmapperModule extends LightmapperConstants {
  /** The Emscripten WebGL context handle bound during initialization, or `0` if none. */
  readonly boundContextHandle: number;

  /**
   * Return the Emscripten WebGL context handle that is currently active
   * (calls `emscripten_webgl_get_current_context` internally).
   */
  getCurrentContextHandle(): number;

  /**
   * Throw if strict context binding is enabled and the bound context
   * is not the current Emscripten WebGL context.
   * Called automatically by GL-dependent APIs (`lmCreate`, `lmBegin`, etc.).
   */
  assertBoundContextCurrent(): void;

  /**
   * Make the bound Emscripten WebGL context current via
   * `emscripten_webgl_make_context_current`.
   * @throws If no bound context handle is available or the call fails.
   */
  makeBoundContextCurrent(): void;

  /**
   * Allocate `count` 32-bit floats on the WASM heap.
   * @param count - Number of `float` elements (not bytes).
   * @returns Heap pointer (byte offset). Free with {@link free}.
   */
  allocF32(count: number): Pointer;

  /**
   * Allocate `count` unsigned bytes on the WASM heap.
   * @param count - Number of `uint8` elements.
   * @returns Heap pointer. Free with {@link free}.
   */
  allocU8(count: number): Pointer;

  /**
   * Allocate `count` unsigned 16-bit integers on the WASM heap.
   * @param count - Number of `uint16` elements (not bytes).
   * @returns Heap pointer. Free with {@link free}.
   */
  allocU16(count: number): Pointer;

  /**
   * Allocate `count` unsigned 32-bit integers on the WASM heap.
   * @param count - Number of `uint32` elements (not bytes).
   * @returns Heap pointer. Free with {@link free}.
   */
  allocU32(count: number): Pointer;

  /**
   * Free a previously allocated WASM heap pointer.
   * @param ptr - Pointer returned by an `alloc*` or `copyToHeap` call.
   */
  free(ptr: Pointer): void;

  /**
   * Create a `Float32Array` view into the WASM heap without copying.
   * The view becomes invalid if the heap grows (e.g. after another `alloc*`).
   * @param ptr - Byte offset into the WASM heap.
   * @param count - Number of `float` elements.
   */
  viewF32(ptr: Pointer, count: number): Float32Array;

  /**
   * Create a `Uint8Array` view into the WASM heap without copying.
   * @param ptr - Byte offset into the WASM heap.
   * @param count - Number of `uint8` elements.
   */
  viewU8(ptr: Pointer, count: number): Uint8Array;

  /**
   * Create a `Uint16Array` view into the WASM heap without copying.
   * @param ptr - Byte offset into the WASM heap.
   * @param count - Number of `uint16` elements.
   */
  viewU16(ptr: Pointer, count: number): Uint16Array;

  /**
   * Create a `Uint32Array` view into the WASM heap without copying.
   * @param ptr - Byte offset into the WASM heap.
   * @param count - Number of `uint32` elements.
   */
  viewU32(ptr: Pointer, count: number): Uint32Array;

  /**
   * Allocate WASM heap memory and copy the contents of a typed array into it.
   * @param data - Source typed array (`Float32Array`, `Uint8Array`, `Uint16Array`, or `Uint32Array`).
   * @returns Heap pointer to the copied data. Free with {@link free}.
   */
  copyToHeap(data: Float32Array | Uint8Array | Uint16Array | Uint32Array): Pointer;

  /**
   * Copy bytes from the WASM heap into an existing typed array.
   * @param ptr - Source byte offset on the WASM heap.
   * @param out - Destination typed array; its `byteLength` determines how many bytes are copied.
   * @returns The same `out` array for convenience.
   */
  copyFromHeap<T extends Float32Array | Uint8Array | Uint16Array | Uint32Array>(ptr: Pointer, out: T): T;

  /**
   * Assert that `w * h * channels === floatCount`.
   * @throws If any dimension is invalid or the total does not match.
   */
  validateLightmapShape(w: number, h: number, channels: number, floatCount: number): void;

  /**
   * Assert that `stride` is either 0 (tightly packed) or at least `elementSize`.
   * @throws If `stride` is negative or smaller than `elementSize`.
   */
  validateStrideBytes(stride: number, elementSize: number): void;

  /**
   * Allocate viewport (4 × uint32), view-matrix (16 × float32), and
   * projection-matrix (16 × float32) buffers on the WASM heap, returning
   * an object with pointers and convenience read helpers.
   *
   * Call `dispose()` on the returned object when finished.
   */
  makeBeginFrameBuffers(): BeginFrameBuffers;

  /**
   * Create a new lightmapper context. Can be reused across multiple lightmaps.
   *
   * @param hemisphereSize - Resolution of hemisphere renderings; must be a power of two (typical: 64).
   * @param zNear - Hemisphere minimum draw distance.
   * @param zFar - Hemisphere maximum draw distance.
   * @param clearR - Background / sky color red component.
   * @param clearG - Background / sky color green component.
   * @param clearB - Background / sky color blue component.
   * @param interpolationPasses - Hierarchical selective interpolation passes (0–8; initial step size = 2^passes).
   * @param interpolationThreshold - Error threshold below which pixels are interpolated instead of rendered (~0.01).
   * @param cameraToSurfaceDistanceModifier - Height modifier for rendered hemispheres above the surface
   *   (-1 = stick to surface, 0 = minimum height, >0 = improved gradients but may introduce artifacts).
   * @returns Opaque context handle.
   * @throws If the WASM call returns null (invalid GL state or parameters).
   */
  lmCreate(
    hemisphereSize: number,
    zNear: number,
    zFar: number,
    clearR: number,
    clearG: number,
    clearB: number,
    interpolationPasses: number,
    interpolationThreshold: number,
    cameraToSurfaceDistanceModifier?: number
  ): LmContextHandle;

  /**
   * Configure the context with a cosine-weighted hemisphere.
   *
   * The default lightmapper weighting is uniform (all incoming directions
   * count equally). Calling this after {@link lmCreate} and before the first
   * hemisphere pass makes diffuse integration proportional to `cos(theta)`,
   * which is the usual weight for a Lambertian surface. The call only uploads
   * the context's weight texture and does not create additional JS resources.
   *
   * @param ctx - Context handle returned by {@link lmCreate}.
   * @throws If the context is invalid or no WebGL2 context is bound.
   */
  lmSetCosineWeights(ctx: LmContextHandle): void;

  /**
   * Destroy a lightmapper context and free its native resources.
   * @param ctx - Context handle returned by {@link lmCreate}.
   */
  lmDestroy(ctx: LmContextHandle): void;

  /**
   * Set the output lightmap image buffer.
   *
   * @param ctx - Lightmapper context handle.
   * @param outLightmapPtr - Pointer to a `w * h * channels` float buffer on the WASM heap.
   * @param w - Lightmap width in pixels.
   * @param h - Lightmap height in pixels.
   * @param channels - Number of color channels (1 = greyscale, 2 = greyscale+alpha, 3 = RGB, 4 = RGBA).
   */
  lmSetTargetLightmap(
    ctx: LmContextHandle,
    outLightmapPtr: Pointer,
    w: number,
    h: number,
    channels: number
  ): void;

  /**
   * Bind geometry for the currently set target lightmap.
   * Must be called after {@link lmSetTargetLightmap}.
   *
   * @param ctx - Lightmapper context handle.
   * @param transformationMatrixPtr - Pointer to a 4×4 object-to-world float matrix, or 0 for identity.
   * @param positionsType - Element type for positions (e.g. `LM_FLOAT`).
   * @param positionsXYZPtr - Pointer to vertex position data (XYZ, object space).
   * @param positionsStride - Byte stride between consecutive positions (0 = tightly packed).
   * @param normalsType - Element type for normals, or `LM_NONE` for flat surfaces.
   * @param normalsXYZPtr - Pointer to vertex normal data (XYZ, object space).
   * @param normalsStride - Byte stride between consecutive normals (0 = tightly packed).
   * @param lightmapCoordsType - Element type for lightmap UVs (e.g. `LM_FLOAT`).
   * @param lightmapCoordsUVPtr - Pointer to lightmap atlas texture coordinates (UV in [0..1]).
   * @param lightmapCoordsStride - Byte stride between consecutive UVs (0 = tightly packed).
   * @param count - Number of indices (if indexed) or vertices.
   * @param indicesType - Index element type, or `LM_NONE` for non-indexed geometry.
   * @param indicesPtr - Pointer to index data, or 0 if non-indexed.
   */
  lmSetGeometry(
    ctx: LmContextHandle,
    transformationMatrixPtr: Pointer,
    positionsType: number,
    positionsXYZPtr: Pointer,
    positionsStride: number,
    normalsType: number,
    normalsXYZPtr: Pointer,
    normalsStride: number,
    lightmapCoordsType: number,
    lightmapCoordsUVPtr: Pointer,
    lightmapCoordsStride: number,
    count: number,
    indicesType?: number,
    indicesPtr?: Pointer
  ): void;

  /**
   * Advance to the next lightmap texel and output camera parameters.
   * Returns `true` while there are remaining texels to render; the caller
   * must render the scene using the output viewport/view/projection and
   * then call {@link lmEnd}.
   *
   * @param ctx - Lightmapper context handle.
   * @param outViewport4Ptr - Pointer to receive 4 ints: `{ x, y, w, h }`.
   * @param outView4x4Ptr - Pointer to receive the 4×4 view matrix (16 floats).
   * @param outProjection4x4Ptr - Pointer to receive the 4×4 projection matrix (16 floats).
   * @returns `true` if the scene should be rendered with the output parameters, `false` when done.
   */
  lmBegin(
    ctx: LmContextHandle,
    outViewport4Ptr: Pointer,
    outView4x4Ptr: Pointer,
    outProjection4x4Ptr: Pointer
  ): boolean;

  /**
   * Finish the current hemisphere rendering pass. Must follow a `true` return from {@link lmBegin}.
   * @param ctx - Lightmapper context handle.
   */
  lmEnd(ctx: LmContextHandle): void;

  /**
   * Query the lightmapping progress. Only valid between {@link lmBegin}/{@link lmEnd}.
   * @param ctx - Lightmapper context handle.
   * @returns Progress value increasing from 0.0 to 1.0.
   */
  lmProgress(ctx: LmContextHandle): number;

  /**
   * Find the minimum value across the specified channels of a float lightmap image.
   * @param imagePtr - Pointer to float image data on the WASM heap.
   * @param w - Image width in pixels.
   * @param h - Image height in pixels.
   * @param channels - Number of color channels.
   * @param mask - Bitmask selecting which channels to consider (default: `LM_ALL_CHANNELS`).
   */
  lmImageMin(imagePtr: Pointer, w: number, h: number, channels: number, mask?: number): number;

  /**
   * Find the maximum value across the specified channels of a float lightmap image.
   * @param imagePtr - Pointer to float image data on the WASM heap.
   * @param w - Image width in pixels.
   * @param h - Image height in pixels.
   * @param channels - Number of color channels.
   * @param mask - Bitmask selecting which channels to consider (default: `LM_ALL_CHANNELS`).
   */
  lmImageMax(imagePtr: Pointer, w: number, h: number, channels: number, mask?: number): number;

  /**
   * In-place add a scalar value to the specified channels of a float lightmap image.
   * @param imagePtr - Pointer to float image data on the WASM heap.
   * @param w - Image width in pixels.
   * @param h - Image height in pixels.
   * @param channels - Number of color channels.
   * @param value - Value to add.
   * @param mask - Bitmask selecting which channels to modify (default: `LM_ALL_CHANNELS`).
   */
  lmImageAdd(imagePtr: Pointer, w: number, h: number, channels: number, value: number, mask?: number): void;

  /**
   * In-place multiply the specified channels of a float lightmap image by a factor.
   * @param imagePtr - Pointer to float image data on the WASM heap.
   * @param w - Image width in pixels.
   * @param h - Image height in pixels.
   * @param channels - Number of color channels.
   * @param factor - Scale factor.
   * @param mask - Bitmask selecting which channels to modify (default: `LM_ALL_CHANNELS`).
   */
  lmImageScale(imagePtr: Pointer, w: number, h: number, channels: number, factor: number, mask?: number): void;

  /**
   * In-place `pow(value, exponent)` on the specified channels (useful for gamma correction).
   * @param imagePtr - Pointer to float image data on the WASM heap.
   * @param w - Image width in pixels.
   * @param h - Image height in pixels.
   * @param channels - Number of color channels.
   * @param exponent - Power exponent.
   * @param mask - Bitmask selecting which channels to modify (default: `LM_ALL_CHANNELS`).
   */
  lmImagePower(imagePtr: Pointer, w: number, h: number, channels: number, exponent: number, mask?: number): void;

  /**
   * Dilate (widen) populated non-zero areas of a float lightmap image by 1 pixel.
   * @param imagePtr - Pointer to the source float image.
   * @param outImagePtr - Pointer to the destination float image (same dimensions).
   * @param w - Image width in pixels.
   * @param h - Image height in pixels.
   * @param channels - Number of color channels.
   */
  lmImageDilate(imagePtr: Pointer, outImagePtr: Pointer, w: number, h: number, channels: number): void;

  /**
   * Apply a simple box-filter smooth on only the non-zero values of a float lightmap image.
   * @param imagePtr - Pointer to the source float image.
   * @param outImagePtr - Pointer to the destination float image (same dimensions).
   * @param w - Image width in pixels.
   * @param h - Image height in pixels.
   * @param channels - Number of color channels.
   */
  lmImageSmooth(imagePtr: Pointer, outImagePtr: Pointer, w: number, h: number, channels: number): void;

  /**
   * Downsample a float lightmap image from `[w × h]` to `[w/2 × h/2]` by averaging non-zero values.
   * @param imagePtr - Pointer to the source float image (`w × h × channels` floats).
   * @param outImagePtr - Pointer to the destination float image (`w/2 × h/2 × channels` floats).
   * @param w - Source image width in pixels.
   * @param h - Source image height in pixels.
   * @param channels - Number of color channels.
   */
  lmImageDownsample(imagePtr: Pointer, outImagePtr: Pointer, w: number, h: number, channels: number): void;

  /**
   * Convert a floating-point lightmap image to an 8-bit-per-channel unsigned byte image.
   * @param imagePtr - Pointer to the source float image.
   * @param outImagePtr - Pointer to the destination `uint8` image (same pixel count).
   * @param w - Image width in pixels.
   * @param h - Image height in pixels.
   * @param channels - Number of color channels.
   * @param maxValue - Maximum float value mapped to 255. Pass 0 to auto-detect from the image.
   */
  lmImageFtoUB(imagePtr: Pointer, outImagePtr: Pointer, w: number, h: number, channels: number, maxValue?: number): void;
}

/**
 * Options for {@link createLightmapperModule}.
 */
export interface CreateLightmapperModuleOptions {
  /**
   * Custom Emscripten module factory. If omitted the default WASM module
   * is dynamically imported from the build output path.
   */
  moduleFactory?: (options?: Record<string, unknown>) => Promise<any>;

  /** Options forwarded to the Emscripten module factory (e.g. `locateFile`). */
  wasmModuleOptions?: Record<string, unknown>;

  /**
   * Pre-fetched wasm bytes. When supplied the loader skips asset fetching and
   * hands these bytes to the factory as the `wasmBinary` module option.
   *
   * Precedence: `wasmModuleOptions.wasmBinary` (forwarded untouched) →
   * this option → `locateWasm` → the default `lightmapper.wasm` URL resolved
   * beside the loaded module. Supplying bytes skips the asset fetch entirely.
   */
  wasmBinary?: ArrayBuffer | Uint8Array;

  /**
   * Override the wasm asset location. Called with the default asset filename
   * (`"lightmapper.wasm"` for the published entry). Return a URL or a
   * path/URL string; it is resolved against the loaded module when relative.
   * Ignored when explicit wasm bytes are supplied.
   */
  locateWasm?: (filename: string) => string | URL;

  /**
   * An existing `WebGL2RenderingContext` to use. Takes priority over `canvas`.
   * If neither `webglContext` nor `canvas` is provided, a hidden canvas is created automatically.
   */
  webglContext?: WebGL2RenderingContext;

  /**
   * Canvas element from which a WebGL2 context will be obtained.
   * Ignored if `webglContext` is already provided.
   */
  canvas?: HTMLCanvasElement | OffscreenCanvas;

  /**
   * An already-registered Emscripten WebGL context handle to use.
   * If provided, skips automatic context discovery and registration.
   */
  emscriptenContextHandle?: number;

  /**
   * Whether to automatically register the WebGL2 context with Emscripten
   * if no existing handle is found. Defaults to `true`.
   */
  autoRegisterEmscriptenContext?: boolean;

  /** Override attributes passed to `GL.registerContext`. */
  emscriptenWebGLContextAttributes?: Record<string, unknown>;

  /**
   * When `true` (the default), GL-dependent API calls assert that the bound
   * Emscripten context is current before proceeding.
   */
  strictContextBinding?: boolean;

  /**
   * Skip the WebGL2 RGBA32F capability probe performed during initialization.
   * Useful in environments where the probe is known to succeed or is not applicable.
   */
  skipCapabilityCheck?: boolean;
}

/**
 * Initialize the lightmapper WASM module, resolve a WebGL2 context,
 * and return a {@link LightmapperModule} with memory helpers and
 * all public `lm*` API functions.
 *
 * @param options - Configuration for module loading, WebGL context, and capability checks.
 * @returns A promise that resolves to the fully initialized lightmapper API.
 *
 * @example
 * ```js
 * const lm = await createLightmapperModule({ canvas: myCanvas });
 * const ctx = lm.lmCreate(64, 0.01, 100, 0, 0, 0, 2, 0.01);
 * ```
 */
export function createLightmapperModule(options?: CreateLightmapperModuleOptions): Promise<LightmapperModule>;
