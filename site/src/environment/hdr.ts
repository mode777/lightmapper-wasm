import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { validateBakeEnvironment } from "../bake/environment";
import type { BakeEnvironment } from "../bake/types";
import { lightmapFilterFor, type FloatLinearQuery } from "../display/materials";

export class EnvironmentError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EnvironmentError";
  }
}

export interface LoadedEnvironment {
  /** Prefiltered irradiance copy used by the bake skybox. */
  environment: BakeEnvironment;
  /** Full-resolution linear equirectangular texture used by the display. */
  texture: THREE.DataTexture;
}

export const PREFILTERED_ENVIRONMENT_WIDTH = 128;
export const PREFILTERED_ENVIRONMENT_HEIGHT = 64;

export interface LoadEnvironmentOptions {
  intensity?: number;
  /** Gaussian radius in target texels for the prefiltered bake copy. */
  prefilterRadius?: number;
  /** WebGL context used to choose a supported float filtering mode. */
  context?: FloatLinearQuery | null;
}

/**
 * The Radiance file stores scanlines top-down. Flip once so both the bake
 * skybox and the three.js background use bottom-up rows:
 * row 0 is the south pole (v = 0), the last row is the north pole (v = 1).
 */
export function flipRowsBottomUp(
  data: Float32Array,
  width: number,
  height: number
): Float32Array {
  const rowLength = width * 4;
  if (data.length !== rowLength * height) {
    throw new EnvironmentError(
      `HDRI data length ${data.length} does not match ${width}x${height}x4`
    );
  }
  const flipped = new Float32Array(data.length);
  for (let y = 0; y < height; y += 1) {
    const source = (height - 1 - y) * rowLength;
    flipped.set(data.subarray(source, source + rowLength), y * rowLength);
  }
  return flipped;
}

/**
 * Build a low-resolution, blurred irradiance copy for diffuse baking. The
 * full-resolution HDRI is still used for the visible background; a raw 1k
 * studio HDRI contains a high-frequency softbox diffusion grid that aliases
 * badly when captured into a 32-128 px hemisphere.
 */
function gaussianWeights(radius: number): number[] {
  if (radius === 2) return [1, 4, 6, 4, 1];
  const sigma = radius / 2;
  return Array.from({ length: radius * 2 + 1 }, (_, index) => {
    const offset = index - radius;
    return Math.exp(-(offset * offset) / (2 * sigma * sigma));
  });
}

