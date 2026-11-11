import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SRC_DIR = new URL("../src/", import.meta.url);
const DISPLAY_DIR = new URL("../src/display/", import.meta.url);

function sourceFiles(directory: URL): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = new URL(entry, directory);
    if (statSync(path).isDirectory()) files.push(...sourceFiles(new URL(`${entry}/`, directory)));
    else if (entry.endsWith(".ts")) files.push(path.pathname);
  }
  return files;
}

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g)].map(
    (match) => match[1]
  );
}

function valueImportSpecifiers(source: string): string[] {
  return [...source.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map(
    (match) => match[1]
  );
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("site studio boundary", () => {
  it("no longer contains the unwrap or bake pipeline", () => {
    expect(existsSync(new URL("../src/bake/", import.meta.url))).toBe(false);
    expect(existsSync(new URL("../src/atlas/unwrap.ts", import.meta.url))).toBe(false);
    expect(existsSync(new URL("../src/atlas/types.ts", import.meta.url))).toBe(false);
  });

  it("does not import xatlas or call lightmapper functions", () => {
    for (const file of sourceFiles(SRC_DIR)) {
      const source = readFileSync(file, "utf8");
      const code = stripComments(source);
      expect(importSpecifiers(source), file).not.toContain("xatlas-wasm");
      expect(code, file).not.toMatch(/\blmCreate\s*\(|\blmBegin\s*\(|\blmEnd\s*\(|\blmSetGeometry\s*\(/);
    }
  });
});

describe("display import boundary", () => {
  it("never imports the studio bake entry or calls lightmapper bake functions", () => {
    for (const file of sourceFiles(DISPLAY_DIR)) {
      const source = readFileSync(file, "utf8");
      const code = stripComments(source);
      for (const specifier of valueImportSpecifiers(source)) {
        expect(specifier.includes("lightmap-studio"), `${file} imports ${specifier}`).toBe(false);
        expect(specifier.includes("bake"), `${file} imports ${specifier}`).toBe(false);
      }
      expect(code, file).not.toMatch(/\blmCreate\s*\(|\blmBegin\s*\(|\blmEnd\s*\(|\blmSetGeometry\s*\(/);
    }
  });

  it("fails the boundary check when a bake call is added", () => {
    const mutated = `import { createStudio } from "lightmap-studio";\nlmCreate(64, 0, 1, 0, 0, 0, 2, 0.01);`;
    const specifiers = valueImportSpecifiers(mutated);
    expect(specifiers.some((specifier) => specifier.includes("lightmap-studio"))).toBe(true);
    expect(mutated).toMatch(/\blmCreate\b/);
  });
});
