import * as THREE from "three";
import {
  decodeHdr,
  loadEnvironment,
  type EnvironmentInput
} from "lightmap-studio";
import { lightmapFilterFor, type FloatLinearQuery } from "../display/materials";

export class EnvironmentError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EnvironmentError";
  }
}

export interface LoadedEnvironment {
  /** Environment data passed to the studio bake. */
  environment: EnvironmentInput;
  /** Full-resolution environment used by the display background. */
  display: EnvironmentInput;
  /** Full-resolution linear equirectangular texture used by the display. */
  texture: THREE.DataTexture;
}

export interface LoadEnvironmentOptions {
  intensity?: number;
  /** WebGL context used to choose a supported float filtering mode. */
  context?: FloatLinearQuery | null;
}

export function createEnvironmentTexture(
  environment: EnvironmentInput,
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
  let display: EnvironmentInput;
  try {
    display = await loadEnvironment(url, { intensity: options.intensity });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new EnvironmentError(`HDRI could not be decoded from ${url}: ${message}`, {
      cause: error
    });
  }

  return {
    environment: display,
    display,
    texture: createEnvironmentTexture(display, options.context)
  };
}

export { decodeHdr };
