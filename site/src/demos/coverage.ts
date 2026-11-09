import type { SceneDefinition, SceneSection } from "./types";

export const PREVIEW_VERSION = 1;

export const THUMBNAIL_SETTINGS = {
  width: 640,
  height: 400,
  dpr: 2,
  format: "webp",
  quality: 90
} as const;

export const THUMBNAIL_DIR = "src/assets/previews";
export const THUMBNAIL_MANIFEST = `${THUMBNAIL_DIR}/manifest.json`;

/** Shared scene modules whose changes invalidate every checked-in thumbnail. */
export const SHARED_SOURCE_FILES = ["geometry.ts", "types.ts", "sections.ts"] as const;

export const EXPECTED_SCENARIO_IDS = [
  "ao-studio",
  "cornell-box",
  "emissive-alcove",
  "tabletop-atlas",
  "hdri-studio",
  "hdri-outdoor",
  "sun-sky-outdoor"
] as const;

export type ExpectedScenarioId = (typeof EXPECTED_SCENARIO_IDS)[number];

export const QUALITY_PRESETS = {
  draft: { hemisphereSize: 32, label: "Draft" },
  standard: { hemisphereSize: 64, label: "Standard" },
  high: { hemisphereSize: 128, label: "High" }
} as const;

export type Quality = keyof typeof QUALITY_PRESETS;

export function isQuality(value: string): value is Quality {
  return value === "draft" || value === "standard" || value === "high";
}

export function sectionCoverage(scenarios: readonly SceneDefinition[]): Record<SceneSection, number> {
  const counts: Record<SceneSection, number> = {
    ambient: 0,
    environment: 0,
    gi: 0,
    emissive: 0,
    "multi-object": 0
  };
  for (const scenario of scenarios) {
    for (const section of scenario.meta.sections) counts[section] += 1;
  }
  return counts;
}
