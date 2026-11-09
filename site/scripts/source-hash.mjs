// Stable thumbnail source hash shared by the capture script and the tests.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SITE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEMOS_DIR = join(SITE_ROOT, "src", "demos");

export const SHARED_FILES = ["geometry.ts", "types.ts", "sections.ts"];

/** Extra rendered inputs, keyed by scenario id, relative to the site root. */
const ENVIRONMENT_FILES = {
  "hdri-studio": ["src/assets/environments/studio_small_09_1k.hdr"],
  "hdri-outdoor": ["src/assets/environments/kloofendal_48d_partly_cloudy_1k.hdr"],
  "sun-sky-outdoor": ["src/environment/sky.ts"]
};

export function sourceFilesFor(id) {
  return [`${id}.ts`, ...SHARED_FILES, ...(ENVIRONMENT_FILES[id] ?? [])];
}

export function sourceHash(id) {
  const hash = createHash("sha256");
  for (const file of sourceFilesFor(id)) {
    hash.update(file);
    hash.update("\0");
    const path = file.startsWith("src/") ? join(SITE_ROOT, file) : join(DEMOS_DIR, file);
    hash.update(readFileSync(path));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function readPreviewVersion() {
  const source = readFileSync(join(DEMOS_DIR, "coverage.ts"), "utf8");
  const match = source.match(/export const PREVIEW_VERSION\s*=\s*(\d+)\s*;/);
  if (!match) throw new Error("could not read PREVIEW_VERSION from src/demos/coverage.ts");
  return Number(match[1]);
}

export function readScenarioIds() {
  const source = readFileSync(join(DEMOS_DIR, "coverage.ts"), "utf8");
  const match = source.match(/EXPECTED_SCENARIO_IDS\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!match) throw new Error("could not read EXPECTED_SCENARIO_IDS from src/demos/coverage.ts");
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

export function readThumbnailSettings() {
  const source = readFileSync(join(DEMOS_DIR, "coverage.ts"), "utf8");
  const width = Number(source.match(/width:\s*(\d+)/)?.[1]);
  const height = Number(source.match(/height:\s*(\d+)/)?.[1]);
  const dpr = Number(source.match(/dpr:\s*(\d+)/)?.[1]);
  const quality = Number(source.match(/quality:\s*(\d+)/)?.[1]);
  if (!width || !height || !dpr || !quality) {
    throw new Error("could not read THUMBNAIL_SETTINGS from src/demos/coverage.ts");
  }
  return { width, height, dpr, quality };
}
