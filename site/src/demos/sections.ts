import type { SceneSection } from "./types";

export interface SectionInfo {
  id: SceneSection;
  label: string;
  description: string;
}

export const SECTIONS: readonly SectionInfo[] = [
  {
    id: "ambient",
    label: "Ambient / AO",
    description: "Ambient-only bakes that reveal contact shadows and occlusion."
  },
  {
    id: "gi",
    label: "Global illumination",
    description: "Multi-bounce bakes with color bleeding between surfaces."
  },
  {
    id: "emissive",
    label: "Emissive",
    description: "HDR emitters and colored neon light without analytic lights."
  },
  {
    id: "multi-object",
    label: "Multi-object atlas",
    description: "Several meshes packed into one shared lightmap atlas."
  }
];

const SECTION_IDS = new Set<string>(SECTIONS.map((section) => section.id));

export function isSceneSection(value: string): value is SceneSection {
  return SECTION_IDS.has(value);
}

export function sectionInfo(id: SceneSection): SectionInfo {
  const found = SECTIONS.find((section) => section.id === id);
  if (!found) throw new Error(`showcase: unknown section ${id}`);
  return found;
}
