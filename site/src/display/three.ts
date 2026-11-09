import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { BakeResult } from "../bake/types";
import type { UnwrappedObject, UnwrappedScene } from "../atlas/types";
import type { SceneCamera } from "../demos/types";
import {
  applyDisplayMode,
  applyWireframe,
  createEmissiveMaterial,
  createLightmapTexture,
  createLitMaterial,
  type DisplayMode,
  type Vec3
} from "./materials";

export class DisplayError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DisplayError";
  }
}

export interface ThreeDisplayOptions {
  background?: Vec3 | null;
  camera?: SceneCamera;
}

export class ThreeDisplay {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;

  private readonly container: HTMLElement;
  private readonly group: THREE.Group;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.MeshBasicMaterial[] = [];
  private readonly litMaterials: THREE.MeshBasicMaterial[] = [];
  private readonly resizeObserver: ResizeObserver;
  private lightmap: THREE.DataTexture | null = null;
  private animationFrame = 0;
  private rendering = false;
  private disposed = false;
  private frames = 0;
  private mode: DisplayMode = "lit";
  private wireframe = false;
  private framed = false;

  constructor(container: HTMLElement, options: ThreeDisplayOptions = {}) {
    if (!container) throw new DisplayError("display container is missing");
    this.container = container;

    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: options.background == null,
        powerPreference: "high-performance"
      });
    } catch (error) {
      throw new DisplayError("three.js WebGL2 renderer could not be created", { cause: error });
    }

    const context = this.renderer.getContext();
    if (!context) {
      this.renderer.dispose();
      throw new DisplayError("three.js WebGL2 renderer has no context");
    }

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.domElement.className = "viewport";
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.setBackground(options.background ?? null);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 500);
    this.camera.position.set(4, 3, 5);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 1, 0);
    this.controls.update();

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    if (options.camera) this.applyCamera(options.camera);
    this.start();
  }

  setBackground(color: Vec3 | null): void {
    if (color) {
      this.scene.background = new THREE.Color(color[0], color[1], color[2]);
      this.renderer.setClearAlpha(1);
    } else {
      this.scene.background = null;
      this.renderer.setClearAlpha(0);
    }
  }

  setScene(scene: UnwrappedScene, result?: BakeResult, camera?: SceneCamera): void {
    if (this.disposed) throw new DisplayError("display has been disposed");
    this.clearObject();
    this.lightmap = result ? createLightmapTexture(result, this.renderer.getContext()) : null;

    for (const object of scene.litObjects) {
      const geometry = geometryFor(object);
      const material = createLitMaterial(object.albedo, this.lightmap);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = object.name;
      this.group.add(mesh);
      this.geometries.push(geometry);
      this.materials.push(material);
      this.litMaterials.push(material);
    }

    for (const object of scene.emissiveObjects) {
      const geometry = geometryFor({
        name: object.name,
        positions: object.positions,
        normals: object.normals ?? new Float32Array(object.positions.length),
        indices: object.indices,
        uvs: new Float32Array((object.positions.length / 3) * 2),
        charts: new Uint32Array(object.positions.length / 3),
        albedo: [0.8, 0.8, 0.8],
        triangleCount: object.indices.length / 3,
        chartCount: 0
      });
      const material = createEmissiveMaterial(object.emissive ?? [1, 1, 1]);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = object.name;
      this.group.add(mesh);
      this.geometries.push(geometry);
      this.materials.push(material);
    }

    this.applyModes();
    if (camera) this.applyCamera(camera);
    else if (!this.framed) this.frameScene();
    this.renderOnce();
  }

  updateLightmap(result: BakeResult): void {
    if (this.disposed) throw new DisplayError("display has been disposed");
    if (!this.lightmap) {
      this.lightmap = createLightmapTexture(result, this.renderer.getContext());
      this.applyModes();
    } else {
      if (this.lightmap.image.width !== result.width || this.lightmap.image.height !== result.height) {
        throw new DisplayError(
          `lightmap dimensions changed from ${this.lightmap.image.width}x${this.lightmap.image.height} to ${result.width}x${result.height}`
        );
      }
      const data = this.lightmap.image.data as Float32Array;
      if (data.length !== result.lightmap.length) {
        throw new DisplayError("lightmap data length changed between bounces");
      }
      data.set(result.lightmap);
      this.lightmap.needsUpdate = true;
    }
    this.renderOnce();
  }

  setMode(mode: DisplayMode): void {
    this.mode = mode;
    this.applyModes();
    this.renderOnce();
  }

  setWireframe(enabled: boolean): void {
    this.wireframe = enabled;
    applyWireframe(this.materials, enabled);
    this.renderOnce();
  }

  get modeValue(): DisplayMode {
    return this.mode;
  }

  get wireframeEnabled(): boolean {
    return this.wireframe;
  }

  get lightmapTexture(): THREE.DataTexture | null {
    return this.lightmap;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  get isRendering(): boolean {
    return this.rendering;
  }

  get frameCount(): number {
    return this.frames;
  }

  get geometryCount(): number {
    return this.geometries.length;
  }

  get materialCount(): number {
    return this.materials.length;
  }

  get litMaterialCount(): number {
    return this.litMaterials.length;
  }

  pause(): void {
    this.rendering = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
  }

  resume(): void {
    this.start();
  }

  renderOnce(): void {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  frameScene(): void {
    const box = new THREE.Box3().setFromObject(this.group);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const direction = new THREE.Vector3(1, 0.8, 1.3).normalize();
    const distance = (sphere.radius / Math.tan((this.camera.fov * Math.PI) / 360)) * 1.25;
    this.camera.position.copy(sphere.center).addScaledVector(direction, Math.max(distance, 1));
    this.controls.target.copy(sphere.center);
    this.camera.near = Math.max(0.01, sphere.radius / 100);
    this.camera.far = Math.max(50, distance + sphere.radius * 4);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.framed = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pause();
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.clearObject();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private start(): void {
    if (this.rendering || this.disposed) return;
    this.rendering = true;
    const loop = (): void => {
      if (!this.rendering || this.disposed) return;
      this.frames += 1;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.animationFrame = requestAnimationFrame(loop);
    };
    this.animationFrame = requestAnimationFrame(loop);
  }

  private applyModes(): void {
    applyDisplayMode(this.materials, this.litMaterials, this.mode, this.lightmap);
    applyWireframe(this.materials, this.wireframe);
  }

  private applyCamera(camera: SceneCamera): void {
    this.camera.fov = camera.fov ?? 45;
    this.camera.position.set(camera.position[0], camera.position[1], camera.position[2]);
    this.controls.target.set(camera.target[0], camera.target[1], camera.target[2]);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.framed = true;
  }

  private clearObject(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.geometries.length = 0;
    this.materials.length = 0;
    this.litMaterials.length = 0;
    if (this.lightmap) {
      this.lightmap.dispose();
      this.lightmap = null;
    }
    for (const child of [...this.group.children]) {
      this.group.remove(child);
    }
  }
}

function geometryFor(object: UnwrappedObject): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(object.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(object.normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(object.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(object.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}
