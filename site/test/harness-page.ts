import * as THREE from "three";
import {
  createBakeHarness,
  createProgram,
  isAbortError,
  type BakeEmissiveObject,
  type BakeEnvironment,
  type BakeHarness,
  type BakeLitObject,
  type BakeScene,
  type BakeSnapshot,
  type UnwrappedObject,
  type UnwrappedScene
} from "lightmap-studio";
import { ThreeDisplay } from "../src/display/three";
import { createLightmapTexture, lightmapFilterFor } from "../src/display/materials";
import { createEnvironmentTexture } from "../src/environment/hdr";
import { generateProceduralSky, type ProceduralSky } from "../src/environment/sky";

interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

interface HarnessTestResult {
  ok: boolean;
  checks: CheckResult[];
  error?: string;
}

declare global {
  interface Window {
    __harnessTestResult?: HarnessTestResult;
  }
}

const checks: CheckResult[] = [];

function check(name: string, body: () => void): void {
  try {
    body();
    checks.push({ name, ok: true });
  } catch (error) {
    checks.push({ name, ok: false, detail: errorMessage(error) });
  }
}

async function checkAsync(name: string, body: () => Promise<void>): Promise<void> {
  try {
    await body();
    checks.push({ name, ok: true });
  } catch (error) {
    checks.push({ name, ok: false, detail: errorMessage(error) });
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

interface SurfaceOptions {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  color: [number, number, number];
  name: string;
}

function litSurface(options: SurfaceOptions): BakeLitObject {
  const { x0, x1, z0, z1, y, u0, v0, u1, v1, color, name } = options;
  return {
    kind: "lit",
    name,
    positions: new Float32Array([x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0]),
    normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
    uvs: new Float32Array([u0, v0, u0, v1, u1, v1, u1, v0]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    albedo: color
  };
}

function emissiveSurface(
  name: string,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y: number,
  color: [number, number, number]
): BakeEmissiveObject {
  return {
    kind: "emissive",
    name,
    positions: new Float32Array([x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0]),
    normals: new Float32Array([0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0]),
    indices: new Uint32Array([0, 2, 1, 0, 3, 2]),
    emissive: color
  };
}

function regionMax(result: BakeSnapshot, u0: number, v0: number, u1: number, v1: number): number {
  const x0 = Math.floor(u0 * result.width);
  const x1 = Math.ceil(u1 * result.width);
  const y0 = Math.floor(v0 * result.height);
  const y1 = Math.ceil(v1 * result.height);
  let max = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * result.width + x) * 4;
      max = Math.max(max, result.lightmap[i], result.lightmap[i + 1], result.lightmap[i + 2]);
    }
  }
  return max;
}

function singleScene() {
  return {
    atlas: { width: 64, height: 64 },
    ambient: [0, 0, 0] as [number, number, number],
    objects: [
      litSurface({
        name: "floor",
        x0: -1,
        x1: 1,
        z0: -1,
        z1: 1,
        y: 0,
        u0: 0.05,
        v0: 0.05,
        u1: 0.45,
        v1: 0.45,
        color: [0.8, 0.8, 0.8]
      }),
      emissiveSurface("ceiling", -1.2, 1.2, -1.2, 1.2, 2.4, [7, 6, 5])
    ]
  };
}

function twoObjectScene() {
  return {
    atlas: { width: 96, height: 64 },
    ambient: [0, 0, 0] as [number, number, number],
    objects: [
      litSurface({
        name: "left floor",
        x0: -1.4,
        x1: -0.2,
        z0: -0.8,
        z1: 0.8,
        y: 0,
        u0: 0.02,
        v0: 0.04,
        u1: 0.28,
        v1: 0.48,
        color: [0.8, 0.8, 0.8]
      }),
      litSurface({
        name: "right floor",
        x0: 0.2,
        x1: 1.4,
        z0: -0.8,
        z1: 0.8,
        y: 0,
        u0: 0.52,
        v0: 0.04,
        u1: 0.78,
        v1: 0.48,
        color: [0.8, 0.8, 0.8]
      }),
      emissiveSurface("ceiling", -1.5, 1.5, -1, 1, 2.4, [8, 7, 6])
    ]
  };
}

