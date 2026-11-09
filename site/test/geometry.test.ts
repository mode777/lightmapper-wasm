import { describe, expect, it } from "vitest";
import {
  createBox,
  createCylinder,
  createPlane,
  createQuad,
  createSphere,
  createTorus,
  transformGeometry,
  validateGeometry,
  type GeometryData
} from "../src/demos/geometry";

function triangleCount(geometry: GeometryData): number {
  return geometry.indices.length / 3;
}

function expectOutward(geometry: GeometryData): void {
  const { positions, normals, indices } = geometry;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;
    const ab = [
      positions[b] - positions[a],
      positions[b + 1] - positions[a + 1],
      positions[b + 2] - positions[a + 2]
    ];
    const ac = [
      positions[c] - positions[a],
      positions[c + 1] - positions[a + 1],
      positions[c + 2] - positions[a + 2]
    ];
    const face = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0]
    ];
    const normal = [
      normals[a] + normals[b] + normals[c],
      normals[a + 1] + normals[b + 1] + normals[c + 1],
      normals[a + 2] + normals[b + 2] + normals[c + 2]
    ];
    expect(face[0] * normal[0] + face[1] * normal[1] + face[2] * normal[2]).toBeGreaterThan(0);
  }
}

describe("geometry helpers", () => {
  it("builds finite, indexed primitives with the expected triangle counts", () => {
    const primitives: Array<[string, GeometryData, number]> = [
      ["quad", createQuad(2, 1), 2],
      ["plane", createPlane(4, 3), 2],
      ["box", createBox(2, 3, 4), 12],
      ["sphere", createSphere(1, 12, 8), 168],
      ["cylinder", createCylinder(1, 2, 16), 64],
      ["torus", createTorus(1, 0.3, 16, 8), 256]
    ];

    for (const [name, geometry, expectedTriangles] of primitives) {
      const stats = validateGeometry(geometry, name);
      expect(stats.vertexCount).toBeGreaterThan(0);
      expect(stats.triangleCount).toBe(expectedTriangles);
      expect(triangleCount(geometry)).toBe(expectedTriangles);
      expect(geometry.indices.length % 3).toBe(0);
      expectOutward(geometry);
    }
  });

  it("keeps smooth-surface normals unit length", () => {
    for (const geometry of [createSphere(2, 16, 10), createTorus(1, 0.35, 20, 10)]) {
      for (let i = 0; i < geometry.normals.length; i += 3) {
        const length = Math.hypot(
          geometry.normals[i],
          geometry.normals[i + 1],
          geometry.normals[i + 2]
        );
        expect(length).toBeCloseTo(1, 5);
      }
    }
  });

  it("transforms positions and normals without changing topology", () => {
    const source = createBox(1, 2, 3);
    const moved = transformGeometry(source, {
      position: [1, 2, 3],
      rotation: [0.2, 0.4, -0.1],
      scale: 2
    });

    expect(moved.indices).toBe(source.indices);
    expect(moved.positions.length).toBe(source.positions.length);
    expect(moved.normals.length).toBe(source.normals.length);
    expectOutward(moved);

    const bounds = (values: Float32Array, axis: number): [number, number] => {
      let min = Infinity;
      let max = -Infinity;
      for (let i = axis; i < values.length; i += 3) {
        min = Math.min(min, values[i]);
        max = Math.max(max, values[i]);
      }
      return [min, max];
    };
    const [minX, maxX] = bounds(moved.positions, 0);
    expect(minX).toBeLessThan(maxX);
    expect(bounds(moved.positions, 1)[0]).toBeGreaterThan(-1);
    expect(bounds(moved.positions, 1)[1]).toBeGreaterThan(3);
  });

  it("rejects non-finite values and out-of-range indices", () => {
    const geometry = createQuad(1, 1);
    expect(() => validateGeometry({ ...geometry, positions: new Float32Array([NaN, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]) }, "bad")).toThrow(
      /non-finite/
    );
    expect(() => validateGeometry({ ...geometry, indices: new Uint32Array([0, 1, 99]) }, "bad")).toThrow(
      /out of range/
    );
    expect(() => validateGeometry({ ...geometry, indices: new Uint32Array([]) }, "bad")).toThrow(/empty/);
  });
});
