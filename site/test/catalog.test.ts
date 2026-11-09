import { describe, expect, it } from "vitest";
import { SCENARIOS, scenarioById } from "../src/demos";
import { EXPECTED_SCENARIO_IDS, sectionCoverage } from "../src/demos/coverage";
import { SECTIONS, isSceneSection } from "../src/demos/sections";
import { SCENE_SOURCES } from "../src/demos/sources";

describe("scenario catalog", () => {
  it("has unique kebab-case ids in the expected order", () => {
    const ids = SCENARIOS.map((scenario) => scenario.meta.id);
    expect(ids).toEqual([...EXPECTED_SCENARIO_IDS]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    for (const id of ids) expect(scenarioById(id)?.meta.id).toBe(id);
  });

  it("has non-empty metadata and valid technique sections", () => {
    for (const scenario of SCENARIOS) {
      expect(scenario.meta.title.trim().length).toBeGreaterThan(0);
      expect(scenario.meta.description.trim().length).toBeGreaterThan(0);
      expect(scenario.meta.features.length).toBeGreaterThan(0);
      expect(scenario.meta.sections.length).toBeGreaterThan(0);
      for (const section of scenario.meta.sections) expect(isSceneSection(section)).toBe(true);
      if (scenario.meta.camera) {
        expect(scenario.meta.camera.position).toHaveLength(3);
        expect(scenario.meta.camera.target).toHaveLength(3);
        expect(scenario.meta.camera.position.every(Number.isFinite)).toBe(true);
        expect(scenario.meta.camera.target.every(Number.isFinite)).toBe(true);
      }
    }
  });

  it("covers every technique section and exposes it in the filter list", () => {
    const coverage = sectionCoverage(SCENARIOS);
    for (const section of SECTIONS) {
      expect(coverage[section.id]).toBeGreaterThan(0);
    }
    expect(SECTIONS.map((section) => section.id)).toEqual([
      "ambient",
      "environment",
      "gi",
      "emissive",
      "multi-object"
    ]);
  });

  it("has an exact raw source entry for every scenario", () => {
    for (const scenario of SCENARIOS) {
      const source = SCENE_SOURCES[scenario.meta.id];
      expect(source).toBeTruthy();
      expect(source).toContain("export const");
      expect(source).toContain("SceneDefinition");
    }
    expect(Object.keys(SCENE_SOURCES).sort()).toEqual([...EXPECTED_SCENARIO_IDS].sort());
  });
});
