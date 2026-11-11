import { validateEnvironment, type EnvironmentInput, type Vec3 } from "lightmap-studio";
import type { FloatLinearQuery } from "../display/materials";
import {
  EnvironmentError,
  createEnvironmentTexture,
  type LoadedEnvironment
} from "./hdr";

export interface ProceduralSun {
  /** World-space direction from the surface toward the sun. */
  direction: Vec3;
  /** Linear radiance inside the disk. */
  color: Vec3;
  /** Angular radius in radians; must be in (0, PI / 2). */
  angularRadius: number;
  /** Multiplier applied to the sun color; defaults to 1. */
  intensity?: number;
}

export interface ProceduralSky {
  zenith: Vec3;
  horizon: Vec3;
  ground: Vec3;
  /** Linear multiplier applied by the bake and display; defaults to 1. */
  intensity?: number;
  sun: ProceduralSun;
  /** Equirectangular width in texels; defaults to 512. */
  width?: number;
  /** Equirectangular height in texels; defaults to 256. */
  height?: number;
}

export const DEFAULT_PROCEDURAL_SKY_WIDTH = 512;
export const DEFAULT_PROCEDURAL_SKY_HEIGHT = 256;

/** Bake-only override for the visible sun disk. Same direction and radiance. */
export interface ProceduralSunVariant {
  angularRadius: number;
  softness?: number;
  /** Multiplier applied to the sun disk radiance; defaults to 1. */
  intensity?: number;
}

interface ResolvedProceduralSky {
  width: number;
  height: number;
  intensity: number;
  zenith: Vec3;
  horizon: Vec3;
  ground: Vec3;
  sunDirection: Vec3;
  sunColor: Vec3;
  sunIntensity: number;
  sunAngularRadius: number;
}

function assertColor(value: Vec3, label: string): void {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new EnvironmentError(`${label} must be an RGB triple`);
  }
  for (let i = 0; i < 3; i += 1) {
    const component = value[i];
    if (!Number.isFinite(component)) {
      throw new EnvironmentError(`${label} component ${i} is not finite: ${component}`);
    }
    if (component < 0) {
      throw new EnvironmentError(`${label} component ${i} is negative: ${component}`);
    }
  }
}

function assertIntensity(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new EnvironmentError(`${label} ${value} must be finite and non-negative`);
  }
}

function resolveProceduralSky(sky: ProceduralSky): ResolvedProceduralSky {
  if (!sky || typeof sky !== "object") {
    throw new EnvironmentError("procedural sky descriptor is missing");
  }

  const width = sky.width ?? DEFAULT_PROCEDURAL_SKY_WIDTH;
  const height = sky.height ?? DEFAULT_PROCEDURAL_SKY_HEIGHT;
  if (!Number.isInteger(width) || width <= 0) {
    throw new EnvironmentError(`procedural sky width ${width} must be a positive integer`);
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new EnvironmentError(`procedural sky height ${height} must be a positive integer`);
  }

  const intensity = sky.intensity ?? 1;
  assertIntensity(intensity, "procedural sky intensity");

  assertColor(sky.zenith, "zenith color");
  assertColor(sky.horizon, "horizon color");
  assertColor(sky.ground, "ground color");

  if (!sky.sun || typeof sky.sun !== "object") {
    throw new EnvironmentError("procedural sky sun descriptor is missing");
  }
  assertColor(sky.sun.color, "sun color");
  const sunIntensity = sky.sun.intensity ?? 1;
  assertIntensity(sunIntensity, "sun intensity");

  const [dx, dy, dz] = sky.sun.direction;
  if (![dx, dy, dz].every((value) => Number.isFinite(value))) {
    throw new EnvironmentError("sun direction must be three finite values");
  }
  const length = Math.hypot(dx, dy, dz);
  if (length === 0) {
    throw new EnvironmentError("sun direction must be a non-zero vector");
  }
  const sunDirection: Vec3 = [dx / length, dy / length, dz / length];

  const sunAngularRadius = sky.sun.angularRadius;
  if (
    !Number.isFinite(sunAngularRadius) ||
    sunAngularRadius <= 0 ||
    sunAngularRadius >= Math.PI / 2
  ) {
    throw new EnvironmentError(
      `sun angular radius ${sunAngularRadius} must be in (0, PI / 2)`
    );
  }

  return {
    width,
    height,
    intensity,
    zenith: sky.zenith,
    horizon: sky.horizon,
    ground: sky.ground,
    sunDirection,
    sunColor: sky.sun.color,
    sunIntensity,
    sunAngularRadius
  };
}

