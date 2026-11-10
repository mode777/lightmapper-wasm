/** Minimum number of hemicube texels an outdoor sun should cover. */
export const MIN_OUTDOOR_SUN_TEXELS = 6;

/** Angular size of one hemicube texel in radians (90-degree face). */
export function hemisphereTexelAngle(hemisphereSize: number): number {
  if (!Number.isFinite(hemisphereSize) || hemisphereSize <= 0) {
    throw new Error(`hemisphere size ${hemisphereSize} must be positive`);
  }
  return Math.PI / 2 / hemisphereSize;
}

/**
 * Number of hemicube texels covered by a feature of the given angular
 * diameter. Both the diameter and the returned texel count are angular
 * measures; the diameter is in radians.
 */
export function sunTexels(
  angularDiameterRadians: number,
  hemisphereSize: number
): number {
  if (!Number.isFinite(angularDiameterRadians) || angularDiameterRadians <= 0) {
    throw new Error(`sun angular diameter ${angularDiameterRadians} must be positive`);
  }
  return angularDiameterRadians / hemisphereTexelAngle(hemisphereSize);
}

/**
 * Enforce the outdoor sampling budget. Throws with the computed texel count so
 * a scene that is too aggressive about its sun size fails loudly.
 */
export function assertSunSamplingBudget(
  angularDiameterRadians: number,
  hemisphereSize: number,
  label: string,
  minimum = MIN_OUTDOOR_SUN_TEXELS
): number {
  const texels = sunTexels(angularDiameterRadians, hemisphereSize);
  if (texels < minimum) {
    throw new Error(
      `${label}: sun covers ${texels.toFixed(2)} hemicube texels at H${hemisphereSize}; minimum is ${minimum}`
    );
  }
  return texels;
}
