import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { validateBakeEnvironment } from "../src/bake/environment";
import type { BakeEnvironment } from "../src/bake/types";
import {
  createProceduralSkyEnvironment,
  DEFAULT_PROCEDURAL_SKY_HEIGHT,
  DEFAULT_PROCEDURAL_SKY_WIDTH,
  generateProceduralSky,
  type ProceduralSky
} from "../src/environment/sky";

function sky(overrides: Partial<ProceduralSky> = {}): ProceduralSky {
  return {
    width: 16,
    height: 8,
    zenith: [0.1, 0.2, 0.4],
    horizon: [0.5, 0.4, 0.3],
    ground: [0.05, 0.04, 0.03],
    intensity: 1,
    sun: {
      direction: [1, 0, 0],
      color: [8, 6, 4],
      angularRadius: 0.2,
      intensity: 1
    },
    ...overrides
  };
}

function pixel(environment: BakeEnvironment, x: number, y: number): [number, number, number] {
  const offset = (y * environment.width + x) * 4;
  return [
    environment.data[offset],
    environment.data[offset + 1],
    environment.data[offset + 2]
  ];
}

function brightestPixel(environment: BakeEnvironment): { x: number; y: number; value: number } {
  let best = { x: 0, y: 0, value: -1 };
  for (let y = 0; y < environment.height; y += 1) {
    for (let x = 0; x < environment.width; x += 1) {
      const [r, g, b] = pixel(environment, x, y);
      const value = r + g + b;
      if (value > best.value) best = { x, y, value };
    }
  }
  return best;
}

describe("procedural sky generation", () => {
  it("uses the default dimensions and produces the exact RGBA length", () => {
    const environment = generateProceduralSky(sky({ width: undefined, height: undefined }));
    expect(environment.width).toBe(DEFAULT_PROCEDURAL_SKY_WIDTH);
    expect(environment.height).toBe(DEFAULT_PROCEDURAL_SKY_HEIGHT);
    expect(environment.data.length).toBe(
      environment.width * environment.height * 4
    );
    expect(environment.intensity).toBe(1);
    expect(() => validateBakeEnvironment(environment)).not.toThrow();
  });

  it("places the zenith at the top row, the horizon in the middle and the ground at the bottom", () => {
    const environment = generateProceduralSky(
      sky({
        width: 4,
        height: 3,
        zenith: [0, 0, 1],
        horizon: [0, 0, 0],
        ground: [1, 0, 0],
        sun: {
          direction: [0, 1, 0],
          color: [0, 0, 0],
          angularRadius: 0.2
        }
      })
    );
    const top = pixel(environment, 1, 2);
    const middle = pixel(environment, 1, 1);
    const bottom = pixel(environment, 1, 0);

    expect(top[2]).toBeGreaterThan(top[0]);
    expect(bottom[0]).toBeGreaterThan(bottom[2]);
    expect(middle[0]).toBeCloseTo(0);
    expect(middle[1]).toBeCloseTo(0);
    expect(middle[2]).toBeCloseTo(0);
  });

  it("places a bright sun disk at the declared equirectangular direction", () => {
    const environment = generateProceduralSky(
      sky({
        width: 32,
        height: 16,
        zenith: [0, 0, 0],
        horizon: [0, 0, 0],
        ground: [0, 0, 0],
        sun: {
          direction: [1, 0, 0],
          color: [10, 10, 10],
          angularRadius: 0.3
        }
      })
    );
    const brightest = brightestPixel(environment);
    expect(brightest.value).toBeGreaterThan(8);
    expect(brightest.x).toBeGreaterThanOrEqual(15);
    expect(brightest.x).toBeLessThanOrEqual(17);
    expect(brightest.y).toBeGreaterThanOrEqual(7);
    expect(brightest.y).toBeLessThanOrEqual(9);

    const opposite = pixel(environment, 0, 8);
    expect(opposite[0]).toBeLessThan(0.01);
    expect(opposite[1]).toBeLessThan(0.01);
    expect(opposite[2]).toBeLessThan(0.01);
  });

  it("is deterministic and finite with opaque alpha", () => {
    const first = generateProceduralSky(sky());
    const second = generateProceduralSky(sky());
    expect([...first.data]).toEqual([...second.data]);

    for (let i = 0; i < first.data.length; i += 1) {
      expect(Number.isFinite(first.data[i])).toBe(true);
      expect(first.data[i]).toBeGreaterThanOrEqual(0);
      if (i % 4 === 3) expect(first.data[i]).toBe(1);
    }
  });

  it("keeps the sky intensity as a multiplier instead of baking it into the data", () => {
    const single = generateProceduralSky(sky({ intensity: 1 }));
    const double = generateProceduralSky(sky({ intensity: 2 }));
    expect([...single.data]).toEqual([...double.data]);
    expect(double.intensity).toBe(2);
    validateBakeEnvironment(double);
  });

  it("has no external asset URL", () => {
    expect("url" in sky()).toBe(false);
    expect(JSON.stringify(sky())).not.toContain(".hdr");
  });

  it("builds a linear equirectangular display texture from the same data", () => {
    const loaded = createProceduralSkyEnvironment(sky({ width: 8, height: 4 }));
    expect(loaded.environment.width).toBe(8);
    expect(loaded.environment.height).toBe(4);
    expect(loaded.texture.image.width).toBe(8);
    expect(loaded.texture.image.height).toBe(4);
    expect(loaded.texture.image.data).toBe(loaded.environment.data);
    expect(loaded.texture.mapping).toBe(THREE.EquirectangularReflectionMapping);
    expect(loaded.texture.colorSpace).toBe(THREE.LinearSRGBColorSpace);
    expect(loaded.texture.flipY).toBe(false);
    loaded.texture.dispose();
  });
});

