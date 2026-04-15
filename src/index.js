const DEFAULT_WASM_MODULE_RELATIVE_PATH = "../build/wasm/wasm/lightmapper_wasm.mjs";

function resolveWebGL2Context(options) {
  if (options.webglContext) {
    return options.webglContext;
  }

  if (options.canvas && typeof options.canvas.getContext === "function") {
    return options.canvas.getContext("webgl2", { antialias: false });
  }

  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    const canvas = document.createElement("canvas");
    return canvas.getContext("webgl2", { antialias: false });
  }

  return null;
}

function clearAllGlErrors(gl) {
  while (gl.getError() !== gl.NO_ERROR) {
    // Drain existing errors so our probe sees only its own failures.
  }
}

function validateWebGL2FloatReadbackSupport(options) {
  const gl = resolveWebGL2Context(options);
  if (!gl) {
    throw new Error(
      "WebGL2 context unavailable. Provide options.webglContext or options.canvas, and ensure the browser supports WebGL2."
    );
  }

  const extColorBufferFloat = gl.getExtension("EXT_color_buffer_float");
  if (!extColorBufferFloat) {
    throw new Error(
      "Missing WebGL2 extension EXT_color_buffer_float. Float render targets required by lightmapper are not supported on this device/browser."
    );
  }

  const prevFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
  const prevTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);

  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();

  if (!texture || !framebuffer) {
    throw new Error("Failed to create WebGL resources while probing float readback support.");
  }

  let capabilityError = null;
  try {
    clearAllGlErrors(gl);

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    const framebufferStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (framebufferStatus !== gl.FRAMEBUFFER_COMPLETE) {
      capabilityError = new Error(
        `Float render target is incomplete (status 0x${framebufferStatus.toString(16)}). RGBA32F rendering is required by lightmapper.`
      );
      return;
    }

    const out = new Float32Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, out);
    const err = gl.getError();
    if (err !== gl.NO_ERROR) {
      capabilityError = new Error(
        `Float readback failed with WebGL error 0x${err.toString(16)}. Browser/driver does not support required RGBA32F readPixels path.`
      );
    }
  } finally {
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFramebuffer);
    gl.bindTexture(gl.TEXTURE_2D, prevTexture);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
  }

  if (capabilityError) {
    throw capabilityError;
  }
}

function assertPositiveInteger(name, value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
}

