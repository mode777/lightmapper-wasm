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

const ENVIRONMENT_URL = new URL(
  "../assets/environments/studio_small_09_1k.hdr",
  import.meta.url
).href;

export const hdriStudio: SceneDefinition = {
  meta: {
    id: "hdri-studio",
    title: "HDRI Studio",
    description:
      "A neutral photo studio lit only by a real HDR environment. Softbox highlights and soft shadows come entirely from the checked-in 1k HDRI; there are no emitters or analytic lights.",
    features: ["HDRI environment", "Environment-only", "Soft shadows", "No emitters"],
    sections: ["environment"],
    camera: { position: [5.8, 3.6, 7.2], target: [0, 1.3, 0], fov: 42 }
  },
  bake: {
    atlasSize: 512,
    hemisphereSize: 32,
    bounces: 2,
    ambient: [0, 0, 0],
    environment: {
      kind: "hdr",
      url: ENVIRONMENT_URL,
      intensity: 1
    },
    zNear: 0.01,
    zFar: 40,
    dilationPasses: 8,
    // A raw 1k studio HDRI plus the lightmapper's coarse hierarchical
    // interpolation produced large diamond artifacts. The loader supplies a
    // prefiltered irradiance copy, one fine interpolation pass avoids the
    // coarse 16-texel grid, and four smoothing passes hide the remaining
    // sampling mottling.
    smoothPasses: 12,
    interpolationPasses: 1,
    interpolationThreshold: 0.5
  },
  build(): SceneMesh[] {
    return [
      lit("floor", createPlane(9, 9), [0.56, 0.56, 0.57], {}),
      lit("back wall", createQuad(9, 5), [0.66, 0.67, 0.69], {
        position: [0, 2.5, -4]
      }),
      lit("pedestal", createCylinder(0.5, 0.9, 24), [0.74, 0.72, 0.68], {
        position: [0.9, 0.45, 0.1]
      }),
      lit("sphere", createSphere(0.42, 24, 16), [0.86, 0.83, 0.78], {
        position: [0.9, 1.11, 0.1]
      }),
      lit("box", createBox(1.2, 1.2, 1.2), [0.6, 0.63, 0.7], {
        position: [-1.0, 0.6, 0.55],
        rotation: [0, 0.4, 0]
      }),
      lit("torus", createTorus(0.55, 0.16, 32, 12), [0.78, 0.67, 0.61], {
        position: [1.5, 0.75, -1.6],
        rotation: [Math.PI / 2, 0.3, 0]
      })
    ];
  }
};
