import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SCENARIOS } from "../src/demos";
import { SCENE_SOURCES } from "../src/demos/sources";

const SOURCE_DIR = new URL("../src/demos/", import.meta.url);

describe("raw scene sources", () => {
  for (const scenario of SCENARIOS) {
    it(`serves the exact module source for ${scenario.meta.id}`, () => {
      const file = new URL(`${scenario.meta.id}.ts`, SOURCE_DIR);
      const onDisk = readFileSync(file, "utf8");
      expect(SCENE_SOURCES[scenario.meta.id]).toBe(onDisk);
    });
  }
});
