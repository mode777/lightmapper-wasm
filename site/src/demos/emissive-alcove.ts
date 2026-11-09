import {
  createBox,
  createCylinder,
  createPlane,
  createQuad,
  createSphere,
  makeMesh,
  transformMesh,
  type TransformOptions
} from "./geometry";
import type { GeometryData } from "./geometry";
import type { SceneDefinition, SceneMesh, Vec3 } from "./types";

function lit(name: string, geometry: GeometryData, albedo: Vec3, transform: TransformOptions): SceneMesh {
  return transformMesh(makeMesh(name, "lit", geometry, { albedo }), transform);
}

function emitter(
  name: string,
  geometry: GeometryData,
  emissive: Vec3,
  transform: TransformOptions
): SceneMesh {
  return transformMesh(makeMesh(name, "emissive", geometry, { emissive }), transform);
}

export const emissiveAlcove: SceneDefinition = {
  meta: {
    id: "emissive-alcove",
    title: "Emissive Alcove",
    description:
      "A dark room lit only by HDR neon bars. Colored emitters wash the walls, pedestal and bench without a single analytic light.",
    features: ["HDR emitters", "Neon bars", "Arbitrary emissive geometry", "2 bounces"],
    sections: ["emissive", "gi"],
    background: [0.004, 0.005, 0.008],
    camera: { position: [4.9, 2.9, 6.6], target: [0, 1.45, -0.7], fov: 44 }
  },
  bake: {
    atlasSize: 512,
    hemisphereSize: 64,
    bounces: 2,
    ambient: [0, 0, 0],
    zNear: 0.01,
    zFar: 40,
    dilationPasses: 10
  },
  build(): SceneMesh[] {
    return [
      lit("floor", createPlane(6, 6), [0.3, 0.3, 0.33], {}),
      lit(
        "back wall",
        createQuad(6, 4),
        [0.22, 0.22, 0.25],
        { position: [0, 2, -2.6] }
      ),
      lit(
        "left wall",
        createQuad(5.2, 4),
        [0.24, 0.24, 0.27],
        { position: [-2.6, 2, 0], rotation: [0, Math.PI / 2, 0] }
      ),
      lit(
        "right wall",
        createQuad(5.2, 4),
        [0.21, 0.21, 0.24],
        { position: [2.6, 2, 0], rotation: [0, -Math.PI / 2, 0] }
      ),
      lit(
        "ceiling",
        createQuad(6, 5.2),
        [0.2, 0.2, 0.22],
        { position: [0, 4, 0], rotation: [Math.PI / 2, 0, 0] }
      ),
      lit("pedestal", createCylinder(0.36, 0.8, 24), [0.62, 0.6, 0.58], {
        position: [0.75, 0.4, 0.25]
      }),
      lit("sphere", createSphere(0.38, 24, 16), [0.75, 0.73, 0.7], {
        position: [0.75, 1.0, 0.25]
      }),
      lit("bench", createBox(1.6, 0.45, 0.7), [0.42, 0.4, 0.38], {
        position: [-1.05, 0.225, 0.75],
        rotation: [0, 0.08, 0]
      }),
      emitter("red neon", createBox(2.4, 0.09, 0.09), [16, 1.2, 0.8], {
        position: [-0.9, 1.2, -2.48]
      }),
      emitter("green neon", createBox(2.2, 0.09, 0.09), [0.8, 14, 2], {
        position: [0.2, 2.2, -2.48]
      }),
      emitter("blue neon", createBox(1.8, 0.09, 0.09), [0.6, 1.4, 18], {
        position: [1.4, 3.1, -2.48]
      }),
      emitter("side neon", createBox(0.09, 2.2, 0.09), [12, 1, 10], {
        position: [-2.48, 2, 0.4]
      })
    ];
  }
};
