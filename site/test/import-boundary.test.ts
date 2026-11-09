import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const BAKE_DIR = new URL("../src/bake/", import.meta.url);
const DISPLAY_DIR = new URL("../src/display/", import.meta.url);

function sourceFiles(directory: URL): string[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => new URL(name, directory).pathname);
}

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g)].map(
    (match) => match[1]
  );
}

/** Value imports only; a type-only import of BakeResult does not couple the runtime. */
function valueImportSpecifiers(source: string): string[] {
  return [...source.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map(
    (match) => match[1]
  );
}

function forbiddenHarnessImports(source: string): string[] {
  return importSpecifiers(source).filter(
    (specifier) =>
      specifier === "three" ||
      specifier.startsWith("three/") ||
      specifier === "xatlas-wasm" ||
      specifier.includes("site/") ||
      specifier.startsWith("../")
  );
}

describe("bake harness package shape", () => {
  it("imports only lightmapper-wasm and local bake modules", () => {
    for (const file of sourceFiles(BAKE_DIR)) {
      const source = readFileSync(file, "utf8");
      const specifiers = importSpecifiers(source);
      for (const specifier of specifiers) {
        expect(
          specifier === "lightmapper-wasm" || specifier.startsWith("./"),
          `${file} imports ${specifier}`
        ).toBe(true);
      }
      expect(forbiddenHarnessImports(source), file).toEqual([]);
    }
  });

  it("fails the audit when a forbidden import is added", () => {
    const mutated = `import * as THREE from "three";\nimport createXAtlas from "xatlas-wasm";\n`;
    expect(forbiddenHarnessImports(mutated)).toEqual(["three", "xatlas-wasm"]);
  });
});

describe("display import boundary", () => {
  it("never imports the bake harness or calls lightmapper bake functions", () => {
    for (const file of sourceFiles(DISPLAY_DIR)) {
      const source = readFileSync(file, "utf8");
      for (const specifier of valueImportSpecifiers(source)) {
        expect(specifier.includes("bake"), `${file} imports ${specifier}`).toBe(false);
      }
      expect(source, file).not.toMatch(/\blmCreate\b|\blmBegin\b|\blmEnd\b|\blmSetGeometry\b/);
    }
  });

  it("fails the boundary check when a bake call is added", () => {
    const mutated = `import { createBakeHarness } from "../bake/harness";\nlmCreate(64, 0, 1, 0, 0, 0, 2, 0.01);`;
    const specifiers = valueImportSpecifiers(mutated);
    expect(specifiers.some((specifier) => specifier.includes("bake"))).toBe(true);
    expect(mutated).toMatch(/\blmCreate\b/);
  });
});
