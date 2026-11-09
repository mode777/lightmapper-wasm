import {
  createBox,
  createPlane,
  createQuad,
  makeMesh,
  transformMesh,
  type TransformOptions
} from "./geometry";
import type { GeometryData } from "./geometry";
import type { SceneDefinition, SceneMesh, Vec3 } from "./types";

function lit(name: string, geometry: GeometryData, albedo: Vec3, transform: TransformOptions): SceneMesh {
  return transformMesh(makeMesh(name, "lit", geometry, { albedo }), transform);
}

export const cornellBox: SceneDefinition = {
  meta: {
    id: "cornell-box",
    title: "Cornell Box",
    description:
      "The classic multi-bounce test: red and green walls bleed color, a warm ceiling emitter lights two boxes, and the open front keeps the scene readable.",
    features: ["Global illumination", "Color bleeding", "Emissive area light", "3 bounces"],
    sections: ["gi", "emissive"],
    background: [0.008, 0.009, 0.012],
    camera: { position: [0, 2.35, 7.5], target: [0, 1.45, -0.45], fov: 44 }
  },
  bake: {
    atlasSize: 1024,
    hemisphereSize: 64,
    bounces: 3,
    ambient: [0, 0, 0],
    zNear: 0.01,
    zFar: 40,
    dilationPasses: 10
  },
  build(): SceneMesh[] {
    return [
      lit("floor", createPlane(5.5, 5.5), [0.72, 0.71, 0.69], {}),
      lit(
        "ceiling",
        createQuad(5.5, 5.5),
        [0.74, 0.74, 0.72],
        { position: [0, 3.6, 0], rotation: [Math.PI / 2, 0, 0] }
      ),
      lit(
        "back wall",
        createQuad(5.5, 3.6),
        [0.72, 0.72, 0.7],
        { position: [0, 1.8, -2.75] }
      ),
      lit(
        "left wall",
        createQuad(5.5, 3.6),
        [0.72, 0.1, 0.08],
        { position: [-2.75, 1.8, 0], rotation: [0, Math.PI / 2, 0] }
      ),
      lit(
        "right wall",
        createQuad(5.5, 3.6),
        [0.1, 0.5, 0.14],
        { position: [2.75, 1.8, 0], rotation: [0, -Math.PI / 2, 0] }
      ),
      lit("tall box", createBox(1.1, 1.8, 1.1), [0.78, 0.76, 0.72], {
        position: [-0.8, 0.9, -0.8],
        rotation: [0, 0.2, 0]
      }),
      lit("short box", createBox(1.2, 1, 1.2), [0.74, 0.75, 0.78], {
        position: [0.85, 0.5, 0.35],
        rotation: [0, -0.35, 0]
      }),
      transformMesh(
        makeMesh("ceiling light", "emissive", createBox(1.3, 0.05, 1.3), {
          emissive: [22, 18, 12]
        }),
        { position: [0, 3.55, -0.4] }
      )
    ];
  }
};
