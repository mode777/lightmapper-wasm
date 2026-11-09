import createXAtlas, {
  type CreateXAtlasOptions,
  type Mesh,
  type XAtlasModule
} from "xatlas-wasm";
import { assertFiniteArray, type SceneDefinition, type SceneMesh } from "../demos/types";
import type { AtlasMetadata, UnwrappedObject, UnwrappedScene } from "./types";

export const UV_MAX = 1 - 1e-6;
const UV_AREA_EPSILON = 1e-14;

let modulePromise: Promise<XAtlasModule> | null = null;

export function loadXAtlas(options?: CreateXAtlasOptions): Promise<XAtlasModule> {
  if (!modulePromise) {
    modulePromise = createXAtlas(options).catch((error: unknown) => {
      modulePromise = null;
      throw error;
    });
  }
  return modulePromise;
}

/** Test hook: allow a later call to re-attempt module initialization. */
export function resetXAtlasForTests(): void {
  modulePromise = null;
}

/**
 * Normalize an xatlas texel coordinate. The lightmapper's positive-mod maps
 * exactly 1.0 to 0.0, so the atlas edge is clamped to `UV_MAX`; coordinates
 * outside the atlas are invalid and rejected.
 */
export function normalizeAtlasUv(texel: number, size: number): number {
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error(`atlas UV: invalid atlas size ${size}`);
  }
  if (!Number.isFinite(texel)) {
    throw new Error(`atlas UV: non-finite texel coordinate ${texel}`);
  }
  if (texel < 0 || texel > size) {
    throw new Error(`atlas UV: texel ${texel} is outside the atlas range [0, ${size}]`);
  }
  return Math.min(Math.max(texel / size, 0), UV_MAX);
}

export interface UnwrapOptions {
  /** Override the scene preset atlas size. */
  atlasSize?: number;
  /** Reuse an initialized xatlas module. */
  module?: XAtlasModule;
  /** Forwarded to createXAtlas on first use. */
  moduleOptions?: CreateXAtlasOptions;
}

export async function unwrapScene(
  scene: SceneDefinition,
  options: UnwrapOptions = {}
): Promise<UnwrappedScene> {
  const meshes = scene.build();
  const litMeshes = meshes.filter((mesh) => mesh.kind === "lit");
  const emissiveObjects = meshes.filter((mesh) => mesh.kind === "emissive");
  if (litMeshes.length === 0) throw new Error(`${scene.meta.id}: no lit meshes to unwrap`);

  const atlasSize = options.atlasSize ?? scene.bake.atlasSize;
  if (!Number.isInteger(atlasSize) || atlasSize <= 0) {
    throw new Error(`${scene.meta.id}: invalid atlas size ${atlasSize}`);
  }

  const xatlas = options.module ?? (await loadXAtlas(options.moduleOptions));
  const atlas = xatlas.createAtlas();

  try {
    for (const mesh of litMeshes) {
      validateLitInput(scene.meta.id, mesh);
      const error = atlas.addMesh({
        positions: mesh.positions,
        normals: mesh.normals,
        indices: mesh.indices,
        meshCountHint: litMeshes.length
      });
      if (error !== xatlas.AddMeshError.Success) {
        throw new Error(
          `${scene.meta.id}/${mesh.name}: xatlas addMesh failed: ${xatlas.addMeshErrorString(error)}`
        );
      }
    }

    atlas.generate(
      { maxIterations: 1 },
      {
        resolution: atlasSize,
        padding: 2,
        bilinear: true,
        blockAlign: true
      }
    );

    if (atlas.meshCount !== litMeshes.length) {
      throw new Error(
        `${scene.meta.id}: xatlas produced ${atlas.meshCount} meshes for ${litMeshes.length} inputs`
      );
    }
    if (atlas.atlasCount !== 1) {
      throw new Error(`${scene.meta.id}: xatlas produced ${atlas.atlasCount} atlases; one is required`);
    }
    if (atlas.width <= 0 || atlas.height <= 0) {
      throw new Error(`${scene.meta.id}: xatlas produced an empty atlas`);
    }

    const litObjects = litMeshes.map((mesh, index) =>
      unwrapObject(scene.meta.id, mesh, atlas.getMesh(index), atlas.width, atlas.height)
    );

    const metadata: AtlasMetadata = {
      width: atlas.width,
      height: atlas.height,
      chartCount: atlas.chartCount,
      utilization: atlas.getUtilization(0)
    };

    return { litObjects, emissiveObjects, atlas: metadata };
  } finally {
    atlas.destroy();
  }
}