describe("procedural sky validation", () => {
  it("rejects invalid dimensions", () => {
    expect(() => generateProceduralSky(sky({ width: 0 }))).toThrow(
      /procedural sky width 0/
    );
    expect(() => generateProceduralSky(sky({ height: 1.5 }))).toThrow(
      /procedural sky height 1.5/
    );
  });

  it("rejects invalid gradient colors", () => {
    expect(() => generateProceduralSky(sky({ zenith: [-1, 0, 0] }))).toThrow(
      /zenith color component 0 is negative/
    );
    expect(() => generateProceduralSky(sky({ horizon: [Number.NaN, 0, 0] }))).toThrow(
      /horizon color component 0 is not finite/
    );
  });

  it("rejects an invalid sky intensity", () => {
    expect(() => generateProceduralSky(sky({ intensity: Number.POSITIVE_INFINITY }))).toThrow(
      /procedural sky intensity Infinity/
    );
    expect(() => generateProceduralSky(sky({ intensity: -1 }))).toThrow(
      /procedural sky intensity -1/
    );
  });

  it("rejects a missing, zero or non-finite sun direction", () => {
    const missing = sky();
    delete (missing as Partial<ProceduralSky>).sun;
    expect(() => generateProceduralSky(missing)).toThrow(/sun descriptor is missing/);

    expect(() =>
      generateProceduralSky(
        sky({
          sun: { direction: [0, 0, 0], color: [1, 1, 1], angularRadius: 0.1 }
        })
      )
    ).toThrow(/sun direction must be a non-zero vector/);

    expect(() =>
      generateProceduralSky(
        sky({
          sun: {
            direction: [Number.NaN, 1, 0],
            color: [1, 1, 1],
            angularRadius: 0.1
          }
        })
      )
    ).toThrow(/sun direction must be three finite values/);
  });

  it("rejects an out-of-range sun angular radius", () => {
    expect(() =>
      generateProceduralSky(
        sky({
          sun: { direction: [1, 0, 0], color: [1, 1, 1], angularRadius: 0 }
        })
      )
    ).toThrow(/sun angular radius 0/);
    expect(() =>
      generateProceduralSky(
        sky({
          sun: {
            direction: [1, 0, 0],
            color: [1, 1, 1],
            angularRadius: Math.PI / 2
          }
        })
      )
    ).toThrow(/sun angular radius/);
  });

  it("rejects invalid sun colors and intensity", () => {
    expect(() =>
      generateProceduralSky(
        sky({
          sun: {
            direction: [1, 0, 0],
            color: [1, -1, 1],
            angularRadius: 0.1
          }
        })
      )
    ).toThrow(/sun color component 1 is negative/);
    expect(() =>
      generateProceduralSky(
        sky({
          sun: {
            direction: [1, 0, 0],
            color: [1, 1, 1],
            angularRadius: 0.1,
            intensity: -1
          }
        })
      )
    ).toThrow(/sun intensity -1/);
  });
});
