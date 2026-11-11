import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createStudio,
  normalizeAtlasUv,
  UV_MAX,
  type MeshInput,
  type Studio,
  type UnwrappedObject
} from "lightmap-studio";
import { SCENARIOS } from "../src/demos";
import { tabletopAtlas } from "../src/demos/tabletop-atlas";
import type { SceneDefinition } from "../src/demos/types";

let studio: Studio;

function litInputs(scenario: SceneDefinition): MeshInput[] {
  return scenario
    .build()
    .filter((mesh) => mesh.kind === "lit")
    .map((mesh) => ({
      name: mesh.name,
      positions: mesh.positions,
      normals: mesh.normals!,
      indices: mesh.indices,
      albedo: mesh.albedo
    }));
}

function unwrapScenario(scenario: SceneDefinition) {
  return studio.unwrap(litInputs(scenario), { size: scenario.bake.atlasSize });
}

function expectSafeUvs(object: UnwrappedObject): void {
  const { uvs, indices } = object;
  for (let i = 0; i < uvs.length; i += 1) {
    expect(Number.isFinite(uvs[i])).toBe(true);
    expect(uvs[i]).toBeGreaterThanOrEqual(0);
    expect(uvs[i]).toBeLessThan(1);
  }
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 2;
    const b = indices[i + 1] * 2;
    const c = indices[i + 2] * 2;
    const area = Math.abs(
      (uvs[b] - uvs[a]) * (uvs[c + 1] - uvs[a + 1]) -
        (uvs[c] - uvs[a]) * (uvs[b + 1] - uvs[a + 1])
    ) * 0.5;
    expect(area).toBeGreaterThan(0);
  }
}

beforeAll(async () => {
  studio = await createStudio();
});

afterAll(() => {
  studio.dispose();
});

describe("xatlas unwrap pipeline", () => {
  for (const scenario of SCENARIOS) {
    it(`unwraps ${scenario.meta.id} into a non-empty shared atlas`, async () => {
      const result = await unwrapScenario(scenario);
      expect(result.litObjects.length).toBeGreaterThan(0);
      expect(result.atlas.width).toBeGreaterThan(0);
      expect(result.atlas.height).toBeGreaterThan(0);
      expect(result.atlas.chartCount).toBeGreaterThan(0);
      expect(result.atlas.utilization).toBeGreaterThan(0);
      expect(result.atlas.utilization).toBeLessThanOrEqual(1);

      let chartTotal = 0;
      for (const object of result.litObjects) {
        expect(object.positions.length % 3).toBe(0);
        expect(object.normals.length).toBe(object.positions.length);
        expect(object.uvs.length).toBe((object.positions.length / 3) * 2);
        expect(object.indices.length % 3).toBe(0);
        expect(object.indices.length).toBeGreaterThan(0);
        expect(object.triangleCount).toBe(object.indices.length / 3);
        expect(object.chartCount).toBeGreaterThan(0);
        chartTotal += object.chartCount;
        for (const value of object.positions) expect(Number.isFinite(value)).toBe(true);
        for (const value of object.normals) expect(Number.isFinite(value)).toBe(true);
        expectSafeUvs(object);
      }
      expect(chartTotal).toBe(result.atlas.chartCount);
    });
  }

  it("keeps one output mesh per lit input mesh", async () => {
    const inputLit = tabletopAtlas.build().filter((mesh) => mesh.kind === "lit");
    const result = await unwrapScenario(tabletopAtlas);
    expect(result.litObjects.length).toBe(inputLit.length);
    expect(result.litObjects.length).toBeGreaterThanOrEqual(4);
    for (const object of result.litObjects) expect(object.triangleCount).toBeGreaterThan(0);
  });

  it("does not put emitters in the atlas", async () => {
    const inputEmissive = tabletopAtlas.build().filter((mesh) => mesh.kind === "emissive");
    const result = await unwrapScenario(tabletopAtlas);
    expect(inputEmissive.length).toBeGreaterThan(0);
    expect(result.emissiveObjects.length).toBe(0);
    expect(result.litObjects.length).toBe(
      tabletopAtlas.build().filter((mesh) => mesh.kind === "lit").length
    );
  });
});

describe("[0, 1) UV clamp", () => {
  it("clamps an exact atlas-edge texel below 1.0", () => {
    expect(normalizeAtlasUv(512, 512)).toBe(UV_MAX);
    expect(normalizeAtlasUv(512, 512)).toBeLessThan(1);
    expect(normalizeAtlasUv(0, 512)).toBe(0);
    expect(normalizeAtlasUv(256, 512)).toBe(0.5);
  });

  it("proves an unclamped edge would wrap to 0.0", () => {
    const unclamped = (texel: number, size: number): number => texel / size;
    expect(unclamped(512, 512)).toBe(1);
    expect(1 % 1).toBe(0);
    expect(normalizeAtlasUv(512, 512)).not.toBe(unclamped(512, 512));
  });

  it("rejects coordinates outside the atlas and non-finite input", () => {
    expect(() => normalizeAtlasUv(-1, 512)).toThrow(/outside/);
    expect(() => normalizeAtlasUv(513, 512)).toThrow(/outside/);
    expect(() => normalizeAtlasUv(Number.NaN, 512)).toThrow(/non-finite/);
    expect(() => normalizeAtlasUv(0, 0)).toThrow(/invalid atlas size/);
  });
});
