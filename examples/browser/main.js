import { createLightmapperModule } from "../../src/index.js";
import { perspectiveMatrix } from "./math.js";
import { resizeCanvasForDisplaySize } from "./gl-utils.js";
import { createCamera } from "./camera.js";
import { initScene, drawScene, destroyScene, addLight } from "./scene.js";

const canvas = document.getElementById("viewport");
const statusEl = document.getElementById("status");
const bakeButton = document.getElementById("bakeButton");
const bounceCountSelect = document.getElementById("bounceCount");
const addLightButton = document.getElementById("addLightButton");
const lightIntensityInput = document.getElementById("lightIntensity");
const lightColorInput = document.getElementById("lightColor");
const lightXInput = document.getElementById("lightX");
const lightYInput = document.getElementById("lightY");
const lightRadiusSlider = document.getElementById("lightRadius");
const lightRadiusValueEl = document.getElementById("lightRadiusValue");
const ambientSlider = document.getElementById("ambientSlider");
const ambientValueEl = document.getElementById("ambientValue");

ambientSlider.addEventListener("input", () => {
  ambientValueEl.textContent = ambientSlider.value;
});

lightRadiusSlider.addEventListener("input", () => {
  lightRadiusValueEl.textContent = lightRadiusSlider.value;
});

let gl;
let lm;
let scene;
let camera;
let rafHandle = 0;

// Diagnostics of the most recent bake (null before the first bake).
// Exposed for debugging and automated example checks.
window.__lightmapperBakeStats = null;

function setStatus(text, warning = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("warning", warning);
}

async function bake(meshScene) {
  if (meshScene.baking) {
    return;
  }

  meshScene.baking = true;
  bakeButton.disabled = true;
  bounceCountSelect.disabled = true;
  lm.makeBoundContextCurrent();

  const lightmapFloatCount = meshScene.lightmapWidth * meshScene.lightmapHeight * 4;
  const lightmapPtr = lm.allocF32(lightmapFloatCount);
  const tempPtr = lm.allocF32(lightmapFloatCount);
  const beginBuffers = lm.makeBeginFrameBuffers();

  const totalBounces = Number(bounceCountSelect.value) || 1;
  let lmCtx = 0;
  try {
    // Reset the GPU lightmap to black so a fresh bake starts from scratch
    gl.bindTexture(gl.TEXTURE_2D, meshScene.lightmapTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32F,
      meshScene.lightmapWidth,
      meshScene.lightmapHeight,
      0,
      gl.RGBA,
      gl.FLOAT,
      new Float32Array(lightmapFloatCount)
    );

    for (let bounce = 0; bounce < totalBounces; bounce++) {
      setStatus(`Bounce ${bounce + 1}/${totalBounces} — starting...`);

      const ambientValue = Number(ambientSlider.value);
      const ambient = Number.isFinite(ambientValue) ? ambientValue : 0.1;
      lmCtx = lm.lmCreate(
        64,
        0.001,
        100.0,
        ambient,
        ambient,
        ambient,
        2,
        0.01,
        0.0
      );

      // Clear lightmap to black before each bounce
      lm.viewF32(lightmapPtr, lightmapFloatCount).fill(0);

      lm.lmSetTargetLightmap(lmCtx, lightmapPtr, meshScene.lightmapWidth, meshScene.lightmapHeight, 4);
      lm.lmSetGeometry(
        lmCtx,
        0,
        lm.LM_FLOAT,
        meshScene.verticesPtr,
        meshScene.vertexStrideBytes,
        lm.LM_NONE,
        0,
        0,
        lm.LM_FLOAT,
        meshScene.verticesPtr + 3 * 4,
        meshScene.vertexStrideBytes,
        meshScene.indexCount,
        lm.LM_UNSIGNED_SHORT,
        meshScene.indicesPtr
      );

      const BATCH_BUDGET_MS = 30;
      let baking = true;
      while (baking) {
        const batchStart = performance.now();
        while (performance.now() - batchStart < BATCH_BUDGET_MS) {
          if (!lm.lmBegin(lmCtx, beginBuffers.viewportPtr, beginBuffers.viewPtr, beginBuffers.projectionPtr)) {
            baking = false;
            break;
          }
          const viewport = beginBuffers.readViewport();
          const bakeView = beginBuffers.readViewMatrix();
          const bakeProjection = beginBuffers.readProjectionMatrix();

          gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
          drawScene(gl, meshScene, bakeView, bakeProjection, true);
          lm.lmEnd(lmCtx);
        }
        if (baking) {
          setStatus(`Bounce ${bounce + 1}/${totalBounces} — ${(lm.lmProgress(lmCtx) * 100).toFixed(2)}%`);
          await new Promise(resolve => requestAnimationFrame(resolve));
        }
      }

      lm.lmDestroy(lmCtx);
      lmCtx = 0;

      // Postprocess this bounce's lightmap
      setStatus(`Bounce ${bounce + 1}/${totalBounces} — postprocessing...`);
      for (let i = 0; i < 16; i++) {
        lm.lmImageDilate(lightmapPtr, tempPtr, meshScene.lightmapWidth, meshScene.lightmapHeight, 4);
        lm.lmImageDilate(tempPtr, lightmapPtr, meshScene.lightmapWidth, meshScene.lightmapHeight, 4);
      }
      lm.lmImageSmooth(lightmapPtr, tempPtr, meshScene.lightmapWidth, meshScene.lightmapHeight, 4);
      lm.lmImageDilate(tempPtr, lightmapPtr, meshScene.lightmapWidth, meshScene.lightmapHeight, 4);

      // Upload this bounce's result to GPU so the next bounce sees its light.
      // Emissive cubes and the ambient sky are re-rendered/re-applied on every
      // bounce, so each bounce's result already contains the direct light plus
      // all indirect generations so far — the LAST bounce is the final lightmap.
      // (Summing bounces would double-count the direct light.)
      const bounceLightmap = lm.copyFromHeap(lightmapPtr, new Float32Array(lightmapFloatCount));
      gl.bindTexture(gl.TEXTURE_2D, meshScene.lightmapTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA32F,
        meshScene.lightmapWidth,
        meshScene.lightmapHeight,
        0,
        gl.RGBA,
        gl.FLOAT,
        bounceLightmap
      );
    }

    // Final gamma correction (applied once after all bounces)
    lm.lmImagePower(lightmapPtr, meshScene.lightmapWidth, meshScene.lightmapHeight, 4, 1.0 / 2.2, 0x7);
    const finalLightmap = lm.copyFromHeap(lightmapPtr, new Float32Array(lightmapFloatCount));
    gl.bindTexture(gl.TEXTURE_2D, meshScene.lightmapTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32F,
      meshScene.lightmapWidth,
      meshScene.lightmapHeight,
      0,
      gl.RGBA,
      gl.FLOAT,
      finalLightmap
    );

    let rgbSum = 0;
    let maxRgb = 0;
    for (let i = 0; i < finalLightmap.length; i += 4) {
      rgbSum += finalLightmap[i] + finalLightmap[i + 1] + finalLightmap[i + 2];
      maxRgb = Math.max(maxRgb, finalLightmap[i], finalLightmap[i + 1], finalLightmap[i + 2]);
    }
    window.__lightmapperBakeStats = {
      bounces: totalBounces,
      triangles: meshScene.indexCount / 3,
      meanRgb: rgbSum / (finalLightmap.length / 4) / 3,
      maxRgb
    };

    setStatus(`Finished baking ${meshScene.indexCount / 3} triangles (${totalBounces} bounce${totalBounces > 1 ? "s" : ""}).`);
  } finally {
    if (lmCtx) {
      lm.lmDestroy(lmCtx);
    }
    beginBuffers.dispose();
    lm.free(tempPtr);
    lm.free(lightmapPtr);

    meshScene.baking = false;
    bakeButton.disabled = false;
    bounceCountSelect.disabled = false;
  }
}

