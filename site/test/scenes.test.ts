import { describe, expect, it } from "vitest";
import { SCENARIOS, validateScene } from "../src/demos";
import { hdriOutdoor } from "../src/demos/hdri-outdoor";
import { hdriStudio } from "../src/demos/hdri-studio";
import { sunSkyOutdoor } from "../src/demos/sun-sky-outdoor";
import { tabletopAtlas } from "../src/demos/tabletop-atlas";
import { validateGeometry } from "../src/demos/geometry";
import {
  assertSunSamplingBudget,
  MIN_OUTDOOR_SUN_TEXELS,
  sunTexels
} from "../src/demos/sampling";

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

  it("gives the outdoor scenes a larger, well-sampled bake sun", () => {
    const display = sunSkyOutdoor.bake.environment;
    if (display?.kind !== "sky") throw new Error("sun-sky-outdoor needs a sky");
    const bakeSun = sunSkyOutdoor.bake.environmentBake?.sun;
    expect(bakeSun).toBeDefined();
    if (!bakeSun) throw new Error("sun-sky-outdoor needs a bake sun variant");
    expect(bakeSun.angularRadius).toBeGreaterThan(display.sun.angularRadius);
    expect(bakeSun.softness).toBeGreaterThan(0);
    expect(bakeSun.softness).toBeLessThan(bakeSun.angularRadius);

    const diameter = bakeSun.angularRadius * 2;
    expect(sunTexels(diameter, 64)).toBeGreaterThanOrEqual(MIN_OUTDOOR_SUN_TEXELS);
    assertSunSamplingBudget(diameter, 64, "sun-sky-outdoor");
    assertSunSamplingBudget(diameter, 128, "sun-sky-outdoor/high");
  });

  it("gives the HDRI outdoor scene a wider prefiltered bake feature", () => {
    const radius = hdriOutdoor.bake.environmentBake?.prefilterRadius;
    expect(radius).toBeGreaterThan(2);
    const effectiveDiameter = (radius ?? 2) * 2 * (Math.PI / 64);
    expect(sunTexels(effectiveDiameter, 64)).toBeGreaterThanOrEqual(
      MIN_OUTDOOR_SUN_TEXELS
    );
    assertSunSamplingBudget(effectiveDiameter, 64, "hdri-outdoor");
  });

  it("keeps non-outdoor scenes on the uniform default", () => {
    for (const scenario of SCENARIOS) {
      if (scenario.meta.id === "sun-sky-outdoor" || scenario.meta.id === "hdri-outdoor") {
        continue;
      }
      expect(scenario.bake.hemisphereWeight, scenario.meta.id).toBeUndefined();
      expect(scenario.bake.environmentBake, scenario.meta.id).toBeUndefined();
    }
    expect(hdriStudio.bake.hemisphereWeight).toBeUndefined();
  });

  it("uses the reduced outdoor smoothing presets", () => {
    expect(sunSkyOutdoor.bake.smoothPasses).toBeLessThanOrEqual(4);
    expect(hdriOutdoor.bake.smoothPasses).toBeLessThanOrEqual(4);
    expect(hdriStudio.bake.smoothPasses).toBe(12);
  });

  it("fails the sampling budget with the computed coverage", () => {
    expect(() =>
      assertSunSamplingBudget(0.04, 64, "tiny-sun")
    ).toThrow(/tiny-sun: sun covers .* hemicube texels at H64/);
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
