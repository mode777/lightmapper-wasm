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

// A low sun toward the back-left of the default camera. The disk is part of
// the generated equirectangular environment and acts as the directional light.
const SUN_DIRECTION: Vec3 = [-0.5, 0.28, -0.82];

export const sunSkyOutdoor: SceneDefinition = {
  meta: {
    id: "sun-sky-outdoor",
    title: "Sun & Sky Courtyard",
    description:
      "A non-HDRI courtyard lit by a generated sky gradient and a low sun disk. The sun provides directional light and long shadows; the sky supplies cool fill. There is no HDRI, emitter or analytic light in the scene.",
    features: ["Procedural sky", "Directional sun", "Outdoor", "No HDRI"],
    sections: ["environment"],
    camera: { position: [6.8, 2.4, 7.6], target: [0, 1.5, -0.3], fov: 55 }
  },
  bake: {
    atlasSize: 512,
    hemisphereSize: 64,
    bounces: 2,
    ambient: [0, 0, 0],
    environment: {
      kind: "sky",
      zenith: [0.02, 0.06, 0.22],
      horizon: [0.25, 0.35, 0.52],
      ground: [0.03, 0.03, 0.02],
      intensity: 1,
      width: 1024,
      height: 512,
      sun: {
        direction: SUN_DIRECTION,
        color: [800, 600, 380],
        angularRadius: 0.06,
        intensity: 1
      }
    },
    zNear: 0.01,
    zFar: 50,
    dilationPasses: 8,
    smoothPasses: 4,
    interpolationPasses: 1,
    interpolationThreshold: 0.5
  },
  build(): SceneMesh[] {
    return [
      lit("ground", createPlane(14, 14), [0.62, 0.54, 0.4], {}),
      lit("back wall", createBox(7.2, 1.25, 0.5), [0.74, 0.64, 0.5], {
        position: [0, 0.625, -3.9]
      }),
      lit("side wall", createBox(0.55, 1.8, 4.4), [0.68, 0.59, 0.47], {
        position: [-3.6, 0.9, -1.1]
      }),
      lit("plinth", createCylinder(0.5, 0.9, 24), [0.8, 0.7, 0.55], {
        position: [0.9, 0.45, 0.1]
      }),
      lit("sphere", createSphere(0.44, 24, 16), [0.86, 0.77, 0.62], {
        position: [0.9, 1.12, 0.1]
      }),
      lit("box", createBox(1.25, 1.1, 1.25), [0.72, 0.55, 0.4], {
        position: [-1.05, 0.55, 0.7],
        rotation: [0, 0.42, 0]
      }),
      lit("torus", createTorus(0.55, 0.16, 32, 12), [0.67, 0.56, 0.44], {
        position: [1.8, 0.75, -1.5],
        rotation: [Math.PI / 2, 0.3, 0]
      }),
      lit("post", createCylinder(0.3, 1.8, 24), [0.6, 0.56, 0.47], {
        position: [-1.9, 0.9, -1.4]
      }),
      lit("bench", createBox(0.95, 0.5, 0.95), [0.62, 0.5, 0.38], {
        position: [0.3, 0.25, 1.8],
        rotation: [0, -0.22, 0]
      })
    ];
  }
};
