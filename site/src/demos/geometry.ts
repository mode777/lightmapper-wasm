import type { SceneMesh, Vec3 } from "./types";


export interface GeometryData {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

export interface TransformOptions {
  position?: Vec3;
  /** Euler rotation in radians, applied X then Y then Z. */
  rotation?: Vec3;
  scale?: number | Vec3;
}

interface Builder {
  positions: number[];
  normals: number[];
  indices: number[];
}

function builder(): Builder {
  return { positions: [], normals: [], indices: [] };
}

function addVertex(out: Builder, position: Vec3, normal: Vec3): number {
  const index = out.positions.length / 3;
  out.positions.push(position[0], position[1], position[2]);
  out.normals.push(normal[0], normal[1], normal[2]);
  return index;
}

function addTriangle(out: Builder, a: number, b: number, c: number): void {
  out.indices.push(a, b, c);
}

function addQuad(
  out: Builder,
  normal: Vec3,
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3
): void {
  const i0 = addVertex(out, a, normal);
  const i1 = addVertex(out, b, normal);
  const i2 = addVertex(out, c, normal);
  const i3 = addVertex(out, d, normal);
  addTriangle(out, i0, i1, i2);
  addTriangle(out, i0, i2, i3);
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function finalize(out: Builder): GeometryData {
  const positions = new Float32Array(out.positions);
  const normals = new Float32Array(out.normals);
  const indices = new Uint32Array(out.indices);

  // Ensure every triangle winds outward relative to its vertex normals. This
  // keeps the primitive definitions readable and protects the lightmapper's
  // front-facing alpha convention.
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;
    const va: Vec3 = [positions[a], positions[a + 1], positions[a + 2]];
    const vb: Vec3 = [positions[b], positions[b + 1], positions[b + 2]];
    const vc: Vec3 = [positions[c], positions[c + 1], positions[c + 2]];
    const ab: Vec3 = [vb[0] - va[0], vb[1] - va[1], vb[2] - va[2]];
    const ac: Vec3 = [vc[0] - va[0], vc[1] - va[1], vc[2] - va[2]];
    const face = cross(ab, ac);
    const n: Vec3 = [
      normals[a] + normals[b] + normals[c],
      normals[a + 1] + normals[b + 1] + normals[c + 1],
      normals[a + 2] + normals[b + 2] + normals[c + 2]
    ];
    if (face[0] * n[0] + face[1] * n[1] + face[2] * n[2] < 0) {
      const swap = indices[i + 1];
      indices[i + 1] = indices[i + 2];
      indices[i + 2] = swap;
    }
  }

  return { positions, normals, indices };
}

/** Vertical quad in the XY plane, facing +Z, centered at the origin. */
export function createQuad(width: number, height: number): GeometryData {
  const w = width / 2;
  const h = height / 2;
  const out = builder();
  addQuad(out, [0, 0, 1], [-w, -h, 0], [w, -h, 0], [w, h, 0], [-w, h, 0]);
  return finalize(out);
}

/** Horizontal quad in the XZ plane, facing +Y, centered at the origin. */
export function createPlane(width: number, depth: number): GeometryData {
  const w = width / 2;
  const d = depth / 2;
  const out = builder();
  addQuad(out, [0, 1, 0], [-w, 0, -d], [-w, 0, d], [w, 0, d], [w, 0, -d]);
  return finalize(out);
}

/** Axis-aligned box centered at the origin with one normal per face. */
export function createBox(width: number, height: number, depth: number): GeometryData {
  const x = width / 2;
  const y = height / 2;
  const z = depth / 2;
  const out = builder();

  addQuad(out, [1, 0, 0], [x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]);
  addQuad(out, [-1, 0, 0], [-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]);
  addQuad(out, [0, 1, 0], [-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]);
  addQuad(out, [0, -1, 0], [-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]);
  addQuad(out, [0, 0, 1], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]);
  addQuad(out, [0, 0, -1], [x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]);

  return finalize(out);
}