function constantEnvironment(
  color: [number, number, number],
  intensity = 1,
  width = 4,
  height = 2
): BakeEnvironment {
  const data = new Float32Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
    data[i + 3] = 1;
  }
  return { width, height, data, intensity };
}

function topBottomEnvironment(
  top: [number, number, number],
  bottom: [number, number, number],
  width = 8,
  height = 4
): BakeEnvironment {
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const color = y < height / 2 ? bottom : top;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = 1;
    }
  }
  return { width, height, data, intensity: 1 };
}

/** Bright band just above the horizon, dark zenith; isolates grazing weight. */
function horizonEnvironment(width = 8, height = 4): BakeEnvironment {
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const value = y === height - 2 ? 4 : 0;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 1;
    }
  }
  return { width, height, data, intensity: 1 };
}

function proceduralSky(overrides: Partial<ProceduralSky> = {}): ProceduralSky {
  return {
    width: 64,
    height: 32,
    zenith: [0, 0, 0],
    horizon: [0, 0, 0],
    ground: [0, 0, 0],
    intensity: 1,
    sun: {
      direction: [0, 1, 0],
      color: [8, 8, 8],
      angularRadius: 0.2,
      intensity: 1
    },
    ...overrides
  };
}

function environmentOnlyScene(environment: BakeEnvironment, size = 4): BakeScene {
  return {
    atlas: { width: 64, height: 64 },
    ambient: [0, 0, 0],
    environment,
    objects: [
      litSurface({
        name: "environment floor",
        x0: -size,
        x1: size,
        z0: -size,
        z1: size,
        y: 0,
        u0: 0.05,
        v0: 0.05,
        u1: 0.45,
        v1: 0.45,
        color: [0.8, 0.8, 0.8]
      })
    ]
  };
}

function unwrappedQuad(): UnwrappedScene {
  const surface = litSurface({
    name: "test quad",
    x0: -1,
    x1: 1,
    z0: -1,
    z1: 1,
    y: 0,
    u0: 0.05,
    v0: 0.05,
    u1: 0.45,
    v1: 0.45,
    color: [0.8, 0.8, 0.8]
  });
  const object: UnwrappedObject = {
    name: surface.name,
    positions: surface.positions,
    normals: surface.normals,
    uvs: surface.uvs,
    indices: surface.indices,
    charts: new Uint32Array(4),
    albedo: surface.albedo,
    triangleCount: 2,
    chartCount: 1
  };
  return {
    litObjects: [object],
    emissiveObjects: [],
    atlas: { width: 64, height: 64, chartCount: 1, utilization: 0.5 }
  };
}

