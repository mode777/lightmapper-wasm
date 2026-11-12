import aoStudioSource from "./ao-studio.ts?raw";
import cornellBoxSource from "./cornell-box.ts?raw";
import emissiveAlcoveSource from "./emissive-alcove.ts?raw";
import hdriDuskSource from "./hdri-dusk.ts?raw";
import hdriOutdoorSource from "./hdri-outdoor.ts?raw";
import hdriStudioSource from "./hdri-studio.ts?raw";
import tabletopAtlasSource from "./tabletop-atlas.ts?raw";

/** Exact scene module source shown by the Code view. */
export const SCENE_SOURCES: Readonly<Record<string, string>> = {
  "ao-studio": aoStudioSource,
  "cornell-box": cornellBoxSource,
  "emissive-alcove": emissiveAlcoveSource,
  "tabletop-atlas": tabletopAtlasSource,
  "hdri-studio": hdriStudioSource,
  "hdri-outdoor": hdriOutdoorSource,
  "hdri-dusk": hdriDuskSource
};

export function sourceFor(id: string): string | undefined {
  return SCENE_SOURCES[id];
}
