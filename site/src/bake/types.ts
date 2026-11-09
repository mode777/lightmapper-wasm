/** Local copy keeps the bake harness free of site-specific imports. */
export type Vec3 = [number, number, number];

export type BakeStage = "prepare" | "bounce" | "postprocess" | "readback" | "done";

export interface BakeProgress {
  stage: BakeStage;
  /** Monotonically increasing overall fraction in [0, 1]. */
  fraction: number;
  bounce: number;
  bounces: number;
  object: number;
  objectCount: number;
}

export interface BakeObjectBase {
  name: string;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

export interface BakeLitObject extends BakeObjectBase {
  kind: "lit";
  uvs: Float32Array;
  albedo: Vec3;
}

export interface BakeEmissiveObject extends BakeObjectBase {
  kind: "emissive";
  emissive: Vec3;
}

export type BakeObject = BakeLitObject | BakeEmissiveObject;

export interface BakeEnvironment {
  width: number;
  height: number;
  /** Linear RGBA radiance, bottom-up: row 0 is the south pole (v = 0). */
  data: Float32Array;
  /** Linear radiance multiplier; defaults to 1. */
  intensity?: number;
}

export interface BakeScene {
  atlas: { width: number; height: number };
  ambient: Vec3;
  objects: BakeObject[];
  /** Optional equirectangular HDRI drawn as the bake skybox. */
  environment?: BakeEnvironment;
}

export interface BakeStats {
  mean: number;
  min: number;
  max: number;
  nonBlackRatio: number;
  litPixels: number;
}

export interface BakeResult {
  lightmap: Float32Array;
  width: number;
  height: number;
  channels: 4;
  stats: BakeStats;
  durationMs: number;
  bounces: number;
  objectCount: number;
  triangleCount: number;
}

export interface BakeTestHooks {
  failWebGL2?: boolean;
  failFloat?: boolean;
  /** Called once per bounce after the shared atlas is uploaded. */
  onLightmapUpload?: (bounce: number) => void;
}

export interface BakeOptions {
  hemisphereSize?: number;
  bounces?: number;
  zNear?: number;
  zFar?: number;
  dilationPasses?: number;
  smooth?: boolean;
  /** Hierarchical interpolation passes passed to lmCreate (0-8). */
  interpolationPasses?: number;
  /** Absolute radiance error below which lmCreate interpolates. */
  interpolationThreshold?: number;
  onProgress?: (progress: BakeProgress) => void;
  onBounce?: (result: BakeResult) => void;
  signal?: AbortSignal;
  /** Cooperative yield used between batches; defaults to requestAnimationFrame. */
  yieldToMain?: () => Promise<void>;
  testHooks?: BakeTestHooks;
}

export interface BakeHarnessOptions {
  canvas?: HTMLCanvasElement | OffscreenCanvas;
  webglContext?: WebGL2RenderingContext;
  locateWasm?: (filename: string) => string | URL;
  testHooks?: BakeTestHooks;
}

export type BakeErrorCode =
  | "webgl2"
  | "float"
  | "module"
  | "validation"
  | "aborted"
  | "disposed"
  | "gl";

export class BakeError extends Error {
  readonly code: BakeErrorCode;

  constructor(message: string, code: BakeErrorCode, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "BakeError";
    this.code = code;
  }
}

export function abortError(message = "bake aborted"): BakeError {
  return new BakeError(message, "aborted");
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof BakeError && error.code === "aborted"
  ) || (error instanceof DOMException && error.name === "AbortError");
}