async function main(): Promise<void> {
  let harness: BakeHarness | null = null;
  try {
    harness = await createBakeHarness();

    await checkAsync("bakes a lit quad under an emissive ceiling", async () => {
      const result = await harness!.bake(singleScene(), {
        hemisphereSize: 16,
        bounces: 1,
        dilationPasses: 2
      });
      assert(result.width === 64 && result.height === 64, "unexpected atlas dimensions");
      assert(result.lightmap.length === 64 * 64 * 4, "unexpected lightmap length");
      for (const value of result.lightmap) assert(Number.isFinite(value), "non-finite lightmap value");
      assert(result.stats.max > 0, "lightmap is black");
      assert(regionMax(result, 0.05, 0.05, 0.45, 0.45) > 0, "baked region is black");
    });

    await checkAsync("bakes a constant environment with black ambient and no emitters", async () => {
      const result = await harness!.bake(
        environmentOnlyScene(constantEnvironment([0.8, 0.6, 0.4], 1)),
        { hemisphereSize: 16, bounces: 1, dilationPasses: 1 }
      );
      for (const value of result.lightmap) assert(Number.isFinite(value), "non-finite lightmap value");
      assert(result.stats.max > 0, "constant environment produced a black lightmap");
      assert(regionMax(result, 0.05, 0.05, 0.45, 0.45) > 0, "environment floor region is black");
      assert(harness!.gl.getError() === harness!.gl.NO_ERROR, "GL error after environment bake");
    });

    await checkAsync("does not light the scene with a black environment", async () => {
      const result = await harness!.bake(
        environmentOnlyScene(constantEnvironment([0, 0, 0], 1)),
        { hemisphereSize: 16, bounces: 1, dilationPasses: 0 }
      );
      assert(result.stats.max < 1e-6, `black environment produced ${result.stats.max}`);
      assert(result.stats.nonBlackRatio === 0, "black environment marked pixels as lit");
    });

    await checkAsync("scales environment lighting with intensity", async () => {
      const scene = environmentOnlyScene(constantEnvironment([0.5, 0.5, 0.5], 1));
      const low = await harness!.bake(scene, { hemisphereSize: 16, bounces: 1, dilationPasses: 0 });
      const high = await harness!.bake(
        { ...scene, environment: constantEnvironment([0.5, 0.5, 0.5], 2) },
        { hemisphereSize: 16, bounces: 1, dilationPasses: 0 }
      );
      assert(high.stats.mean > low.stats.mean, "higher intensity did not increase radiance");
    });

    await checkAsync("uses the environment's top hemisphere for an up-facing surface", async () => {
      const topBright = await harness!.bake(
        environmentOnlyScene(topBottomEnvironment([2, 2, 2], [0, 0, 0]), 20),
        { hemisphereSize: 32, bounces: 1, dilationPasses: 1 }
      );
      const bottomBright = await harness!.bake(
        environmentOnlyScene(topBottomEnvironment([0, 0, 0], [2, 2, 2]), 20),
        { hemisphereSize: 32, bounces: 1, dilationPasses: 1 }
      );
      assert(topBright.stats.max > 0, "top-bright environment did not light the floor");
      assert(
        bottomBright.stats.max < topBright.stats.max * 0.25,
        `bottom-bright environment leaked light: ${bottomBright.stats.max} vs ${topBright.stats.max}`
      );
    });

    await checkAsync("cosine weighting reduces grazing horizon light", async () => {
      const scene = environmentOnlyScene(horizonEnvironment(), 8);
      const options = {
        hemisphereSize: 32,
        bounces: 1,
        dilationPasses: 0,
        smooth: false,
        interpolationPasses: 0
      } as const;
      const uniform = await harness!.bake(scene, options);
      const cosine = await harness!.bake(scene, { ...options, hemisphereWeight: "cosine" });
      assert(uniform.stats.mean > 0.01, "horizon environment produced no light");
      assert(
        cosine.stats.mean < uniform.stats.mean,
        `cosine weighting did not reduce grazing light: ${cosine.stats.mean} vs ${uniform.stats.mean}`
      );
    });

    await checkAsync("rejects an invalid hemisphere weight", async () => {
      let error: unknown = null;
      try {
        await harness!.bake(singleScene(), {
          hemisphereSize: 16,
          bounces: 1,
          hemisphereWeight: "bogus" as never
        });
      } catch (caught) {
        error = caught;
      }
      assert(error, "invalid hemisphere weight was accepted");
      assert(
        errorMessage(error).includes("hemisphere weight"),
        "error does not name the hemisphere weight"
      );
    });

    await checkAsync("applies cosine weighting to every object context", async () => {
      const module = harness!.module as unknown as {
        lmSetCosineWeights(ctx: number): void;
      };
      const original = module.lmSetCosineWeights.bind(module);
      let calls = 0;
      module.lmSetCosineWeights = (ctx) => {
        calls += 1;
        original(ctx);
      };
      try {
        const result = await harness!.bake(twoObjectScene(), {
          hemisphereSize: 16,
          bounces: 1,
          dilationPasses: 0,
          hemisphereWeight: "cosine"
        });
        assert(regionMax(result, 0.02, 0.04, 0.28, 0.48) > 0, "left cosine region is black");
        assert(regionMax(result, 0.52, 0.04, 0.78, 0.48) > 0, "right cosine region is black");
      } finally {
        module.lmSetCosineWeights = original;
      }
      assert(calls === 2, `expected 2 cosine context calls, saw ${calls}`);
    });

    await checkAsync("recovers after cancelling a cosine bake", async () => {
      const controller = new AbortController();
      let aborted = false;
      const promise = harness!.bake(environmentOnlyScene(horizonEnvironment(), 8), {
        hemisphereSize: 32,
        bounces: 4,
        dilationPasses: 1,
        hemisphereWeight: "cosine",
        signal: controller.signal,
        onProgress: (progress) => {
          if (!aborted && progress.stage === "bounce") {
            aborted = true;
            controller.abort();
          }
        }
      });
      let abortedError: unknown = null;
      try {
        await promise;
      } catch (error) {
        abortedError = error;
      }
      assert(abortedError, "cosine bake completed instead of aborting");
      assert(isAbortError(abortedError), `unexpected abort error: ${errorMessage(abortedError)}`);
      const next = await harness!.bake(singleScene(), { hemisphereSize: 16, bounces: 1 });
      assert(next.stats.max > 0, "bake after cosine cancellation did not produce light");
    });

    await checkAsync("keeps procedural sun occlusion consistent at H64 and H128", async () => {
      const sun = generateProceduralSky(
        proceduralSky({ sun: { direction: [0, 1, 0], color: [8, 8, 8], angularRadius: 0.2 } })
      );
      for (const hemisphereSize of [64, 128]) {
        const openScene = environmentOnlyScene(sun, 2);
        const open = await harness!.bake(openScene, {
          hemisphereSize,
          bounces: 1,
          dilationPasses: 0,
          smooth: false,
          interpolationPasses: 0,
          hemisphereWeight: "cosine"
        });
        const occludedScene = environmentOnlyScene(sun, 2);
        occludedScene.objects.push(
          emissiveSurface("black ceiling", -10, 10, -10, 10, 1.5, [0, 0, 0])
        );
        const occluded = await harness!.bake(occludedScene, {
          hemisphereSize,
          bounces: 1,
          dilationPasses: 0,
          smooth: false,
          interpolationPasses: 0,
          hemisphereWeight: "cosine"
        });
        assert(open.stats.max > 0, `open sun produced no light at H${hemisphereSize}`);
        assert(
          occluded.stats.max < open.stats.max * 0.05,
          `ceiling did not occlude the sun at H${hemisphereSize}: ${occluded.stats.max} vs ${open.stats.max}`
        );
      }
    });

    await checkAsync("rejects an invalid environment with a clear error", async () => {
      const scene = environmentOnlyScene(constantEnvironment([1, 1, 1]));
      scene.environment = { ...scene.environment!, data: new Float32Array(4) };
      let error: unknown = null;
      try {
        await harness!.bake(scene, { hemisphereSize: 8, bounces: 1 });
      } catch (caught) {
        error = caught;
      }
      assert(error, "invalid environment was accepted");
      assert(errorMessage(error).includes("environment"), "error does not name the environment");
    });

    await checkAsync("lights an up-facing surface with a procedural sun above the horizon", async () => {
      const sunUp = generateProceduralSky(
        proceduralSky({ sun: { direction: [0, 1, 0], color: [8, 8, 8], angularRadius: 0.2 } })
      );
      const sunDown = generateProceduralSky(
        proceduralSky({ sun: { direction: [0, -1, 0], color: [8, 8, 8], angularRadius: 0.2 } })
      );
      const up = await harness!.bake(environmentOnlyScene(sunUp), {
        hemisphereSize: 32,
        bounces: 1,
        dilationPasses: 0
      });
      const down = await harness!.bake(environmentOnlyScene(sunDown), {
        hemisphereSize: 32,
        bounces: 1,
        dilationPasses: 0
      });
      assert(up.stats.max > 0.01, "procedural sun above the horizon produced no light");
      assert(
        down.stats.max < up.stats.max * 0.05,
        `sun below the horizon leaked light: ${down.stats.max} vs ${up.stats.max}`
      );
      assert(harness!.gl.getError() === harness!.gl.NO_ERROR, "GL error after procedural sun bake");
    });

    await checkAsync("leaves only sky fill when the procedural sun is below the horizon", async () => {
      const gradient: Partial<ProceduralSky> = {
        zenith: [0.2, 0.3, 0.5],
        horizon: [0.3, 0.3, 0.3],
        ground: [0, 0, 0]
      };
      const sunUp = generateProceduralSky(
        proceduralSky({
          ...gradient,
          sun: { direction: [0, 1, 0], color: [8, 8, 8], angularRadius: 0.2 }
        })
      );
      const sunDown = generateProceduralSky(
        proceduralSky({
          ...gradient,
          sun: { direction: [0, -1, 0], color: [8, 8, 8], angularRadius: 0.2 }
        })
      );
      const up = await harness!.bake(environmentOnlyScene(sunUp), {
        hemisphereSize: 32,
        bounces: 1,
        dilationPasses: 0
      });
      const down = await harness!.bake(environmentOnlyScene(sunDown), {
        hemisphereSize: 32,
        bounces: 1,
        dilationPasses: 0
      });
      assert(down.stats.max > 0, "sky fill produced no light");
      assert(
        up.stats.max > down.stats.max * 1.2,
        `sun above the horizon did not outshine sky fill: ${up.stats.max} vs ${down.stats.max}`
      );
    });

    await checkAsync("scales procedural sun light with sun intensity", async () => {
      const low = generateProceduralSky(
        proceduralSky({ sun: { direction: [0, 1, 0], color: [8, 8, 8], angularRadius: 0.2 } })
      );
      const high = generateProceduralSky(
        proceduralSky({
          sun: { direction: [0, 1, 0], color: [8, 8, 8], angularRadius: 0.2, intensity: 2 }
        })
      );
      const lowResult = await harness!.bake(environmentOnlyScene(low), {
        hemisphereSize: 32,
        bounces: 1,
        dilationPasses: 0
      });
      const highResult = await harness!.bake(environmentOnlyScene(high), {
        hemisphereSize: 32,
        bounces: 1,
        dilationPasses: 0
      });
      assert(
        highResult.stats.mean > lowResult.stats.mean,
        "higher sun intensity did not increase radiance"
      );
    });

    await checkAsync("occludes the procedural sun behind black geometry", async () => {
      const sunUp = generateProceduralSky(
        proceduralSky({ sun: { direction: [0, 1, 0], color: [8, 8, 8], angularRadius: 0.2 } })
      );
      const open = await harness!.bake(environmentOnlyScene(sunUp, 2), {
        hemisphereSize: 32,
        bounces: 1,
        dilationPasses: 0
      });
      const scene = environmentOnlyScene(sunUp, 2);
      scene.objects.push(emissiveSurface("black ceiling", -10, 10, -10, 10, 1.5, [0, 0, 0]));
      const occluded = await harness!.bake(scene, {
        hemisphereSize: 32,
        bounces: 1,
        dilationPasses: 0
      });
      assert(open.stats.max > 0, "open-sun reference produced no light");
      assert(
        occluded.stats.max < open.stats.max * 0.05,
        `the ceiling did not occlude the sun: ${occluded.stats.max} vs ${open.stats.max}`
      );
    });

    await checkAsync("recovers after cancelling an environment bake", async () => {
      const controller = new AbortController();
      let aborted = false;
      const promise = harness!.bake(
        environmentOnlyScene(constantEnvironment([1, 1, 1]), 8),
        {
          hemisphereSize: 32,
          bounces: 4,
          dilationPasses: 1,
          signal: controller.signal,
          onProgress: (progress) => {
            if (!aborted && progress.stage === "bounce") {
              aborted = true;
              controller.abort();
            }
          }
        }
      );
      let abortedError: unknown = null;
      try {
        await promise;
      } catch (error) {
        abortedError = error;
      }
      assert(abortedError, "environment bake completed instead of aborting");
      assert(isAbortError(abortedError), `unexpected abort error: ${errorMessage(abortedError)}`);
      const next = await harness!.bake(singleScene(), { hemisphereSize: 16, bounces: 1 });
      assert(next.stats.max > 0, "bake after environment cancellation did not produce light");
    });

    await checkAsync("shares one atlas between two lit objects and uploads once per bounce", async () => {
      let uploads = 0;
      const result = await harness!.bake(twoObjectScene(), {
        hemisphereSize: 16,
        bounces: 2,
        dilationPasses: 2,
        testHooks: { onLightmapUpload: () => { uploads += 1; } }
      });
      assert(uploads === 2, `expected 2 uploads, saw ${uploads}`);
      assert(regionMax(result, 0.02, 0.04, 0.28, 0.48) > 0, "left atlas region is black");
      assert(regionMax(result, 0.52, 0.04, 0.78, 0.48) > 0, "right atlas region is black");
    });

    await checkAsync("reports monotonic progress and a done stage", async () => {
      const fractions: number[] = [];
      const stages = new Set<string>();
      const result = await harness!.bake(singleScene(), {
        hemisphereSize: 16,
        bounces: 2,
        dilationPasses: 1,
        onProgress: (progress) => {
          fractions.push(progress.fraction);
          stages.add(progress.stage);
        }
      });
      assert(fractions.length > 0, "no progress was reported");
      for (let i = 1; i < fractions.length; i += 1) {
        assert(fractions[i] >= fractions[i - 1], `progress went backwards at ${i}`);
      }
      assert(fractions[fractions.length - 1] === 1, "progress did not finish at 1");
      assert(stages.has("bounce"), "bounce stage missing");
      assert(stages.has("postprocess"), "postprocess stage missing");
      assert(stages.has("readback"), "readback stage missing");
      assert(stages.has("done"), "done stage missing");
      assert(result.stats.nonBlackRatio > 0, "stats report no lit pixels");
    });

    await checkAsync("yields to the event loop while baking", async () => {
      let yields = 0;
      await harness!.bake(singleScene(), {
        hemisphereSize: 32,
        bounces: 2,
        dilationPasses: 1,
        yieldToMain: async () => {
          yields += 1;
          await Promise.resolve();
        }
      });
      assert(yields > 0, "bake never yielded");
    });

    await checkAsync("cancels a bake and starts the next one cleanly", async () => {
      const controller = new AbortController();
      let aborted = false;
      const promise = harness!.bake(singleScene(), {
        hemisphereSize: 32,
        bounces: 4,
        dilationPasses: 1,
        signal: controller.signal,
        onProgress: (progress) => {
          if (!aborted && progress.stage === "bounce") {
            aborted = true;
            controller.abort();
          }
        }
      });
      let abortedError: unknown = null;
      try {
        await promise;
      } catch (error) {
        abortedError = error;
      }
      assert(abortedError, "bake completed instead of aborting");
      assert(isAbortError(abortedError), `unexpected abort error: ${errorMessage(abortedError)}`);
      const next = await harness!.bake(singleScene(), { hemisphereSize: 16, bounces: 1 });
      assert(next.stats.max > 0, "bake after cancellation did not produce light");
    });

    await checkAsync("rejects an invalid lightmap UV with the object name", async () => {
      const scene = singleScene();
      const first = scene.objects[0];
      assert(first.kind === "lit", "first object is not lit");
      first.uvs[0] = 1;
      let error: unknown = null;
      try {
        await harness!.bake(scene, { hemisphereSize: 8, bounces: 1 });
      } catch (caught) {
        error = caught;
      }
      assert(error, "invalid UV was accepted");
      assert(errorMessage(error).includes("floor"), "error does not name the object");
      assert(errorMessage(error).includes("[0, 1)"), "error does not name the valid range");
    });

    await checkAsync("creates a linear lightmap texture with the result data", async () => {
      const result = await harness!.bake(singleScene(), {
        hemisphereSize: 8,
        bounces: 1,
        dilationPasses: 0
      });
      const texture = createLightmapTexture(result, harness!.gl);
      assert(texture.image.width === result.width, "texture width differs");
      assert(texture.image.height === result.height, "texture height differs");
      assert(texture.image.data === result.lightmap, "texture does not reference the result data");
      assert(texture.colorSpace === THREE.LinearSRGBColorSpace, "texture is not linear");
      assert(texture.minFilter === lightmapFilterFor(harness!.gl), "unexpected min filter");
      assert(lightmapFilterFor({ getExtension: () => null }) === THREE.NearestFilter, "nearest fallback missing");
      assert(lightmapFilterFor({ getExtension: () => ({}) }) === THREE.LinearFilter, "linear filter missing");
      texture.dispose();
    });

    await checkAsync("updates the same display texture across bounces and switches modes", async () => {
      const result = await harness!.bake(singleScene(), {
        hemisphereSize: 8,
        bounces: 1,
        dilationPasses: 0
      });
      const unwrapped = unwrappedQuad();
      const container = document.createElement("div");
      container.style.width = "96px";
      container.style.height = "64px";
      document.body.appendChild(container);
      const display = new ThreeDisplay(container);
      try {
        display.setScene(unwrapped, result);
        display.resume();
        const texture = display.lightmapTexture;
        assert(texture, "display did not create a lightmap texture");
        assert(texture!.image.width === result.width, "display texture width differs");
        assert(texture!.image.height === result.height, "display texture height differs");
        assert(texture!.image.data === result.lightmap, "display texture does not reference the result");

        const mesh = display.scene.getObjectByName("test quad") as THREE.Mesh;
        const material = mesh.material as THREE.MeshBasicMaterial;
        display.setMode("unlit");
        assert(material.map === null, "unlit mode still samples the lightmap");
        display.setMode("lit");
        assert(material.map === texture, "lit mode does not sample the lightmap");
        display.setWireframe(true);
        assert(material.wireframe === true, "wireframe mode was not applied");
        display.setWireframe(false);

        const next = new Float32Array(result.lightmap);
        next[0] = 0.75;
        display.updateLightmap({ ...result, lightmap: next });
        const updatedTexture = display.lightmapTexture;
        assert(updatedTexture === texture, "bounce update recreated the texture");
        assert(updatedTexture, "display lost its lightmap texture");
        const firstValue = (updatedTexture.image.data as Float32Array)[0];
        assert(firstValue === 0.75, "bounce data was not copied");
      } finally {
        display.dispose();
        container.remove();
      }
    });

    await checkAsync("applies an equirectangular HDRI background and disposes it", async () => {
      const texture = createEnvironmentTexture(constantEnvironment([0.5, 0.5, 0.5]));
      const container = document.createElement("div");
      container.style.width = "96px";
      container.style.height = "64px";
      document.body.appendChild(container);
      const display = new ThreeDisplay(container, {
        environment: texture,
        environmentIntensity: 2
      });
      try {
        assert(display.scene.background === texture, "environment is not the scene background");
        assert(display.backgroundTexture === texture, "display does not expose the environment texture");
        assert(
          texture.mapping === THREE.EquirectangularReflectionMapping,
          "environment mapping is not equirectangular"
        );
        assert(texture.colorSpace === THREE.LinearSRGBColorSpace, "environment is not linear");
        assert(
          Math.abs(display.scene.backgroundIntensity - 2) < 1e-9,
          "background intensity was not applied"
        );

        display.setEnvironment(texture, 1.5);
        assert(
          Math.abs(display.scene.backgroundIntensity - 1.5) < 1e-9,
          "setEnvironment did not update intensity"
        );

        let disposed = false;
        texture.addEventListener("dispose", () => {
          disposed = true;
        });
        display.dispose();
        assert(disposed, "environment texture was not disposed with the display");
      } finally {
        if (!display.isDisposed) display.dispose();
        container.remove();
      }
    });

    await checkAsync("keeps solid and transparent backgrounds working", async () => {
      const solidContainer = document.createElement("div");
      solidContainer.style.width = "80px";
      solidContainer.style.height = "50px";
      document.body.appendChild(solidContainer);
      const solid = new ThreeDisplay(solidContainer, { background: [0.1, 0.2, 0.3] });
      try {
        assert(solid.scene.background instanceof THREE.Color, "solid background was not applied");
      } finally {
        solid.dispose();
        solidContainer.remove();
      }

      const transparentContainer = document.createElement("div");
      transparentContainer.style.width = "80px";
      transparentContainer.style.height = "50px";
      document.body.appendChild(transparentContainer);
      const transparent = new ThreeDisplay(transparentContainer);
      try {
        assert(transparent.scene.background === null, "transparent background is not null");
      } finally {
        transparent.dispose();
        transparentContainer.remove();
      }
    });

    await checkAsync("disposes renderer resources and stops the render loop", async () => {
      const result = await harness!.bake(singleScene(), {
        hemisphereSize: 8,
        bounces: 1,
        dilationPasses: 0
      });
      const container = document.createElement("div");
      container.style.width = "80px";
      container.style.height = "50px";
      document.body.appendChild(container);
      const display = new ThreeDisplay(container);
      display.setScene(unwrappedQuad(), result);
      assert(display.geometryCount > 0, "no geometries were created");
      assert(display.materialCount > 0, "no materials were created");
      assert(display.isRendering, "render loop did not start");

      display.dispose();
      const framesAfterDispose = display.frameCount;
      await new Promise((resolve) => setTimeout(resolve, 120));

      assert(display.isDisposed, "display is not marked disposed");
      assert(!display.isRendering, "render loop still running after dispose");
      assert(display.frameCount === framesAfterDispose, "render loop advanced after dispose");
      assert(display.geometryCount === 0, "geometries were not released");
      assert(display.materialCount === 0, "materials were not released");
      assert(display.lightmapTexture === null, "lightmap texture was not released");
      container.remove();
    });

    check("reports shader compilation failures clearly", () => {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2");
      assert(gl, "WebGL2 unavailable for shader error check");
      let message = "";
      try {
        createProgram(gl!, "#version 300 es\nthis is not glsl", "#version 300 es\nout vec4 c; void main(){c=vec4(1.0);}");
      } catch (error) {
        message = errorMessage(error);
      }
      assert(message.includes("compilation failed"), `unexpected shader error: ${message}`);
    });
  } catch (error) {
    checks.push({ name: "harness setup", ok: false, detail: errorMessage(error) });
  } finally {
    harness?.dispose();
    const result: HarnessTestResult = { ok: checks.every((entry) => entry.ok), checks };
    window.__harnessTestResult = result;
    const output = document.getElementById("result");
    if (output) output.textContent = result.ok ? "PASS" : "FAIL";
  }
}

main().catch((error) => {
  window.__harnessTestResult = {
    ok: false,
    checks,
    error: errorMessage(error)
  };
});
