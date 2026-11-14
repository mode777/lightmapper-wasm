import type { BakeInput, EnvironmentInput } from "lightmap-studio";

export type SceneSection = "ambient" | "environment" | "gi" | "emissive" | "multi-object";

export type Vec3 = [number, number, number];

/** Site-local asset descriptor; the studio receives the decoded environment. */
export interface HdrSceneEnvironment {
  kind: "hdr";
  /** Vite-resolved local `.hdr` URL. */
  url: string;
  /** Linear radiance multiplier used by the bake and the display background. */
  intensity: number;
}

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
  /** Optional checked-in HDRI that lights the bake and the display background. */
  environment?: HdrSceneEnvironment;
  build(): SceneMesh[];
  /** The scene as a `lightmap-studio` bake input. */
  bake(environment?: EnvironmentInput): BakeInput;
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
