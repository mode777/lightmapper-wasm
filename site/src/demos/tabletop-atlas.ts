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

export const tabletopAtlas: SceneDefinition = {
  meta: {
    id: "tabletop-atlas",
    title: "Tabletop Atlas",
    description:
      "A table, four legs and several props packed into one shared 1024² xatlas atlas. A warm lamp casts inter-object shadows across the set.",
    features: ["Shared atlas", "12 lit meshes", "xatlas packing", "Warm emitter"],
    sections: ["multi-object", "gi"],
    background: [0.012, 0.014, 0.018],
    camera: { position: [5.4, 3.6, 6.8], target: [0, 1.2, -0.2], fov: 42 }
  },
  bake: {
    atlasSize: 1024,
    hemisphereSize: 64,
    bounces: 2,
    ambient: [0.045, 0.045, 0.055],
    zNear: 0.01,
    zFar: 40,
    dilationPasses: 10
  },
  build(): SceneMesh[] {
    const tableHeight = 0.92;
    const topThickness = 0.14;
    const legs: SceneMesh[] = [];
    for (const x of [-1.85, 1.85]) {
      for (const z of [-0.95, 0.95]) {
        legs.push(
          lit(
            `leg ${legs.length + 1}`,
            createCylinder(0.06, 0.85, 16),
            [0.38, 0.3, 0.22],
            { position: [x, 0.425, z] }
          )
        );
      }
    }

    return [
      lit("floor", createPlane(9, 9), [0.5, 0.48, 0.45], {}),
      lit(
        "back wall",
        createQuad(9, 4),
        [0.42, 0.42, 0.45],
        { position: [0, 2, -3] }
      ),
      lit(
        "left wall",
        createQuad(7, 4),
        [0.4, 0.4, 0.43],
        { position: [-3.6, 2, 0], rotation: [0, Math.PI / 2, 0] }
      ),
      lit("table top", createBox(4.2, topThickness, 2.4), [0.62, 0.46, 0.3], {
        position: [0, tableHeight, 0]
      }),
      ...legs,
      lit("red sphere", createSphere(0.3, 24, 16), [0.7, 0.24, 0.18], {
        position: [-0.9, 1.22, 0.2]
      }),
      lit("blue torus", createTorus(0.3, 0.09, 32, 12), [0.2, 0.5, 0.65], {
        position: [0, 1.08, 0.25]
      }),
      lit("wood box", createBox(0.5, 0.5, 0.5), [0.75, 0.68, 0.5], {
        position: [1.0, 1.25, -0.3],
        rotation: [0, 0.4, 0]
      }),
      lit("green cylinder", createCylinder(0.17, 0.55, 24), [0.35, 0.6, 0.35], {
        position: [0.55, 1.27, 0.55]
      }),
      transformMesh(
        makeMesh("lamp", "emissive", createSphere(0.16, 20, 14), {
          emissive: [30, 24, 15]
        }),
        { position: [0, 2.15, 0] }
      )
    ];
  }
};
