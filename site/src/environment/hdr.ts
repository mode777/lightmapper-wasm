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
  environment: BakeEnvironment;
  texture: THREE.DataTexture;
}

export interface LoadEnvironmentOptions {
  intensity?: number;
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

    const environment: BakeEnvironment = {
      width,
      height,
      data: flipRowsBottomUp(data, width, height),
      intensity: options.intensity ?? 1
    };
    validateBakeEnvironment(environment);

    const texture = createEnvironmentTexture(environment, options.context);
    return { environment, texture };
  } finally {
    source.dispose();
  }
}
