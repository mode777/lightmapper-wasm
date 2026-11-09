import { aoStudio } from "./ao-studio";
import { cornellBox } from "./cornell-box";
import { emissiveAlcove } from "./emissive-alcove";
import { validateGeometry } from "./geometry";
import { hdriOutdoor } from "./hdri-outdoor";
import { hdriStudio } from "./hdri-studio";
import { tabletopAtlas } from "./tabletop-atlas";
import type { SceneDefinition, SceneMesh } from "./types";

export const SCENARIOS: readonly SceneDefinition[] = [
  aoStudio,
  cornellBox,
  emissiveAlcove,
  tabletopAtlas,
  hdriStudio,
  hdriOutdoor
];

export const SCENARIO_BY_ID: ReadonlyMap<string, SceneDefinition> = new Map(
  SCENARIOS.map((scenario) => [scenario.meta.id, scenario])
);

export function scenarioById(id: string | undefined): SceneDefinition | undefined {
  return id ? SCENARIO_BY_ID.get(id) : undefined;
}

export interface SceneValidation {
  meshes: SceneMesh[];
  litCount: number;
  emissiveCount: number;
  triangleCount: number;
}

export function validateScene(scene: SceneDefinition): SceneValidation {
  const meshes = scene.build();
  if (meshes.length === 0) throw new Error(`${scene.meta.id}: scene builds no meshes`);

  let litCount = 0;
  let emissiveCount = 0;
  let triangleCount = 0;

  for (const mesh of meshes) {
    if (!mesh.name) throw new Error(`${scene.meta.id}: a mesh has no name`);
    validateGeometry(mesh, `${scene.meta.id}/${mesh.name}`);
    triangleCount += mesh.indices.length / 3;

    if (mesh.kind === "lit") {
      litCount += 1;
      if (!mesh.albedo || mesh.albedo.some((value) => !Number.isFinite(value))) {
        throw new Error(`${scene.meta.id}/${mesh.name}: lit mesh needs a finite albedo`);
      }
    } else {
      emissiveCount += 1;
      if (!mesh.emissive || mesh.emissive.some((value) => !Number.isFinite(value))) {
        throw new Error(`${scene.meta.id}/${mesh.name}: emissive mesh needs a finite emissive color`);
      }
    }
  }

  return { meshes, litCount, emissiveCount, triangleCount };
}

export type { SceneDefinition, SceneMesh } from "./types";
