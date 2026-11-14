/**
 * Fixed header shown above every scenario's source in the Code view. The scene
 * modules are `lightmap-studio` bake inputs; this is the code that turns one
 * into a lightmap. `site/test/sources.test.ts` fails when the studio renames an
 * identifier used here.
 */
export const USAGE_HEADER = `// This scene is a lightmap-studio bake input.
const studio = await createStudio();
const result = await studio.bake(scene.bake(environment));

// environment: optional decoded linear HDRI via loadEnvironment().

// result.lightmap     Float32Array, RGBA per atlas texel
// result.scene.atlas  width, height, charts, utilization
// result.stats        mean, max, nonBlackRatio`;

/** File name shown in the Code view toolbar. */
export const USAGE_HEADER_FILE = "bake-example.ts";
