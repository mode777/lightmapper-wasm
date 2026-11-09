import type { SceneMesh, Vec3 } from "../demos/types";

export interface AtlasMetadata {
  width: number;
  height: number;
  chartCount: number;
  /** Normalized atlas texel utilization in [0, 1]. */
  utilization: number;
}

export interface UnwrappedObject {
  name: string;
  positions: Float32Array;
  normals: Float32Array;
  /** Normalized lightmap UVs in [0, 1). */
  uvs: Float32Array;
  indices: Uint32Array;
  /** Chart index for each output vertex. */
  charts: Uint32Array;
  albedo: Vec3;
  triangleCount: number;
  chartCount: number;
}

export interface UnwrappedScene {
  litObjects: UnwrappedObject[];
  emissiveObjects: SceneMesh[];
  atlas: AtlasMetadata;
}

export interface AtlasStats {
  litObjectCount: number;
  emissiveObjectCount: number;
  vertexCount: number;
  triangleCount: number;
  chartCount: number;
}

export function computeAtlasStats(scene: UnwrappedScene): AtlasStats {
  let vertexCount = 0;
  let triangleCount = 0;
  for (const object of scene.litObjects) {
    vertexCount += object.positions.length / 3;
    triangleCount += object.triangleCount;
  }
  return {
    litObjectCount: scene.litObjects.length,
    emissiveObjectCount: scene.emissiveObjects.length,
    vertexCount,
    triangleCount,
    chartCount: scene.atlas.chartCount
  };
}