export function prefilterEnvironment(
  data: Float32Array,
  width: number,
  height: number,
  targetWidth = PREFILTERED_ENVIRONMENT_WIDTH,
  targetHeight = PREFILTERED_ENVIRONMENT_HEIGHT,
  radius = 2
): BakeEnvironment {
  if (!Number.isInteger(targetWidth) || !Number.isInteger(targetHeight) || targetWidth <= 0 || targetHeight <= 0) {
    throw new EnvironmentError(`invalid prefilter dimensions ${targetWidth}x${targetHeight}`);
  }
  if (!Number.isInteger(radius) || radius < 1 || radius > 4) {
    throw new EnvironmentError(`prefilter radius ${radius} must be an integer in [1, 4]`);
  }
  if (width % targetWidth !== 0 || height % targetHeight !== 0) {
    throw new EnvironmentError(
      `environment ${width}x${height} cannot be box-filtered to ${targetWidth}x${targetHeight}`
    );
  }

  const scaleX = width / targetWidth;
  const scaleY = height / targetHeight;
  const downsampled = new Float32Array(targetWidth * targetHeight * 4);
  for (let ty = 0; ty < targetHeight; ty += 1) {
    for (let tx = 0; tx < targetWidth; tx += 1) {
      const sum = [0, 0, 0, 0];
      for (let sy = 0; sy < scaleY; sy += 1) {
        const sourceY = ty * scaleY + sy;
        for (let sx = 0; sx < scaleX; sx += 1) {
          const source = (sourceY * width + tx * scaleX + sx) * 4;
          sum[0] += data[source];
          sum[1] += data[source + 1];
          sum[2] += data[source + 2];
          sum[3] += data[source + 3];
        }
      }
      const count = scaleX * scaleY;
      const target = (ty * targetWidth + tx) * 4;
      downsampled[target] = sum[0] / count;
      downsampled[target + 1] = sum[1] / count;
      downsampled[target + 2] = sum[2] / count;
      downsampled[target + 3] = sum[3] / count;
    }
  }

  // A separable Gaussian removes the remaining softbox grid, sun disc and
  // cloud detail that would otherwise alias into the diffuse lightmap. The
  // radius is configurable so a cloudy outdoor HDRI can use a wider bake copy
  // while a studio HDRI keeps the existing five-tap filter.
  const weights = gaussianWeights(radius);
  const weightSum = weights.reduce((total, weight) => total + weight, 0) ** 2;
  const blurred = new Float32Array(downsampled.length);
  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const sum = [0, 0, 0, 0];
      for (let ky = -radius; ky <= radius; ky += 1) {
        const sourceY = Math.min(targetHeight - 1, Math.max(0, y + ky));
        for (let kx = -radius; kx <= radius; kx += 1) {
          const sourceX = (x + kx + targetWidth) % targetWidth;
          const source = (sourceY * targetWidth + sourceX) * 4;
          const weight = weights[ky + radius] * weights[kx + radius];
          sum[0] += downsampled[source] * weight;
          sum[1] += downsampled[source + 1] * weight;
          sum[2] += downsampled[source + 2] * weight;
          sum[3] += downsampled[source + 3] * weight;
        }
      }
      const target = (y * targetWidth + x) * 4;
      blurred[target] = sum[0] / weightSum;
      blurred[target + 1] = sum[1] / weightSum;
      blurred[target + 2] = sum[2] / weightSum;
      blurred[target + 3] = sum[3] / weightSum;
    }
  }

  return {
    width: targetWidth,
    height: targetHeight,
    data: blurred,
    intensity: 1
  };
}

export function createEnvironmentTexture(
  environment: BakeEnvironment,
  context: FloatLinearQuery | null = null
): THREE.DataTexture {
  const filter = lightmapFilterFor(context);
  const texture = new THREE.DataTexture(
    environment.data,
    environment.width,
    environment.height,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.flipY = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = filter;
  texture.magFilter = filter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export async function loadHdrEnvironment(
  url: string | URL,
  options: LoadEnvironmentOptions = {}
): Promise<LoadedEnvironment> {
  const loader = new HDRLoader().setDataType(THREE.FloatType);
  let source: THREE.DataTexture;
  try {
    source = await loader.loadAsync(url.toString());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new EnvironmentError(`HDRI could not be decoded from ${url}: ${message}`, {
      cause: error
    });
  }

  try {
    const image = source.image as { width?: number; height?: number; data?: unknown };
    const width = image.width;
    const height = image.height;
    const data = image.data;
    if (
      typeof width !== "number" ||
      typeof height !== "number" ||
      !(data instanceof Float32Array)
    ) {
      throw new EnvironmentError(`HDRI ${url} did not decode to a float RGBA image`);
    }

    const fullData = flipRowsBottomUp(data, width, height);
    const displayEnvironment: BakeEnvironment = {
      width,
      height,
      data: fullData,
      intensity: options.intensity ?? 1
    };
    validateBakeEnvironment(displayEnvironment);

    const texture = createEnvironmentTexture(displayEnvironment, options.context);
    const environment = prefilterEnvironment(
      fullData,
      width,
      height,
      PREFILTERED_ENVIRONMENT_WIDTH,
      PREFILTERED_ENVIRONMENT_HEIGHT,
      options.prefilterRadius
    );
    environment.intensity = displayEnvironment.intensity;
    validateBakeEnvironment(environment);
    return { environment, texture };
  } finally {
    source.dispose();
  }
}
