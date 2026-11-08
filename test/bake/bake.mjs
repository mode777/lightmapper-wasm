// Headless-browser golden bake test.
//
// Exercises the *shipped* single-file artifact (dist/index.js): capability
// probe, Emscripten context registration, framebuffer/hemisphere rendering,
// float readback, and CPU post-processing. The result is exposed on
// window.__bakeTestResult for scripts/run-headless-test.mjs.

import { createLightmapperModule } from "../../dist/index.js";

const WIDTH = 64;
const HEIGHT = 64;
const CHANNELS = 4;
const HEMISPHERE_SIZE = 64;
const FLOAT_COUNT = WIDTH * HEIGHT * CHANNELS;
const YIELD_EVERY = 32;
const MAX_ITERATIONS = 5_000_000;

const statusEl = document.getElementById("status");

function log(message) {
  console.log(`[bake] ${message}`);
  if (statusEl) statusEl.textContent = message;
}

function toBase64(float32) {
  const bytes = new Uint8Array(float32.buffer, float32.byteOffset, float32.byteLength);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function computeStats(data) {
  const min = new Array(CHANNELS).fill(Infinity);
  const max = new Array(CHANNELS).fill(-Infinity);
  const mean = new Array(CHANNELS).fill(0);
  let nonBlackPixels = 0;
  const pixelCount = data.length / CHANNELS;

  for (let i = 0; i < data.length; i += CHANNELS) {
    let pixelMax = -Infinity;
    for (let c = 0; c < CHANNELS; c += 1) {
      const value = data[i + c];
      if (value < min[c]) min[c] = value;
      if (value > max[c]) max[c] = value;
      mean[c] += value;
      if (c < 3 && value > pixelMax) pixelMax = value;
    }
    if (pixelMax > 0.001) nonBlackPixels += 1;
  }

  for (let c = 0; c < CHANNELS; c += 1) mean[c] /= pixelCount;
  return { min, max, mean, nonBlackRatio: nonBlackPixels / pixelCount };
}

function drainGlErrors(gl) {
  const errors = [];
  for (let i = 0; i < 16; i += 1) {
    const error = gl.getError();
    if (error === gl.NO_ERROR) break;
    errors.push(error);
  }
  return errors;
}

const VERTEX_SOURCE = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_position;
layout(location=1) in vec2 a_uv;
uniform mat4 u_view;
uniform mat4 u_projection;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = u_projection * (u_view * vec4(a_position, 1.0));
}`;

const FRAGMENT_SOURCE = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o_color;
void main() {
  // Known, smoothly varying albedo: never black, easy to fingerprint.
  o_color = vec4(0.8 + 0.2 * v_uv.x, 0.7 + 0.2 * v_uv.y, 0.9, 1.0);
}`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("gl.createShader returned null");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${info}`);
  }
  return shader;
}

function createProgram(gl) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
  const program = gl.createProgram();
  if (!program) throw new Error("gl.createProgram returned null");
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${info}`);
  }
  return program;
}

