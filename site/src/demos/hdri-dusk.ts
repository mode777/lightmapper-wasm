import {
  createBox,
  createCylinder,
  createPlane,
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

const ENVIRONMENT_URL = new URL(
  "../assets/environments/qwantani_dusk_2_puresky_1k.hdr",
  import.meta.url
).href;

export const hdriDusk: SceneDefinition = {
  meta: {
    id: "hdri-dusk",
    title: "Blue Hour HDRI",
    description:
      "A dusk courtyard lit only by a low-contrast blue-hour Pure Sky HDRI with a warm horizon band. The environment supplies soft omni-directional fill with no visible sun disk; the photographed ground is removed so the scene floor is the only ground. There are no analytic lights or emitters.",
    features: ["Dusk HDRI", "Blue hour", "Outdoor", "No emitters"],
    sections: ["environment"],
    camera: { position: [5.7, 1.7, 7.3], target: [0, 0.95, -0.25], fov: 44 }
  },
  bake: {
    atlasSize: 1024,
    hemisphereSize: 64,
    bounces: 2,
    ambient: [0, 0, 0],
    hemisphereWeight: "cosine",
    environmentBake: {
      prefilterRadius: 3
    },
    environment: {
      kind: "hdr",
      url: ENVIRONMENT_URL,
      intensity: 1
    },
    zNear: 0.01,
    zFar: 50,
    dilationPasses: 8,
    smoothPasses: 12,
    interpolationPasses: 1,
    interpolationThreshold: 0.5
  },
  build(): SceneMesh[] {
    return [
      lit("ground", createPlane(13, 13), [0.4, 0.35, 0.28], {}),
      lit("back wall", createBox(6.8, 1.1, 0.5), [0.56, 0.49, 0.4], {
        position: [0, 0.55, -3.7]
      }),
      lit("side wall", createBox(0.5, 1.85, 4.6), [0.5, 0.44, 0.37], {
        position: [-3.5, 0.925, -0.95]
      }),
      lit("plinth", createCylinder(0.5, 0.95, 24), [0.66, 0.58, 0.45], {
        position: [0.9, 0.475, 0.05]
      }),
      lit("sphere", createSphere(0.45, 24, 16), [0.85, 0.78, 0.66], {
        position: [0.9, 1.15, 0.05]
      }),
      lit("box", createBox(1.3, 1.15, 1.3), [0.7, 0.55, 0.42], {
        position: [-1.1, 0.575, 0.75],
        rotation: [0, 0.42, 0]
      }),
      lit("torus", createTorus(0.58, 0.16, 32, 12), [0.6, 0.52, 0.44], {
        position: [1.75, 0.78, -1.5],
        rotation: [Math.PI / 2, 0.3, 0]
      }),
      lit("bench", createBox(0.9, 0.48, 0.9), [0.5, 0.42, 0.34], {
        position: [0.3, 0.24, 1.85],
        rotation: [0, -0.22, 0]
      })
    ];
  }
};
