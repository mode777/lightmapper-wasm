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
  "../assets/environments/kloofendal_48d_partly_cloudy_1k.hdr",
  import.meta.url
).href;

export const hdriOutdoor: SceneDefinition = {
  meta: {
    id: "hdri-outdoor",
    title: "Daylight HDRI",
    description:
      "A midday outdoor set lit only by a partly cloudy sky HDRI. Direct sun, cloud shadows and sky fill come from the environment; there are no analytic lights or emitters.",
    features: ["Daytime HDRI", "Sun + sky", "Outdoor", "No emitters"],
    sections: ["environment"],
    camera: { position: [6.2, 3.1, 7.4], target: [0, 1.15, -0.2], fov: 43 }
  },
  bake: {
    atlasSize: 1024,
    hemisphereSize: 32,
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
      lit("ground", createPlane(12, 12), [0.34, 0.4, 0.27], {}),
      lit("stone wall", createBox(6.4, 0.95, 0.45), [0.55, 0.53, 0.47], {
        position: [0, 0.475, -3.6]
      }),
      lit("plinth", createCylinder(0.5, 0.9, 24), [0.6, 0.55, 0.46], {
        position: [0.85, 0.45, 0.1]
      }),
      lit("sphere", createSphere(0.44, 24, 16), [0.82, 0.77, 0.68], {
        position: [0.85, 1.12, 0.1]
      }),
      lit("box", createBox(1.25, 1.1, 1.25), [0.62, 0.58, 0.5], {
        position: [-1.05, 0.55, 0.6],
        rotation: [0, 0.42, 0]
      }),
      lit("torus", createTorus(0.55, 0.16, 32, 12), [0.72, 0.63, 0.52], {
        position: [1.65, 0.75, -1.55],
        rotation: [Math.PI / 2, 0.3, 0]
      }),
      lit("post", createCylinder(0.34, 1.65, 24), [0.57, 0.61, 0.53], {
        position: [-1.75, 0.825, -1.3]
      }),
      lit("bench", createBox(0.85, 0.5, 0.85), [0.55, 0.5, 0.43], {
        position: [0.35, 0.25, 1.65],
        rotation: [0, -0.22, 0]
      })
    ];
  }
};