async function main() {
  let data = null;
  let stats = null;
  let dataB64 = null;
  let ok = true;
  let error = null;

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;

  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    depth: true,
    stencil: false,
    preserveDrawingBuffer: false
  });
  if (!gl) throw new Error("WebGL2 unavailable in this browser");

  log("WebGL2 context created, loading lightmapper dist bundle…");

  const lm = await createLightmapperModule({
    canvas,
    webglContext: gl,
    autoRegisterEmscriptenContext: true
  });
  lm.makeBoundContextCurrent();
  log("lightmapper module initialized and context bound");

  // --- geometry: axis-aligned floor quad at z=0 (the baked mesh), normal +Z --
  const positions = new Float32Array([
    -1, -1, 0,
     1, -1, 0,
     1,  1, 0,
    -1,  1, 0
  ]);
  const normals = new Float32Array([
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
    0, 0, 1
  ]);
  // Keep UVs inside [0,1): lightmapper's positive-mod maps exactly 1.0 to 0.0,
  // which would collapse the quad's UVs to a degenerate triangle.
  const uvs = new Float32Array([
    0, 0,
    0.999, 0,
    0.999, 0.999,
    0, 0.999
  ]);
  const STRIDE_FLOATS = 8;
  const STRIDE_BYTES = STRIDE_FLOATS * 4;
  const interleaved = new Float32Array(4 * STRIDE_FLOATS);
  for (let i = 0; i < 4; i += 1) {
    interleaved.set(positions.subarray(i * 3, i * 3 + 3), i * STRIDE_FLOATS);
    interleaved.set(normals.subarray(i * 3, i * 3 + 3), i * STRIDE_FLOATS + 3);
    interleaved.set(uvs.subarray(i * 2, i * 2 + 2), i * STRIDE_FLOATS + 6);
  }
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

  // --- scene-only geometry: emissive ceiling quad at z=2 --------------------
  // The lightmapper renders a hemisphere *above* each floor texel, so the
  // coplanar floor quad can never see itself. This ceiling is what the
  // hemisphere cameras actually capture; it is drawn but not baked.
  const ceilingPositions = new Float32Array([
    -1, -1, 2,
     1, -1, 2,
     1,  1, 2,
    -1,  1, 2
  ]);
  const ceilingUvs = new Float32Array([
    0, 0,
    0.999, 0,
    0.999, 0.999,
    0, 0.999
  ]);
  const CEILING_STRIDE_FLOATS = 5;
  const CEILING_STRIDE_BYTES = CEILING_STRIDE_FLOATS * 4;
  const CEILING_INDICES = [0, 1, 2, 0, 2, 3];
  const ceilingInterleaved = new Float32Array(CEILING_INDICES.length * CEILING_STRIDE_FLOATS);
  for (let i = 0; i < CEILING_INDICES.length; i += 1) {
    const vertex = CEILING_INDICES[i];
    ceilingInterleaved.set(ceilingPositions.subarray(vertex * 3, vertex * 3 + 3), i * CEILING_STRIDE_FLOATS);
    ceilingInterleaved.set(ceilingUvs.subarray(vertex * 2, vertex * 2 + 2), i * CEILING_STRIDE_FLOATS + 3);
  }

  const verticesPtr = lm.copyToHeap(interleaved);
  const indicesPtr = lm.copyToHeap(indices);

  const program = createProgram(gl);
  const uView = gl.getUniformLocation(program, "u_view");
  const uProjection = gl.getUniformLocation(program, "u_projection");
  if (!uView || !uProjection) throw new Error("Missing u_view/u_projection uniforms");

  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  const ibo = gl.createBuffer();
  if (!vao || !vbo || !ibo) throw new Error("Failed to create quad GL buffers");

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE_BYTES, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE_BYTES, 6 * 4);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  const ceilingVao = gl.createVertexArray();
  const ceilingVbo = gl.createBuffer();
  if (!ceilingVao || !ceilingVbo) throw new Error("Failed to create ceiling GL buffers");
  gl.bindVertexArray(ceilingVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, ceilingVbo);
  gl.bufferData(gl.ARRAY_BUFFER, ceilingInterleaved, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, CEILING_STRIDE_BYTES, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, CEILING_STRIDE_BYTES, 3 * 4);

  let lightmapPtr = 0;
  let tempPtr = 0;
  let lmCtx = 0;
  let buffers = null;

  try {
    drainGlErrors(gl);

    lightmapPtr = lm.allocF32(FLOAT_COUNT);
    tempPtr = lm.allocF32(FLOAT_COUNT);
    lm.viewF32(lightmapPtr, FLOAT_COUNT).fill(0);

    lmCtx = lm.lmCreate(HEMISPHERE_SIZE, 0.001, 100.0, 0, 0, 0, 2, 0.01, 0.0);
    lm.lmSetTargetLightmap(lmCtx, lightmapPtr, WIDTH, HEIGHT, CHANNELS);
    lm.lmSetGeometry(
      lmCtx,
      0,
      lm.LM_FLOAT,
      verticesPtr,
      STRIDE_BYTES,
      lm.LM_FLOAT,
      verticesPtr + 3 * 4,
      STRIDE_BYTES,
      lm.LM_FLOAT,
      verticesPtr + 6 * 4,
      STRIDE_BYTES,
      6, // index count (6 indices for 4 vertices)
      lm.LM_UNSIGNED_SHORT,
      indicesPtr
    );

    buffers = lm.makeBeginFrameBuffers();
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.colorMask(true, true, true, true);
    gl.useProgram(program);
    gl.bindVertexArray(vao);

    let iterations = 0;
    let baking = true;
    let completed = false;
    while (baking) {
      if (!lm.lmBegin(lmCtx, buffers.viewportPtr, buffers.viewPtr, buffers.projectionPtr)) {
        // lmBegin() returning false is lightmapper's completion signal: all
        // interpolation passes have been processed (see lightmapper.h lmBegin).
        baking = false;
        completed = true;
        break;
      }

      const vp = buffers.readViewport();
      gl.viewport(vp[0], vp[1], vp[2], vp[3]);
      gl.useProgram(program);
      gl.uniformMatrix4fv(uView, false, buffers.readViewMatrix());
      gl.uniformMatrix4fv(uProjection, false, buffers.readProjectionMatrix());
      gl.bindVertexArray(vao);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
      gl.bindVertexArray(ceilingVao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      lm.lmEnd(lmCtx);

      iterations += 1;
      if (iterations > MAX_ITERATIONS) {
        throw new Error(`Bake did not finish within ${MAX_ITERATIONS} iterations`);
      }
      if (iterations % YIELD_EVERY === 0) {
        if (statusEl) {
          statusEl.textContent = `baking… ${iterations} frames, ${(lm.lmProgress(lmCtx) * 100).toFixed(1)}%`;
        }
        // setTimeout is reliable in headless Chrome even when rAF is throttled.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    // Note: lightmapper resets pass/triangle state on completion
    // (lightmapper.h:1575-1577), so lmProgress() reports 1/passCount here
    // (14.29% for 2 interpolation passes) instead of 1.0.
    const progress = lm.lmProgress(lmCtx);
    log(`bake loop finished after ${iterations} frames (all passes complete), lmProgress ${(progress * 100).toFixed(2)}%`);
    lm.lmDestroy(lmCtx);
    lmCtx = 0;

    // --- post-process: dilate twice (as in the README quick start) ---------
    lm.lmImageDilate(lightmapPtr, tempPtr, WIDTH, HEIGHT, CHANNELS);
    lm.lmImageDilate(tempPtr, lightmapPtr, WIDTH, HEIGHT, CHANNELS);

    const out = new Float32Array(FLOAT_COUNT);
    lm.copyFromHeap(lightmapPtr, out);
    data = out;
    stats = computeStats(data);
    dataB64 = toBase64(data);

    log(
      `stats: min=[${stats.min.map((v) => v.toFixed(3)).join(", ")}] ` +
        `max=[${stats.max.map((v) => v.toFixed(3)).join(", ")}] ` +
        `mean=[${stats.mean.map((v) => v.toFixed(4)).join(", ")}] ` +
        `nonBlackRatio=${stats.nonBlackRatio.toFixed(4)}`
    );

    // --- internal assertions ----------------------------------------------
    const glErrors = drainGlErrors(gl);
    const problems = [];
    if (!completed || iterations === 0) {
      problems.push(`bake did not run to completion (completed=${completed}, iterations=${iterations})`);
    }
    if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
      problems.push(`lmProgress out of range (got ${progress})`);
    }
    if (stats.nonBlackRatio <= 0.05) {
      problems.push(`nonBlackRatio ${stats.nonBlackRatio.toFixed(4)} <= 0.05 (bake produced an empty/dark lightmap)`);
    }
    if (glErrors.length > 0) {
      problems.push(`pending WebGL errors after bake: ${glErrors.map((e) => `0x${e.toString(16)}`).join(", ")}`);
    }
    if (problems.length > 0) throw new Error(problems.join("; "));

    log("bake completed successfully");
  } finally {
    if (lmCtx) {
      try {
        lm.lmDestroy(lmCtx);
      } catch (destroyError) {
        console.error("[bake] lmDestroy cleanup failed:", destroyError);
      }
    }
    if (buffers) buffers.dispose();
    if (tempPtr) lm.free(tempPtr);
    if (lightmapPtr) lm.free(lightmapPtr);
    lm.free(verticesPtr);
    lm.free(indicesPtr);
    gl.deleteBuffer(vbo);
    gl.deleteBuffer(ibo);
    gl.deleteVertexArray(vao);
    gl.deleteBuffer(ceilingVbo);
    gl.deleteVertexArray(ceilingVao);
    gl.deleteProgram(program);
  }

  return { ok, error, stats, dataB64 };
}

try {
  const result = await main();
  window.__bakeTestResult = {
    ok: result.ok,
    error: result.error,
    stats: result.stats,
    width: WIDTH,
    height: HEIGHT,
    channels: CHANNELS,
    dataB64: result.dataB64
  };
  log(result.ok ? "BAKE OK" : `BAKE FAILED: ${result.error}`);
} catch (error) {
  console.error("[bake] fatal:", error);
  window.__bakeTestResult = {
    ok: false,
    error: String((error && error.stack) || error),
    stats: null,
    width: WIDTH,
    height: HEIGHT,
    channels: CHANNELS,
    dataB64: null
  };
  log(`BAKE FAILED: ${(error && error.message) || error}`);
}
