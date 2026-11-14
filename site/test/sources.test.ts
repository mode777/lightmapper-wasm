import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createStudio, loadEnvironment, type Studio, type StudioResult } from "lightmap-studio";
import { SCENARIOS } from "../src/demos";
import { USAGE_HEADER } from "../src/demos/example";
import { SCENE_SOURCES, codeFor } from "../src/demos/sources";

const SOURCE_DIR = new URL("../src/demos/", import.meta.url);

describe("raw scene sources", () => {
  for (const scenario of SCENARIOS) {
    it(`serves the exact module source for ${scenario.meta.id}`, () => {
      const file = new URL(`${scenario.meta.id}.ts`, SOURCE_DIR);
      const onDisk = readFileSync(file, "utf8");
      expect(SCENE_SOURCES[scenario.meta.id]).toBe(onDisk);
    });

    it(`renders the usage header above ${scenario.meta.id}`, () => {
      const onDisk = readFileSync(new URL(`${scenario.meta.id}.ts`, SOURCE_DIR), "utf8");
      expect(codeFor(scenario.meta.id)).toBe(`${USAGE_HEADER}\n\n${onDisk}`);
    });
  }

  it("keeps the usage header aligned with the installed studio API", () => {
    expect(typeof createStudio).toBe("function");
    expect(typeof loadEnvironment).toBe("function");
    expectTypeOf<Studio["bake"]>().toBeFunction();
    expectTypeOf<StudioResult["lightmap"]>().toEqualTypeOf<Float32Array>();

    expect(USAGE_HEADER).toContain("createStudio(");
    expect(USAGE_HEADER).toContain(".bake(");
    expect(USAGE_HEADER).toContain("loadEnvironment(");
    expect(USAGE_HEADER).toContain(".lightmap");
    expect(USAGE_HEADER).toContain(".scene.atlas");
  });

  it("returns no code for an unknown scenario", () => {
    expect(codeFor("missing-scene")).toBe("");
  });
});