/** UV sphere with shared vertices and smooth normals. */
export function createSphere(radius: number, widthSegments = 24, heightSegments = 16): GeometryData {
  const out = builder();
  const grid: number[][] = [];

  for (let iy = 0; iy <= heightSegments; iy += 1) {
    const row: number[] = [];
    const v = iy / heightSegments;
    const theta = v * Math.PI;
    for (let ix = 0; ix <= widthSegments; ix += 1) {
      const u = ix / widthSegments;
      const phi = u * Math.PI * 2;
      const normal: Vec3 = [
        Math.sin(theta) * Math.cos(phi),
        Math.cos(theta),
        Math.sin(theta) * Math.sin(phi)
      ];
      row.push(
        addVertex(out, [normal[0] * radius, normal[1] * radius, normal[2] * radius], normal)
      );
    }
    grid.push(row);
  }

  for (let iy = 0; iy < heightSegments; iy += 1) {
    for (let ix = 0; ix < widthSegments; ix += 1) {
      const a = grid[iy][ix];
      const b = grid[iy + 1][ix];
      const c = grid[iy + 1][ix + 1];
      const d = grid[iy][ix + 1];
      if (iy !== 0) addTriangle(out, a, b, d);
      if (iy !== heightSegments - 1) addTriangle(out, b, c, d);
    }
  }

  return finalize(out);
}

/** Cylinder with smooth sides and flat caps. */
export function createCylinder(radius: number, height: number, radialSegments = 24): GeometryData {
  const out = builder();
  const half = height / 2;

  for (let i = 0; i <= radialSegments; i += 1) {
    const angle = (i / radialSegments) * Math.PI * 2;
    const nx = Math.cos(angle);
    const nz = Math.sin(angle);
    addVertex(out, [nx * radius, -half, nz * radius], [nx, 0, nz]);
    addVertex(out, [nx * radius, half, nz * radius], [nx, 0, nz]);
  }
  for (let i = 0; i < radialSegments; i += 1) {
    const b0 = i * 2;
    const t0 = b0 + 1;
    const b1 = b0 + 2;
    const t1 = b0 + 3;
    addTriangle(out, b0, t0, t1);
    addTriangle(out, b0, t1, b1);
  }

  const topCenter = addVertex(out, [0, half, 0], [0, 1, 0]);
  const topRing: number[] = [];
  for (let i = 0; i < radialSegments; i += 1) {
    const angle = (i / radialSegments) * Math.PI * 2;
    topRing.push(addVertex(out, [Math.cos(angle) * radius, half, Math.sin(angle) * radius], [0, 1, 0]));
  }
  for (let i = 0; i < radialSegments; i += 1) {
    addTriangle(out, topCenter, topRing[i], topRing[(i + 1) % radialSegments]);
  }

  const bottomCenter = addVertex(out, [0, -half, 0], [0, -1, 0]);
  const bottomRing: number[] = [];
  for (let i = 0; i < radialSegments; i += 1) {
    const angle = (i / radialSegments) * Math.PI * 2;
    bottomRing.push(
      addVertex(out, [Math.cos(angle) * radius, -half, Math.sin(angle) * radius], [0, -1, 0])
    );
  }
  for (let i = 0; i < radialSegments; i += 1) {
    addTriangle(out, bottomCenter, bottomRing[(i + 1) % radialSegments], bottomRing[i]);
  }

  return finalize(out);
}

/** Torus around the Y axis with shared vertices and smooth normals. */
export function createTorus(
  majorRadius: number,
  minorRadius: number,
  majorSegments = 32,
  minorSegments = 12
): GeometryData {
  const out = builder();
  const grid: number[][] = [];

  for (let i = 0; i <= majorSegments; i += 1) {
    const u = (i / majorSegments) * Math.PI * 2;
    const row: number[] = [];
    for (let j = 0; j <= minorSegments; j += 1) {
      const v = (j / minorSegments) * Math.PI * 2;
      const cosU = Math.cos(u);
      const sinU = Math.sin(u);
      const cosV = Math.cos(v);
      const sinV = Math.sin(v);
      const normal: Vec3 = [cosV * cosU, sinV, cosV * sinU];
      row.push(
        addVertex(
          out,
          [
            (majorRadius + minorRadius * cosV) * cosU,
            minorRadius * sinV,
            (majorRadius + minorRadius * cosV) * sinU
          ],
          normal
        )
      );
    }
    grid.push(row);
  }

  for (let i = 0; i < majorSegments; i += 1) {
    for (let j = 0; j < minorSegments; j += 1) {
      const a = grid[i][j];
      const b = grid[i + 1][j];
      const c = grid[i + 1][j + 1];
      const d = grid[i][j + 1];
      addTriangle(out, a, b, d);
      addTriangle(out, b, c, d);
    }
  }

  return finalize(out);
}

