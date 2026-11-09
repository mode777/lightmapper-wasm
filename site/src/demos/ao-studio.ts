import {
  createBox,
  createCylinder,
  createPlane,
  createQuad,
  createSphere,
  createTorus,
  makeMesh,
  transformMesh,
  type TransformOptions
} from "./geometry";
import type { GeometryData } from "./geometry";
import type { SceneDefinition, SceneMesh, Vec3 } from "./types";

function lit(name: string, geometry: GeometryData, albedo: Vec3, transform: TransformOptions): SceneMesh {
  return transformMesh(makeMesh(name, "lit", geometry, { albedo }), transform);
}

export const aoStudio: SceneDefinition = {
  meta: {
    id: "ao-studio",
    title: "AO Studio",
    description:
      "An ambient-only studio bake. With no emitters, every shadow and gradient comes from visibility to the white ambient sky.",
    features: ["Ambient-only", "Contact shadows", "No emitters", "Single bounce"],
    sections: ["ambient"],
    background: [0.015, 0.02, 0.03],
    camera: { position: [6.2, 4.3, 7.6], target: [0, 1.15, 0], fov: 42 }
  },
  bake: {
    atlasSize: 512,
    hemisphereSize: 64,
    bounces: 1,
    ambient: [0.58, 0.61, 0.7],
    zNear: 0.01,
    zFar: 40,
    dilationPasses: 8
  },
  build(): SceneMesh[] {
    return [
      lit("floor", createPlane(7.6, 7.6), [0.7, 0.7, 0.69], {}),
      lit(
        "back wall",
        createQuad(7.6, 4.4),
        [0.68, 0.69, 0.71],
        { position: [0, 2.2, -3.5] }
      ),
      lit(
        "left wall",
        createQuad(7, 4.4),
        [0.66, 0.68, 0.72],
        { position: [-3.5, 2.2, 0], rotation: [0, Math.PI / 2, 0] }
      ),
      lit(
        "sphere",
        createSphere(0.75, 24, 16),
        [0.86, 0.84, 0.8],
        { position: [-1.05, 0.75, 0.25] }
      ),
      lit("box", createBox(1.15, 1.15, 1.15), [0.84, 0.82, 0.79], {
        position: [1.1, 0.575, 0.6],
        rotation: [0, 0.35, 0]
      }),
      lit("cylinder", createCylinder(0.42, 1.55, 24), [0.8, 0.81, 0.84], {
        position: [0.05, 0.775, 1.35]
      }),
      lit(
        "torus",
        createTorus(0.52, 0.16, 32, 12),
        [0.83, 0.8, 0.76],
        { position: [0.9, 0.68, -1.55], rotation: [Math.PI / 2, 0, 0.25] }
      )
    ];
  }
};
