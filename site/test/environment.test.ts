import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { environmentIntensity, validateBakeEnvironment } from "../src/bake/environment";
import type { BakeEnvironment } from "../src/bake/types";
import { rayDirectionForNdc } from "../src/bake/environment";
import {
  createEnvironmentTexture,
  flipRowsBottomUp,
  loadHdrEnvironment,
  prefilterEnvironment
} from "../src/environment/hdr";

const HDRI_PATH = fileURLToPath(
  new URL("../src/assets/environments/studio_small_09_1k.hdr", import.meta.url)
);

function environment(overrides: Partial<BakeEnvironment> = {}): BakeEnvironment {
  return {
    width: 2,
    height: 1,
    data: new Float32Array([1, 0.5, 0.25, 1, 0, 0.5, 1, 1]),
    intensity: 1,
    ...overrides
  };
}

describe("bake environment validation", () => {
  it("accepts a finite non-negative RGBA equirectangular environment", () => {
    expect(() => validateBakeEnvironment(environment())).not.toThrow();
    expect(() => validateBakeEnvironment(undefined)).not.toThrow();
    expect(environmentIntensity(environment())).toBe(1);
    expect(environmentIntensity(environment({ intensity: undefined }))).toBe(1);
  });

  it("rejects non-positive or non-integer dimensions", () => {
    expect(() => validateBakeEnvironment(environment({ width: 0 }))).toThrow(/environment width 0/);
    expect(() => validateBakeEnvironment(environment({ height: 1.5 }))).toThrow(
      /environment height 1.5/
    );
  });

  it("rejects a data length that does not match width * height * 4", () => {
    expect(() => validateBakeEnvironment(environment({ data: new Float32Array(4) }))).toThrow(
      /environment data length 4 does not match 2x1x4 = 8/
    );
  });

  it("rejects non-finite and negative radiance", () => {
    const nonFinite = environment();
    nonFinite.data[3] = Number.NaN;
    expect(() => validateBakeEnvironment(nonFinite)).toThrow(
      /environment data at index 3 is not finite/
    );

    const negative = environment();
    negative.data[1] = -0.25;
    expect(() => validateBakeEnvironment(negative)).toThrow(
      /environment data at index 1 is negative/
    );
  });

  it("rejects an invalid intensity", () => {
    expect(() => validateBakeEnvironment(environment({ intensity: Number.POSITIVE_INFINITY }))).toThrow(
      /environment intensity Infinity/
    );
    expect(() => validateBakeEnvironment(environment({ intensity: -1 }))).toThrow(
      /environment intensity -1/
    );
  });
});

describe("environment rays", () => {
  // Rows: side = +X, up = +Y, backward = -Z (camera looks along +Z).
  const view = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, -1, 0,
    0, 0, 0, 1
  ]);
  const projection = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, -1, -1,
    0, 0, -2, 0
  ]);

  it("maps the NDC center to the hemisphere normal", () => {
    const [x, y, z] = rayDirectionForNdc(0, 0, view, projection);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
    expect(z).toBeCloseTo(1);
  });

  it("maps NDC top to +Y and NDC bottom to -Y", () => {
    expect(rayDirectionForNdc(0, 1, view, projection)[1]).toBeGreaterThan(0);
    expect(rayDirectionForNdc(0, -1, view, projection)[1]).toBeLessThan(0);
  });
});

describe("checked-in HDRI", () => {
  it("is the expected 1k Radiance file", () => {
    const bytes = readFileSync(HDRI_PATH);
    expect(bytes.byteLength).toBe(1_615_248);
    expect(createHash("md5").update(bytes).digest("hex")).toBe(
      "d5d7eb9d26d341d6aa4d11c1a54fd97c"
    );
    const header = bytes.subarray(0, 2048).toString("latin1");
    expect(header).toContain("#?RADIANCE");
    expect(header).toContain("FORMAT=32-bit_rle_rgbe");
    expect(header).toMatch(/-Y\s+512\s+\+X\s+1024/);
  });

  it("flips Radiance top-down rows into the bottom-up runtime convention", () => {
    const top = [1, 1, 1, 1];
    const bottom = [2, 2, 2, 2];
    const flipped = flipRowsBottomUp(new Float32Array([...top, ...bottom]), 1, 2);
    expect([...flipped]).toEqual([...bottom, ...top]);
  });

  it("rejects a row flip when the data length does not match the dimensions", () => {
    expect(() => flipRowsBottomUp(new Float32Array(4), 1, 2)).toThrow(
      /HDRI data length 4 does not match 1x2x4/
    );
  });

  it("builds a lower-resolution, bottom-up irradiance copy for the bake", () => {
    const data = new Float32Array([
      // bottom row: south pole
      2, 2, 2, 1, 2, 2, 2, 1,
      4, 4, 4, 1, 4, 4, 4, 1,
      // top row: north pole
      0, 0, 0, 1, 0, 0, 0, 1,
      1, 1, 1, 1, 1, 1, 1, 1
    ]);
    const filtered = prefilterEnvironment(data, 4, 2, 2, 1);
    expect(filtered.width).toBe(2);
    expect(filtered.height).toBe(1);
    expect(filtered.data.length).toBe(2 * 1 * 4);
    expect(filtered.intensity).toBe(1);
    // Both source rows contribute to the 1-row box filter, and the horizontal
    // blur wraps the two target texels together.
    expect(filtered.data[0]).toBeCloseTo(1.75);
    expect(filtered.data[4]).toBeCloseTo(1.75);
  });

  it("builds a linear equirectangular DataTexture from the shared data", () => {
    const env = environment();
    const texture = createEnvironmentTexture(env);
    expect(texture.image.width).toBe(2);
    expect(texture.image.height).toBe(1);
    expect(texture.image.data).toBe(env.data);
    expect(texture.mapping).toBe(THREE.EquirectangularReflectionMapping);
    expect(texture.colorSpace).toBe(THREE.LinearSRGBColorSpace);
    expect(texture.flipY).toBe(false);
    expect(texture.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(texture.wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect(texture.minFilter).toBe(THREE.NearestFilter);
    expect(texture.magFilter).toBe(THREE.NearestFilter);
    expect(texture.version).toBeGreaterThan(0);
    texture.dispose();

    const linear = createEnvironmentTexture(env, { getExtension: () => ({}) });
    expect(linear.minFilter).toBe(THREE.LinearFilter);
    expect(linear.magFilter).toBe(THREE.LinearFilter);
    linear.dispose();
  });

  it("reports a clear error for an undecodable HDRI URL", async () => {
    await expect(loadHdrEnvironment("file:///definitely-missing.hdr")).rejects.toThrow(
      /HDRI could not be decoded/
    );
  });
});