export function transformGeometry(source: GeometryData, options: TransformOptions = {}): GeometryData {
  const scale = options.scale ?? 1;
  const [sx, sy, sz] = typeof scale === "number" ? [scale, scale, scale] : scale;
  const [rx, ry, rz] = options.rotation ?? [0, 0, 0];
  const [tx, ty, tz] = options.position ?? [0, 0, 0];
  const cx = Math.cos(rx);
  const sxr = Math.sin(rx);
  const cy = Math.cos(ry);
  const syr = Math.sin(ry);
  const cz = Math.cos(rz);
  const szr = Math.sin(rz);

  const transform = (x: number, y: number, z: number): Vec3 => {
    const x1 = x * sx;
    const y1 = y * sy;
    const z1 = z * sz;
    const y2 = y1 * cx - z1 * sxr;
    const z2 = y1 * sxr + z1 * cx;
    const x3 = x1 * cy + z2 * syr;
    const z3 = -x1 * syr + z2 * cy;
    const x4 = x3 * cz - y2 * szr;
    const y4 = x3 * szr + y2 * cz;
    return [x4 + tx, y4 + ty, z3 + tz];
  };

  const rotateNormal = (x: number, y: number, z: number): Vec3 => {
    const y2 = y * cx - z * sxr;
    const z2 = y * sxr + z * cx;
    const x3 = x * cy + z2 * syr;
    const z3 = -x * syr + z2 * cy;
    const x4 = x3 * cz - y2 * szr;
    const y4 = x3 * szr + y2 * cz;
    const length = Math.hypot(x4, y4, z3) || 1;
    return [x4 / length, y4 / length, z3 / length];
  };

  const positions = new Float32Array(source.positions.length);
  const normals = new Float32Array(source.normals.length);
  for (let i = 0; i < positions.length; i += 3) {
    const p = transform(source.positions[i], source.positions[i + 1], source.positions[i + 2]);
    positions[i] = p[0];
    positions[i + 1] = p[1];
    positions[i + 2] = p[2];
    const n = rotateNormal(source.normals[i], source.normals[i + 1], source.normals[i + 2]);
    normals[i] = n[0];
    normals[i + 1] = n[1];
    normals[i + 2] = n[2];
  }

  return { positions, normals, indices: source.indices };
}

export function transformMesh(mesh: SceneMesh, options: TransformOptions = {}): SceneMesh {
  const geometry = transformGeometry(
    {
      positions: mesh.positions,
      normals: mesh.normals ?? new Float32Array(mesh.positions.length),
      indices: mesh.indices
    },
    options
  );
  return { ...mesh, positions: geometry.positions, normals: geometry.normals, indices: geometry.indices };
}

export interface GeometryStats {
  vertexCount: number;
  triangleCount: number;
}

export function validateGeometry(mesh: Pick<SceneMesh, "positions" | "normals" | "indices">, label = "mesh"): GeometryStats {
  const { positions, normals, indices } = mesh;
  if (positions.length === 0) throw new Error(`${label}: positions are empty`);
  if (positions.length % 3 !== 0) throw new Error(`${label}: positions are not xyz triples`);
  if (indices.length === 0) throw new Error(`${label}: indices are empty`);
  if (indices.length % 3 !== 0) throw new Error(`${label}: indices are not triangles`);

  const vertexCount = positions.length / 3;
  for (let i = 0; i < positions.length; i += 1) {
    if (!Number.isFinite(positions[i])) throw new Error(`${label}: non-finite position at index ${i}`);
  }
  if (normals) {
    if (normals.length !== positions.length) throw new Error(`${label}: normal count differs from positions`);
    for (let i = 0; i < normals.length; i += 1) {
      if (!Number.isFinite(normals[i])) throw new Error(`${label}: non-finite normal at index ${i}`);
    }
  }
  for (let i = 0; i < indices.length; i += 1) {
    if (indices[i] >= vertexCount) {
      throw new Error(`${label}: index ${indices[i]} at position ${i} is out of range`);
    }
  }

  return { vertexCount, triangleCount: indices.length / 3 };
}

export function boundsOf(meshes: readonly SceneMesh[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const mesh of meshes) {
    for (let i = 0; i < mesh.positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = mesh.positions[i + axis];
        if (value < min[axis]) min[axis] = value;
        if (value > max[axis]) max[axis] = value;
      }
    }
  }
  if (!Number.isFinite(min[0])) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min, max };
}

export function makeMesh(
  name: string,
  kind: "lit" | "emissive",
  geometry: GeometryData,
  colors: { albedo?: Vec3; emissive?: Vec3 } = {}
): SceneMesh {
  const mesh: SceneMesh = {
    name,
    kind,
    positions: geometry.positions,
    normals: geometry.normals,
    indices: geometry.indices
  };
  if (kind === "lit") mesh.albedo = colors.albedo ?? [0.8, 0.8, 0.8];
  else mesh.emissive = colors.emissive ?? [1, 1, 1];
  return mesh;
}