async function start() {
  gl = canvas.getContext("webgl2", { antialias: true, alpha: true, depth: true, stencil: false });
  if (!gl) {
    setStatus("WebGL2 is not available in this browser.", true);
    bakeButton.disabled = true;
    return;
  }

  lm = await createLightmapperModule({
    canvas,
    webglContext: gl,
    autoRegisterEmscriptenContext: true
  });

  lm.makeBoundContextCurrent();
  scene = await initScene(gl, lm);
  camera = createCamera(canvas);

  bakeButton.addEventListener("click", () => {
    void bake(scene).catch((error) => {
      console.error(error);
      setStatus(`Bake failed: ${error.message}`, true);
      scene.baking = false;
      bakeButton.disabled = false;
    });
  });

  addLightButton.addEventListener("click", () => {
    const intensity = Math.max(0.1, Number(lightIntensityInput.value) || 8);
    const hex = lightColorInput.value;
    const color = [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255
    ];
    const x = Number(lightXInput.value) || 0;
    const y = Number(lightYInput.value) || 1.5;
    const radius = Number(lightRadiusSlider.value) || 0.12;
    addLight(scene, [x, y, 0], color, intensity, radius);
    setStatus(`Added light #${scene.lights.length} at (${x}, ${y}) r=${radius} intensity=${intensity.toFixed(1)}`);
  });

  window.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      event.preventDefault();
      if (!scene.baking) {
        void bake(scene).catch((error) => {
          console.error(error);
          setStatus(`Bake failed: ${error.message}`, true);
          scene.baking = false;
          bakeButton.disabled = false;
        });
      }
    }
  });

  const view = new Float32Array(16);
  const projection = new Float32Array(16);
  let prevTime = performance.now();

  const frame = (time) => {
    const dt = Math.min(0.05, (time - prevTime) / 1000);
    prevTime = time;

    if (!scene.baking) {
      resizeCanvasForDisplaySize(canvas, gl);
      lm.makeBoundContextCurrent();

      camera.updateView(view, dt);
      perspectiveMatrix(projection, 45.0, canvas.width / canvas.height, 0.01, 100.0);

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0.6, 0.8, 1.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      drawScene(gl, scene, view, projection);
    }
    rafHandle = requestAnimationFrame(frame);
  };

  setStatus("Ready. Click Bake Lightmap or press Space.");
  rafHandle = requestAnimationFrame(frame);
}

window.addEventListener("beforeunload", () => {
  if (rafHandle) {
    cancelAnimationFrame(rafHandle);
  }

  if (gl && scene && lm) {
    destroyScene(gl, scene, lm);
  }
});

void start().catch((error) => {
  console.error(error);
  setStatus(error.message || "Initialization failed.", true);
  bakeButton.disabled = true;
});
