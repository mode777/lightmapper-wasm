import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  environmentIntensity,
  flipRowsBottomUp,
  prefilterEnvironment,
  rayDirectionForNdc,
  validateBakeEnvironment,
  type EnvironmentInput
} from "lightmap-studio";
import { createEnvironmentTexture, loadHdrEnvironment } from "../src/environment/hdr";

const HDRI_PATH = fileURLToPath(
  new URL("../src/assets/environments/studio_small_09_1k.hdr", import.meta.url)
);
const OUTDOOR_HDRI_PATH = fileURLToPath(
  new URL("../src/assets/environments/kloofendal_48d_partly_cloudy_1k.hdr", import.meta.url)
);

function environment(overrides: Partial<EnvironmentInput> = {}): EnvironmentInput {
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

describe("checked-in HDRIs", () => {
  for (const asset of [
    { path: HDRI_PATH, size: 1_615_248, md5: "d5d7eb9d26d341d6aa4d11c1a54fd97c" },
    {
      path: OUTDOOR_HDRI_PATH,
      size: 1_637_206,
      md5: "ee096fe9e26ce29d8f110b5ba0579011"
    }
  ]) {
    it(`is the expected 1k Radiance file: ${asset.path.split("/").pop()}`, () => {
      const bytes = readFileSync(asset.path);
      expect(bytes.byteLength).toBe(asset.size);
      expect(createHash("md5").update(bytes).digest("hex")).toBe(asset.md5);
      const header = bytes.subarray(0, 2048).toString("latin1");
      expect(header).toContain("#?RADIANCE");
      expect(header).toContain("FORMAT=32-bit_rle_rgbe");
      expect(header).toMatch(/-Y\s+512\s+\+X\s+1024/);
    });
  }

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

  it("supports a wider prefilter radius for outdoor bake copies", () => {
    const width = 9;
    const data = new Float32Array(width * 4);
    for (let x = 0; x < width; x += 1) {
      const value = x === 4 ? 8 : 0;
      data[x * 4] = value;
      data[x * 4 + 1] = value;
      data[x * 4 + 2] = value;
      data[x * 4 + 3] = 1;
    }
    const narrow = prefilterEnvironment(data, width, 1, width, 1, 2);
    const wide = prefilterEnvironment(data, width, 1, width, 1, 3);
    expect(wide.data[(4 + 2) * 4]).toBeGreaterThan(narrow.data[(4 + 2) * 4]);
    expect(() => prefilterEnvironment(data, width, 1, width, 1, 0)).toThrow(
      /prefilter radius 0/
    );
    expect(() => prefilterEnvironment(data, width, 1, width, 1, 5)).toThrow(
      /prefilter radius 5/
    );
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