function mix(a: Vec3, b: Vec3, t: number): Vec3 {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Generate bottom-up linear RGBA equirectangular sky data. Row 0 is the south
 * pole (v = 0) and the last row is the north pole (v = 1), matching the bake
 * skybox and the existing HDRI environment contract.
 */
function resolveSunVariant(
  resolved: ResolvedProceduralSky,
  variant: ProceduralSunVariant | undefined
): { angularRadius: number; softness: number; intensity: number } {
  if (!variant) {
    return {
      angularRadius: resolved.sunAngularRadius,
      softness: resolved.sunAngularRadius * 0.5,
      intensity: 1
    };
  }

  const radius = variant.angularRadius;
  if (!Number.isFinite(radius) || radius <= 0 || radius >= Math.PI / 2) {
    throw new EnvironmentError(
      `bake sun angular radius ${radius} must be in (0, PI / 2)`
    );
  }
  const softness = variant.softness ?? radius * 0.5;
  if (!Number.isFinite(softness) || softness <= 0 || softness >= radius) {
    throw new EnvironmentError(
      `bake sun softness ${softness} must be in (0, ${radius})`
    );
  }
  const intensity = variant.intensity ?? 1;
  if (!Number.isFinite(intensity) || intensity < 0) {
    throw new EnvironmentError(
      `bake sun intensity ${intensity} must be finite and non-negative`
    );
  }
  return { angularRadius: radius, softness, intensity };
}

export function generateProceduralSky(
  sky: ProceduralSky,
  sunVariant?: ProceduralSunVariant
): EnvironmentInput {
  const resolved = resolveProceduralSky(sky);
  const { width, height } = resolved;
  const data = new Float32Array(width * height * 4);
  const sun = resolveSunVariant(resolved, sunVariant);

  const cosOuter = Math.cos(sun.angularRadius);
  const cosInner = Math.cos(sun.angularRadius - sun.softness);

  for (let y = 0; y < height; y += 1) {
    const v = (y + 0.5) / height;
    const elevation = v * Math.PI - Math.PI / 2;
    const cosElevation = Math.cos(elevation);
    const sinElevation = Math.sin(elevation);

    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5) / width;
      const azimuth = u * Math.PI * 2 - Math.PI;
      const directionX = cosElevation * Math.cos(azimuth);
      const directionY = sinElevation;
      const directionZ = cosElevation * Math.sin(azimuth);

      const gradient =
        directionY >= 0
          ? mix(resolved.horizon, resolved.zenith, smoothstep(0, 1, directionY))
          : mix(resolved.horizon, resolved.ground, smoothstep(0, 1, -directionY));

      const cosAngle =
        directionX * resolved.sunDirection[0] +
        directionY * resolved.sunDirection[1] +
        directionZ * resolved.sunDirection[2];
      const disk =
        smoothstep(cosOuter, cosInner, cosAngle) *
        resolved.sunIntensity *
        sun.intensity;

      const offset = (y * width + x) * 4;
      data[offset] = gradient[0] + resolved.sunColor[0] * disk;
      data[offset + 1] = gradient[1] + resolved.sunColor[1] * disk;
      data[offset + 2] = gradient[2] + resolved.sunColor[2] * disk;
      data[offset + 3] = 1;
    }
  }

  const environment: EnvironmentInput = {
    width,
    height,
    data,
    intensity: resolved.intensity
  };
  validateEnvironment(environment);
  return environment;
}

/**
 * Generate the display sky and, when requested, a bake-only copy with a larger
 * and softer sun lobe. The display texture always uses the unmodified sky.
 */
export function createProceduralSkyEnvironment(
  sky: ProceduralSky,
  context: FloatLinearQuery | null = null,
  bakeSun?: ProceduralSunVariant
): LoadedEnvironment {
  const displayEnvironment = generateProceduralSky(sky);
  const environment = bakeSun
    ? generateProceduralSky(sky, bakeSun)
    : displayEnvironment;
  return {
    environment,
    display: displayEnvironment,
    texture: createEnvironmentTexture(displayEnvironment, context)
  };
}