function assertPointer(name, value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer pointer.`);
  }
}

function createTypedView(mod, ptr, count, ctor, heapName, bytesPerElement) {
  assertPointer("ptr", ptr);
  assertPositiveInteger("count", count);
  const offset = ptr / bytesPerElement;
  return mod[heapName].subarray(offset, offset + count);
}

function tryGetEmscriptenGL(mod) {
  try {
    return mod?.GL || null;
  } catch {
    return null;
  }
}

function getDefaultEmscriptenWebGLContextAttributes(gl) {
  return {
    alpha: true,
    depth: true,
    stencil: false,
    antialias: gl.getContextAttributes()?.antialias ?? false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: "default",
    failIfMajorPerformanceCaveat: false,
    majorVersion: 2,
    minorVersion: 0,
    enableExtensionsByDefault: true,
    explicitSwapControl: false,
    proxyContextToMainThread: false,
    renderViaOffscreenBackBuffer: false
  };
}

function tryRegisterEmscriptenContext(mod, gl, options) {
  const emscriptenGL = tryGetEmscriptenGL(mod);
  if (!gl || !emscriptenGL || typeof emscriptenGL.registerContext !== "function") {
    return 0;
  }

  const attrs = {
    ...getDefaultEmscriptenWebGLContextAttributes(gl),
    ...(options.emscriptenWebGLContextAttributes || {})
  };

  try {
    return emscriptenGL.registerContext(gl, attrs) || 0;
  } catch {
    return 0;
  }
}

function resolveEmscriptenContextHandle(mod, options, gl) {
  const emscriptenGL = tryGetEmscriptenGL(mod);

  if (Number.isInteger(options.emscriptenContextHandle) && options.emscriptenContextHandle > 0) {
    return options.emscriptenContextHandle;
  }

  if (!gl || !emscriptenGL || !Array.isArray(emscriptenGL.contexts)) {
    return 0;
  }

  for (let i = 1; i < emscriptenGL.contexts.length; i++) {
    const ctxEntry = emscriptenGL.contexts[i];
    if (ctxEntry && ctxEntry.GLctx === gl) {
      return i;
    }
  }

  return 0;
}

export async function createLightmapperModule(options = {}) {
  const strictContextBinding = options.strictContextBinding !== false;
  const selectedWebGL2Context = resolveWebGL2Context(options);

  if (!options.skipCapabilityCheck) {
    validateWebGL2FloatReadbackSupport({ ...options, webglContext: selectedWebGL2Context });
  }

  const moduleFactory = options.moduleFactory
    || (await import(DEFAULT_WASM_MODULE_RELATIVE_PATH)).default;

  const mod = await moduleFactory(options.wasmModuleOptions || {});
  const emscriptenGL = tryGetEmscriptenGL(mod);

  const constants = {
    LM_NONE: mod._lmwLM_NONE(),
    LM_UNSIGNED_BYTE: mod._lmwLM_UNSIGNED_BYTE(),
    LM_UNSIGNED_SHORT: mod._lmwLM_UNSIGNED_SHORT(),
    LM_UNSIGNED_INT: mod._lmwLM_UNSIGNED_INT(),
    LM_FLOAT: mod._lmwLM_FLOAT(),
    LM_FALSE: mod._lmwLM_FALSE(),
    LM_TRUE: mod._lmwLM_TRUE(),
    LM_ALL_CHANNELS: mod._lmwLM_ALL_CHANNELS()
  };

  let boundContextHandle = resolveEmscriptenContextHandle(mod, options, selectedWebGL2Context);
  if (!boundContextHandle && options.autoRegisterEmscriptenContext !== false) {
    boundContextHandle = tryRegisterEmscriptenContext(mod, selectedWebGL2Context, options);
  }

  if (boundContextHandle && emscriptenGL && typeof emscriptenGL.makeContextCurrent === "function") {
    emscriptenGL.makeContextCurrent(boundContextHandle);
  }

  function getCurrentContextHandle() {
    return mod._lmwGetCurrentContext();
  }

  function assertBoundContextCurrent() {
    if (!strictContextBinding) {
      return;
    }

    if (!boundContextHandle) {
      throw new Error(
        "Strict context binding is enabled but no Emscripten WebGL context handle is bound. Pass options.emscriptenContextHandle or provide a WebGL2 context created through the Emscripten module."
      );
    }

    const current = getCurrentContextHandle();
    if (current !== boundContextHandle) {
      throw new Error(
        `Bound WebGL context is not current. Expected handle ${boundContextHandle}, but current is ${current}. Call makeBoundContextCurrent() before invoking GL-dependent lightmapper APIs.`
      );
    }
  }

  function makeBoundContextCurrent() {
    if (!boundContextHandle) {
      throw new Error(
        "No bound context handle available. Pass options.emscriptenContextHandle to enable makeBoundContextCurrent()."
      );
    }

    if (emscriptenGL && typeof emscriptenGL.makeContextCurrent === "function") {
      emscriptenGL.makeContextCurrent(boundContextHandle);
    }

    const result = mod._lmwMakeContextCurrent(boundContextHandle);
    if (result !== 0) {
      throw new Error(
        `Failed to make bound context current. emscripten_webgl_make_context_current returned ${result}.`
      );
    }
  }

  function allocF32(count) {
    assertPositiveInteger("count", count);
    return mod._malloc(count * 4);
  }

  function allocU8(count) {
    assertPositiveInteger("count", count);
    return mod._malloc(count);
  }

  function allocU16(count) {
    assertPositiveInteger("count", count);
    return mod._malloc(count * 2);
  }

  function allocU32(count) {
    assertPositiveInteger("count", count);
    return mod._malloc(count * 4);
  }

  function free(ptr) {
    assertPointer("ptr", ptr);
    mod._free(ptr);
  }

  function viewF32(ptr, count) {
    return createTypedView(mod, ptr, count, Float32Array, "HEAPF32", 4);
  }

  function viewU8(ptr, count) {
    return createTypedView(mod, ptr, count, Uint8Array, "HEAPU8", 1);
  }

  function viewU16(ptr, count) {
    return createTypedView(mod, ptr, count, Uint16Array, "HEAPU16", 2);
  }

  function viewU32(ptr, count) {
    return createTypedView(mod, ptr, count, Uint32Array, "HEAPU32", 4);
  }

  function copyToHeap(data) {
    if (!(data instanceof Float32Array || data instanceof Uint8Array || data instanceof Uint16Array || data instanceof Uint32Array)) {
      throw new Error("copyToHeap supports Float32Array, Uint8Array, Uint16Array, and Uint32Array only.");
    }

    const ptr = mod._malloc(data.byteLength);
    const byteView = mod.HEAPU8.subarray(ptr, ptr + data.byteLength);
    byteView.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    return ptr;
  }

  function copyFromHeap(ptr, out) {
    assertPointer("ptr", ptr);
    if (!(out instanceof Float32Array || out instanceof Uint8Array || out instanceof Uint16Array || out instanceof Uint32Array)) {
      throw new Error("copyFromHeap supports Float32Array, Uint8Array, Uint16Array, and Uint32Array only.");
    }

    const bytes = out.byteLength;
    const src = mod.HEAPU8.subarray(ptr, ptr + bytes);
    new Uint8Array(out.buffer, out.byteOffset, out.byteLength).set(src);
    return out;
  }

  function validateLightmapShape(w, h, channels, floatCount) {
    assertPositiveInteger("w", w);
    assertPositiveInteger("h", h);
    assertPositiveInteger("channels", channels);
    if (channels < 1 || channels > 4) {
      throw new Error("channels must be between 1 and 4.");
    }
    assertPositiveInteger("floatCount", floatCount);

    const expected = w * h * channels;
    if (floatCount !== expected) {
      throw new Error(`lightmap floatCount mismatch: got ${floatCount}, expected ${expected}.`);
    }
  }

  function validateStrideBytes(stride, elementSize) {
    if (!Number.isInteger(stride) || stride < 0) {
      throw new Error("stride must be 0 or a positive integer.");
    }
    assertPositiveInteger("elementSize", elementSize);
    if (stride !== 0 && stride < elementSize) {
      throw new Error("stride must be zero or at least elementSize.");
    }
  }

  function makeBeginFrameBuffers() {
    const viewportPtr = allocU32(4);
    const viewPtr = allocF32(16);
    const projectionPtr = allocF32(16);

    return {
      viewportPtr,
      viewPtr,
      projectionPtr,
      readViewport() {
        return new Int32Array(viewU32(viewportPtr, 4));
      },
      readViewMatrix() {
        return new Float32Array(viewF32(viewPtr, 16));
      },
      readProjectionMatrix() {
        return new Float32Array(viewF32(projectionPtr, 16));
      },
      dispose() {
        free(viewportPtr);
        free(viewPtr);
        free(projectionPtr);
      }
    };
  }

  function lmCreate(
    hemisphereSize,
    zNear,
    zFar,
    clearR,
    clearG,
    clearB,
    interpolationPasses,
    interpolationThreshold,
    cameraToSurfaceDistanceModifier = 0.0
  ) {
    assertBoundContextCurrent();

    const ctx = mod._lmwCreate(
      hemisphereSize,
      zNear,
      zFar,
      clearR,
      clearG,
      clearB,
      interpolationPasses,
      interpolationThreshold,
      cameraToSurfaceDistanceModifier
    );

    if (!ctx) {
      throw new Error("lmCreate returned a null context. Check your GL/WebGL state and initialization parameters.");
    }

    return ctx;
  }

  function lmDestroy(ctx) {
    assertPointer("ctx", ctx);
    assertBoundContextCurrent();
    mod._lmwDestroy(ctx);
  }

  function lmSetTargetLightmap(ctx, outLightmapPtr, w, h, channels) {
    assertPointer("ctx", ctx);
    assertPointer("outLightmapPtr", outLightmapPtr);
    assertPositiveInteger("w", w);
    assertPositiveInteger("h", h);
    assertPositiveInteger("channels", channels);
    assertBoundContextCurrent();
    mod._lmwSetTargetLightmap(ctx, outLightmapPtr, w, h, channels);
  }

  function lmSetGeometry(
    ctx,
    transformationMatrixPtr,
    positionsType,
    positionsXYZPtr,
    positionsStride,
    normalsType,
    normalsXYZPtr,
    normalsStride,
    lightmapCoordsType,
    lightmapCoordsUVPtr,
    lightmapCoordsStride,
    count,
    indicesType = constants.LM_NONE,
    indicesPtr = 0
  ) {
    assertPointer("ctx", ctx);
    assertPointer("transformationMatrixPtr", transformationMatrixPtr);
    assertPointer("positionsXYZPtr", positionsXYZPtr);
    assertPointer("normalsXYZPtr", normalsXYZPtr);
    assertPointer("lightmapCoordsUVPtr", lightmapCoordsUVPtr);
    assertPointer("indicesPtr", indicesPtr);

    validateStrideBytes(positionsStride, 1);
    validateStrideBytes(normalsStride, 1);
    validateStrideBytes(lightmapCoordsStride, 1);
    assertPositiveInteger("count", count);

    mod._lmwSetGeometry(
      ctx,
      transformationMatrixPtr,
      positionsType,
      positionsXYZPtr,
      positionsStride,
      normalsType,
      normalsXYZPtr,
      normalsStride,
      lightmapCoordsType,
      lightmapCoordsUVPtr,
      lightmapCoordsStride,
      count,
      indicesType,
      indicesPtr
    );
  }

  function lmBegin(ctx, outViewport4Ptr, outView4x4Ptr, outProjection4x4Ptr) {
    assertPointer("ctx", ctx);
    assertPointer("outViewport4Ptr", outViewport4Ptr);
    assertPointer("outView4x4Ptr", outView4x4Ptr);
    assertPointer("outProjection4x4Ptr", outProjection4x4Ptr);
    assertBoundContextCurrent();
    return !!mod._lmwBegin(ctx, outViewport4Ptr, outView4x4Ptr, outProjection4x4Ptr);
  }

  function lmEnd(ctx) {
    assertPointer("ctx", ctx);
    assertBoundContextCurrent();
    mod._lmwEnd(ctx);
  }

  function lmProgress(ctx) {
    assertPointer("ctx", ctx);
    assertBoundContextCurrent();
    return mod._lmwProgress(ctx);
  }

  function lmImageMin(imagePtr, w, h, channels, mask = constants.LM_ALL_CHANNELS) {
    return mod._lmwImageMin(imagePtr, w, h, channels, mask);
  }

  function lmImageMax(imagePtr, w, h, channels, mask = constants.LM_ALL_CHANNELS) {
    return mod._lmwImageMax(imagePtr, w, h, channels, mask);
  }

  function lmImageAdd(imagePtr, w, h, channels, value, mask = constants.LM_ALL_CHANNELS) {
    mod._lmwImageAdd(imagePtr, w, h, channels, value, mask);
  }

  function lmImageScale(imagePtr, w, h, channels, factor, mask = constants.LM_ALL_CHANNELS) {
    mod._lmwImageScale(imagePtr, w, h, channels, factor, mask);
  }

  function lmImagePower(imagePtr, w, h, channels, exponent, mask = constants.LM_ALL_CHANNELS) {
    mod._lmwImagePower(imagePtr, w, h, channels, exponent, mask);
  }

  function lmImageDilate(imagePtr, outImagePtr, w, h, channels) {
    mod._lmwImageDilate(imagePtr, outImagePtr, w, h, channels);
  }

  function lmImageSmooth(imagePtr, outImagePtr, w, h, channels) {
    mod._lmwImageSmooth(imagePtr, outImagePtr, w, h, channels);
  }

  function lmImageDownsample(imagePtr, outImagePtr, w, h, channels) {
    mod._lmwImageDownsample(imagePtr, outImagePtr, w, h, channels);
  }

  function lmImageFtoUB(imagePtr, outImagePtr, w, h, channels, maxValue = 0.0) {
    mod._lmwImageFtoUB(imagePtr, outImagePtr, w, h, channels, maxValue);
  }

  return {
    ...constants,
    allocF32,
    allocU8,
    allocU16,
    allocU32,
    free,
    viewF32,
    viewU8,
    viewU16,
    viewU32,
    copyToHeap,
    copyFromHeap,
    validateLightmapShape,
    validateStrideBytes,
    boundContextHandle,
    getCurrentContextHandle,
    assertBoundContextCurrent,
    makeBoundContextCurrent,
    makeBeginFrameBuffers,
    lmCreate,
    lmDestroy,
    lmSetTargetLightmap,
    lmSetGeometry,
    lmBegin,
    lmEnd,
    lmProgress,
    lmImageMin,
    lmImageMax,
    lmImageAdd,
    lmImageScale,
    lmImagePower,
    lmImageDilate,
    lmImageSmooth,
    lmImageDownsample,
    lmImageFtoUB
  };
}
