import type { ProceduralSky } from "../environment/sky";

export type SceneSection = "ambient" | "environment" | "gi" | "emissive" | "multi-object";

export type Vec3 = [number, number, number];

export interface HdrSceneEnvironment {
  kind: "hdr";
  /** Vite-resolved local `.hdr` URL. */
  url: string;
  /** Linear radiance multiplier used by the bake and the display background. */
  intensity: number;
}

export type SceneEnvironment =
  | HdrSceneEnvironment
  | ({ kind: "sky" } & ProceduralSky);

export interface SceneCamera {
  position: Vec3;
  target: Vec3;
  fov?: number;
}

export interface SceneMeta {
  id: string;
  title: string;
  description: string;
  features: string[];
  sections: SceneSection[];
  /** Linear background color. Omit for a transparent stage. */
  background?: Vec3;
  camera?: SceneCamera;
}

export interface BakePreset {
  /** Square atlas size in texels. */
  atlasSize: number;
  /** Hemisphere render resolution; must be a power of two. */
  hemisphereSize: number;
  bounces: number;
  /** Linear ambient/sky color passed to lmCreate. */
  ambient: Vec3;
  /** Optional equirectangular HDRI used as the bake skybox and display background. */
  environment?: SceneEnvironment;
  zNear?: number;
  zFar?: number;
  dilationPasses?: number;
  smooth?: boolean;
  /** Number of box-smoothing passes after each bounce; defaults to 1. */
  smoothPasses?: number;
  /** Hierarchical interpolation passes passed to lmCreate (0-8). */
  interpolationPasses?: number;
  /** Absolute radiance error below which lmCreate interpolates. */
  interpolationThreshold?: number;
}

export interface SceneMesh {
  kind: "lit" | "emissive";
  name: string;
  positions: Float32Array;
  indices: Uint32Array;
  normals?: Float32Array;
  /** Linear albedo for lit meshes. */
  albedo?: Vec3;
  /** Linear HDR emissive color for emissive meshes. */
  emissive?: Vec3;
}

export interface SceneDefinition {
  meta: SceneMeta;
  bake: BakePreset;
  build(): SceneMesh[];
}

export function isLitMesh(mesh: SceneMesh): boolean {
  return mesh.kind === "lit";
}

export function assertFiniteArray(values: ArrayLike<number>, label: string): void {
  for (let i = 0; i < values.length; i += 1) {
    if (!Number.isFinite(values[i])) {
      throw new Error(`${label}: non-finite value at index ${i}: ${values[i]}`);
    }
  }
}
