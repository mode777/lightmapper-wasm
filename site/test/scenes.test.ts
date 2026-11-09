import { describe, expect, it } from "vitest";
import { SCENARIOS, validateScene } from "../src/demos";
import { hdriStudio } from "../src/demos/hdri-studio";
import { tabletopAtlas } from "../src/demos/tabletop-atlas";
import { validateGeometry } from "../src/demos/geometry";

describe("scene catalog validity", () => {
  for (const scenario of SCENARIOS) {
    it(`builds ${scenario.meta.id} with finite geometry`, () => {
      const result = validateScene(scenario);
      expect(result.meshes.length).toBeGreaterThan(0);
      expect(result.litCount).toBeGreaterThan(0);
      expect(result.triangleCount).toBeGreaterThan(0);

      for (const mesh of result.meshes) {
        expect(mesh.normals).toBeDefined();
        expect(mesh.normals?.length).toBe(mesh.positions.length);
        expect(mesh.indices.length % 3).toBe(0);
      }
    });
  }

  it("packs at least four lit meshes plus an emitter into the tabletop scene", () => {
    const result = validateScene(tabletopAtlas);
    expect(result.litCount).toBeGreaterThanOrEqual(4);
    expect(result.emissiveCount).toBeGreaterThanOrEqual(1);
  });

  it("keeps hdri-studio environment-only with black ambient and no emitters", () => {
    const result = validateScene(hdriStudio);
    expect(result.litCount).toBeGreaterThan(0);
    expect(result.emissiveCount).toBe(0);
    expect(hdriStudio.bake.ambient).toEqual([0, 0, 0]);
    expect(hdriStudio.meta.sections).toEqual(["environment"]);
    expect(hdriStudio.bake.environment?.url).toContain("studio_small_09_1k.hdr");
    expect(hdriStudio.bake.environment?.intensity).toBeGreaterThan(0);
  });

  it("rejects non-finite geometry with the scene and mesh name", () => {
    const broken = {
      ...tabletopAtlas,
      build: () => {
        const meshes = tabletopAtlas.build();
        const positions = new Float32Array(meshes[0].positions);
        positions[0] = Number.NaN;
        return [{ ...meshes[0], positions }, ...meshes.slice(1)];
      }
    };
    expect(() => validateScene(broken)).toThrow(/tabletop-atlas\/floor: non-finite position/);
  });

  it("rejects mixed lit/emissive color contracts", () => {
    const meshes = tabletopAtlas.build();
    const lit = meshes.find((mesh) => mesh.kind === "lit");
    expect(lit).toBeDefined();
    expect(() => validateGeometry({ ...lit!, positions: new Float32Array([1, 2]) }, "bad")).toThrow(
      /xyz triples/
    );
  });
});
