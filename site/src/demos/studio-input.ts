import type { EmissiveMeshInput, MeshInput } from "lightmap-studio";
import type { SceneMesh } from "./types";

/** Split the scene's meshes into the studio's lit and emissive inputs. */
export function toStudioScene(meshes: SceneMesh[]): {
  meshes: MeshInput[];
  emitters: EmissiveMeshInput[];
} {
  const lit: MeshInput[] = [];
  const emitters: EmissiveMeshInput[] = [];
  for (const mesh of meshes) {
    if (mesh.kind === "lit") lit.push(toMeshInput(mesh));
    else emitters.push(toEmissiveInput(mesh));
  }
  return { meshes: lit, emitters };
}

function toMeshInput(mesh: SceneMesh): MeshInput {
  if (!mesh.normals) throw new Error(`${mesh.name}: lit mesh needs normals`);
  return {
    name: mesh.name,
    positions: mesh.positions,
    normals: mesh.normals,
    indices: mesh.indices,
    albedo: mesh.albedo
  };
}

function toEmissiveInput(mesh: SceneMesh): EmissiveMeshInput {
  return {
    name: mesh.name,
    positions: mesh.positions,
    normals: mesh.normals ?? new Float32Array(mesh.positions.length),
    indices: mesh.indices,
    emissive: mesh.emissive ?? [1, 1, 1]
  };
}