function validateLitInput(sceneId: string, mesh: SceneMesh): void {
  const label = `${sceneId}/${mesh.name}`;
  if (!mesh.normals) throw new Error(`${label}: lit mesh needs normals for xatlas`);
  if (mesh.positions.length === 0 || mesh.indices.length === 0) {
    throw new Error(`${label}: lit mesh has empty geometry`);
  }
  assertFiniteArray(mesh.positions, `${label} positions`);
  assertFiniteArray(mesh.normals, `${label} normals`);
}

function unwrapObject(
  sceneId: string,
  input: SceneMesh,
  output: Mesh,
  width: number,
  height: number
): UnwrappedObject {
  const label = `${sceneId}/${input.name}`;
  if (output.indexCount === 0) throw new Error(`${label}: xatlas output has no indices`);
  if (output.indices.length % 3 !== 0) throw new Error(`${label}: xatlas output is not triangles`);

  const inputNormals = input.normals;
  if (!inputNormals) throw new Error(`${label}: missing input normals`);

  const positions = new Float32Array(output.vertexCount * 3);
  const normals = new Float32Array(output.vertexCount * 3);
  const uvs = new Float32Array(output.vertexCount * 2);
  const charts = new Uint32Array(output.vertexCount);
  const inputVertexCount = input.positions.length / 3;

  for (let i = 0; i < output.vertexCount; i += 1) {
    const vertex = output.vertices[i];
    const xref = vertex.xref;
    if (!Number.isInteger(xref) || xref < 0 || xref >= inputVertexCount) {
      throw new Error(`${label}: xatlas xref ${xref} at vertex ${i} is out of range`);
    }
    positions[i * 3] = input.positions[xref * 3];
    positions[i * 3 + 1] = input.positions[xref * 3 + 1];
    positions[i * 3 + 2] = input.positions[xref * 3 + 2];
    normals[i * 3] = inputNormals[xref * 3];
    normals[i * 3 + 1] = inputNormals[xref * 3 + 1];
    normals[i * 3 + 2] = inputNormals[xref * 3 + 2];
    uvs[i * 2] = normalizeAtlasUv(vertex.uv[0], width);
    uvs[i * 2 + 1] = normalizeAtlasUv(vertex.uv[1], height);
    charts[i] = vertex.chartIndex;
  }

  const indices = new Uint32Array(output.indices);
  assertFiniteArray(positions, `${label} positions`);
  assertFiniteArray(normals, `${label} normals`);
  assertFiniteArray(uvs, `${label} uvs`);
  validateUvTriangles(label, uvs, indices);

  return {
    name: input.name,
    positions,
    normals,
    uvs,
    indices,
    charts,
    albedo: input.albedo ?? [0.8, 0.8, 0.8],
    triangleCount: indices.length / 3,
    chartCount: output.chartCount
  };
}

function validateUvTriangles(label: string, uvs: Float32Array, indices: Uint32Array): void {
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 2;
    const b = indices[i + 1] * 2;
    const c = indices[i + 2] * 2;
    const ua = uvs[a];
    const va = uvs[a + 1];
    const ub = uvs[b];
    const vb = uvs[b + 1];
    const uc = uvs[c];
    const vc = uvs[c + 1];
    if (ua < 0 || ua >= 1 || va < 0 || va >= 1 || ub < 0 || ub >= 1 || vb < 0 || vb >= 1 || uc < 0 || uc >= 1 || vc < 0 || vc >= 1) {
      throw new Error(`${label}: UV outside [0, 1) at triangle ${i / 3}`);
    }
    const area = Math.abs((ub - ua) * (vc - va) - (uc - ua) * (vb - va)) * 0.5;
    if (!(area > UV_AREA_EPSILON)) {
      throw new Error(`${label}: degenerate UV triangle ${i / 3} (area ${area})`);
    }
  }
}
