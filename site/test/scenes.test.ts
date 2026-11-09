import { describe, expect, it } from "vitest";
import { SCENARIOS, validateScene } from "../src/demos";
import { hdriOutdoor } from "../src/demos/hdri-outdoor";
import { hdriStudio } from "../src/demos/hdri-studio";
import { sunSkyOutdoor } from "../src/demos/sun-sky-outdoor";
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
    const studioEnvironment = hdriStudio.bake.environment;
    expect(studioEnvironment?.kind).toBe("hdr");
    if (studioEnvironment?.kind !== "hdr") throw new Error("hdri-studio needs an HDRI environment");
    expect(studioEnvironment.url).toContain("studio_small_09_1k.hdr");
    expect(studioEnvironment.intensity).toBeGreaterThan(0);
  });

  it("keeps hdri-outdoor environment-only with black ambient and no emitters", () => {
    const result = validateScene(hdriOutdoor);
    expect(result.litCount).toBeGreaterThan(0);
    expect(result.emissiveCount).toBe(0);
    expect(hdriOutdoor.bake.ambient).toEqual([0, 0, 0]);
    expect(hdriOutdoor.meta.sections).toEqual(["environment"]);
    const outdoorEnvironment = hdriOutdoor.bake.environment;
    expect(outdoorEnvironment?.kind).toBe("hdr");
    if (outdoorEnvironment?.kind !== "hdr") {
      throw new Error("hdri-outdoor needs an HDRI environment");
    }
    expect(outdoorEnvironment.url).toContain("kloofendal_48d_partly_cloudy_1k.hdr");
    expect(outdoorEnvironment.intensity).toBeGreaterThan(0);
  });

  it("keeps sun-sky-outdoor procedural, directional and emitter-free", () => {
    const result = validateScene(sunSkyOutdoor);
    expect(result.litCount).toBeGreaterThan(0);
    expect(result.emissiveCount).toBe(0);
    expect(sunSkyOutdoor.bake.ambient).toEqual([0, 0, 0]);
    expect(sunSkyOutdoor.meta.sections).toEqual(["environment"]);

    const environment = sunSkyOutdoor.bake.environment;
    expect(environment?.kind).toBe("sky");
    if (environment?.kind !== "sky") {
      throw new Error("sun-sky-outdoor needs a procedural sky environment");
    }
    expect("url" in environment).toBe(false);
    expect(environment.sun.direction.every(Number.isFinite)).toBe(true);
    expect(Math.hypot(...environment.sun.direction)).toBeGreaterThan(0);
    expect(environment.sun.color.every(Number.isFinite)).toBe(true);
    expect(environment.sun.angularRadius).toBeGreaterThan(0);
    expect(environment.sun.angularRadius).toBeLessThan(Math.PI / 2);
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
