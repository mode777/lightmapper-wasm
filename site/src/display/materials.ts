import * as THREE from "three";
export type Vec3 = [number, number, number];

/** Minimal lightmap shape shared by the studio result and the low-level harness. */
export interface LightmapData {
  lightmap: Float32Array;
  width: number;
  height: number;
}

export type DisplayMode = "lit" | "unlit";

export interface FloatLinearQuery {
  getExtension(name: string): unknown;
}

export function lightmapFilterFor(context: FloatLinearQuery | null): THREE.MagnificationTextureFilter {
  return context?.getExtension("OES_texture_float_linear") ? THREE.LinearFilter : THREE.NearestFilter;
}

export function createLightmapTexture(
  result: LightmapData,
  context: FloatLinearQuery | null = null
): THREE.DataTexture {
  const filter = lightmapFilterFor(context);
  const texture = new THREE.DataTexture(
    result.lightmap,
    result.width,
    result.height,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.minFilter = filter;
  texture.magFilter = filter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export function createLitMaterial(albedo: Vec3, texture: THREE.Texture | null): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(albedo[0], albedo[1], albedo[2]),
    map: texture,
    toneMapped: true
  });
}

export function createEmissiveMaterial(emissive: Vec3): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(emissive[0], emissive[1], emissive[2]),
    toneMapped: true
  });
}

export function applyDisplayMode(
  materials: readonly THREE.MeshBasicMaterial[],
  litMaterials: readonly THREE.MeshBasicMaterial[],
  mode: DisplayMode,
  texture: THREE.Texture | null
): void {
  for (const material of litMaterials) {
    material.map = mode === "lit" ? texture : null;
    material.needsUpdate = true;
  }
  for (const material of materials) material.needsUpdate = true;
}

export function applyWireframe(materials: readonly THREE.MeshBasicMaterial[], enabled: boolean): void {
  for (const material of materials) {
    material.wireframe = enabled;
    material.needsUpdate = true;
  }
}
