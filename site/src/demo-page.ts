import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import type { UnwrappedObject, UnwrappedScene } from "./atlas/types";
import { chartColor } from "./atlas/stats";
import { resetXAtlasForTests, unwrapScene } from "./atlas/unwrap";
import { createBakeHarness, type BakeHarness } from "./bake/harness";
import {
  BakeError,
  isAbortError,
  type BakeEmissiveObject,
  type BakeEnvironment,
  type BakeLitObject,
  type BakeObject,
  type BakeOptions,
  type BakeProgress,
  type BakeResult,
  type BakeScene
} from "./bake/types";
import { QUALITY_PRESETS, isQuality, PREVIEW_VERSION, type Quality } from "./demos/coverage";
import { loadHdrEnvironment, type LoadedEnvironment } from "./environment/hdr";
import { sectionInfo } from "./demos/sections";
import { sourceFor } from "./demos/sources";
import type { SceneDefinition, SceneMesh } from "./demos/types";
import { ThreeDisplay } from "./display";
import { downloadBlob, el, formatNumber } from "./dom";
import type { Route } from "./router";
import type { View } from "./view";

hljs.registerLanguage("typescript", typescript);

type Tab = "3d" | "atlas" | "code";
type BakeState = "idle" | "baking" | "done" | "error";
type FailureMode = "webgl2" | "float" | "lightmapper" | "xatlas" | "hdri";

interface ShowcaseDebug {
  id: string;
  quality: Quality;
  bounces: number;
  atlas: { width: number; height: number; chartCount: number; utilization: number };
  stats: BakeResult["stats"];
  durationMs: number;
  triangles: number;
  objects: number;
  bakes: number;
}

declare global {
  interface Window {
    __showcase?: ShowcaseDebug;
  }
}

export function createDemoPage(scenario: SceneDefinition, route: Route): View {
  const preview = route.query.get("preview") === "1";
  const forcedFailure = route.query.get("fail") as FailureMode | null;
  const initialQuality: Quality = preview ? "draft" : "standard";
  let quality: Quality = initialQuality;
  let bounces = preview ? 1 : scenario.bake.bounces;
  let tab: Tab = "3d";
  let disposed = false;
  let unwrapped: UnwrappedScene | null = null;
  let harness: BakeHarness | null = null;
  let display: ThreeDisplay | null = null;
  let bakeScene: BakeScene | null = null;
  let result: BakeResult | null = null;
  let abort: AbortController | null = null;
  let bakeCount = 0;
  let state: BakeState = "idle";

  const root = el("section", {
    className: "demo-page",
    dataset: { scenario: scenario.meta.id, bakeState: state }
  });

  const status = el("p", { className: "muted", textContent: "Preparing scene…" });
  const progressLabel = el("span", { textContent: "Preparing" });
  const progressFraction = el("span", { textContent: "0%" });
  const progressFill = el("div", { className: "progress-fill" });
  const stageError = el("div", { className: "stage-message", hidden: true });
  const atlasCanvas = el("canvas");
  const chartCanvas = el("canvas");
  const atlasInfo = el("p", { className: "thumbnail-note", textContent: "" });
  const codeElement = el("code");
  const copyButton = el("button", { className: "button small", type: "button", textContent: "Copy" });
  const errorTitle = el("strong");
  const errorMessage = el("p");

  const bakeButton = el("button", { className: "button primary", type: "button", textContent: "Bake" });
  const cancelButton = el("button", {
    className: "button danger",
    type: "button",
    textContent: "Cancel",
    disabled: true
  });
  const downloadButton = el("button", {
    className: "button",
    type: "button",
    textContent: "Download PNG",
    disabled: true
  });
  const qualitySelect = el("select", { "aria-label": "Bake quality" });
  for (const [id, preset] of Object.entries(QUALITY_PRESETS)) {
    qualitySelect.append(
      el("option", { value: id, textContent: `${preset.label} (H${preset.hemisphereSize})` })
    );
  }
  qualitySelect.value = initialQuality;

  const bouncesInput = el("input", {
    type: "number",
    min: "1",
    max: "6",
    step: "1",
    value: String(bounces),
    "aria-label": "Bounce count"
  });

  const stats: Record<string, HTMLElement> = {};
  const statsGrid = el("div", { className: "stats-grid" });
  for (const [key, label] of [
    ["atlas", "Atlas"],
    ["objects", "Objects"],
    ["charts", "Charts"],
    ["triangles", "Triangles"],
    ["bounces", "Bounces"],
    ["duration", "Duration"],
    ["mean", "Mean"],
    ["max", "Max"],
    ["nonBlack", "Non-black"],
    ["quality", "Quality"]
  ] as const) {
    const value = el("strong", { textContent: "—" });
    stats[key] = value;
    statsGrid.append(el("div", { className: "stat" }, el("span", { textContent: label }), value));
  }

  const tabs = new Map<Tab, HTMLButtonElement>();
  const panels = new Map<Tab, HTMLElement>();
  const tabBar = el("div", { className: "tabs", role: "tablist", "aria-label": "Scene view" });
  for (const [id, label] of [
    ["3d", "3D"],
    ["atlas", "Atlas"],
    ["code", "Code"]
  ] as const) {
    const button = el("button", {
      className: id === tab ? "tab active" : "tab",
      type: "button",
      role: "tab",
      textContent: label,
      dataset: { tab: id },
      "aria-selected": id === tab ? "true" : "false",
      onClick: () => setTab(id)
    });
    tabs.set(id, button);
    tabBar.append(button);
  }

  const viewportHost = el("div", { className: "viewport", dataset: { viewport: "3d" } });
  panels.set(
    "3d",
    el("div", { className: "stage-panel active", dataset: { panel: "3d" } }, viewportHost, stageError)
  );
  panels.set(
    "atlas",
    el(
      "div",
      { className: "stage-panel", dataset: { panel: "atlas" } },
      el(
        "div",
        { className: "atlas-view" },
        el("div", { className: "atlas-frame" }, atlasCanvas, chartCanvas),
        atlasInfo
      )
    )
  );
  panels.set(
    "code",
    el(
      "div",
      { className: "stage-panel", dataset: { panel: "code" } },
      el(
        "div",
        { className: "code-view" },
        el("div", { className: "code-toolbar" }, el("span", { textContent: `${scenario.meta.id}.ts` }), copyButton),
        el("pre", {}, codeElement)
      )
    )
  );

  const stage = el(
    "div",
    { className: "stage" },
    ...Array.from(panels.values()),
    el(
      "div",
      { className: "stage-overlay" },
      el("span", { className: "stage-badge", dataset: { badge: "quality" }, textContent: qualityLabel() }),
      el("span", { className: "stage-badge", dataset: { badge: "atlas" }, textContent: "Atlas —" }),
      el("span", { className: "stage-badge", textContent: "xatlas" })
    ),
    el(
      "div",
      { className: "bake-progress", "aria-live": "polite" },
      el("div", { className: "bake-progress-label" }, progressLabel, progressFraction),
      el("div", { className: "progress-track" }, progressFill)
    )
  );

  const metaBar = el("div", { className: "meta-bar" });
  const metaLabels = el("div", { className: "card-labels" });
  const sectionLabels = new Set(
    scenario.meta.sections.map((section) => sectionInfo(section).label.toLowerCase())
  );
  for (const section of scenario.meta.sections) {
    metaLabels.append(el("span", { className: "label technique", textContent: sectionInfo(section).label }));
  }
  for (const feature of scenario.meta.features) {
    if (!sectionLabels.has(feature.toLowerCase())) {
      metaLabels.append(el("span", { className: "label", textContent: feature }));
    }
  }
  metaBar.append(
    metaLabels,
    el("span", {}, el("strong", { textContent: "Source: " }), `${scenario.meta.id}.ts`),
    el("span", {}, el("strong", { textContent: "Preview: " }), `v${PREVIEW_VERSION}`)
  );

  const aside = el(
    "aside",
    { className: "demo-aside", "aria-label": "Bake controls and statistics" },
    el(
      "section",
      { className: "aside-card" },
      el("h2", { textContent: "Bake controls" }),
      el(
        "div",
        { className: "control-row" },
        el("label", {}, el("span", { textContent: "Quality" }), el("strong", { textContent: "hemisphere size" })),
        qualitySelect
      ),
      el(
        "div",
        { className: "control-row" },
        el("label", {}, el("span", { textContent: "Bounces" }), el("strong", { textContent: "1–6" })),
        bouncesInput
      ),
      el("div", { className: "control-actions" }, bakeButton, cancelButton),
      downloadButton,
      status
    ),
    el(
      "section",
      { className: "aside-card" },
      el("h2", { textContent: "Statistics" }),
      statsGrid
    ),
    el(
      "section",
      { className: "error-panel", role: "alert", dataset: { errorPanel: "1" } },
      errorTitle,
      errorMessage
    )
  );

  root.append(
    el(
      "div",
      { className: "demo-head" },
      el(
        "div",
        {},
        el("a", { className: "back-link", href: "#/", textContent: "← All scenes" }),
        el("p", { className: "eyebrow", textContent: `Scenario / ${scenario.meta.id}` }),
        el("h1", { textContent: scenario.meta.title }),
        el("p", { textContent: scenario.meta.description })
      ),
      el(
        "div",
        { className: "thumbnail-note" },
        preview ? "Preview mode: draft quality, stage only." : "Drag to orbit · scroll to zoom"
      )
    ),
    el("div", { className: "demo-layout" }, el("div", { className: "stage-card" }, tabBar, stage, metaBar), aside)
  );

  if (preview) {
    qualitySelect.disabled = true;
    bouncesInput.disabled = true;
    root.dataset.preview = "1";
  }

  bakeButton.addEventListener("click", () => void runBake());
  cancelButton.addEventListener("click", () => abort?.abort());
  downloadButton.addEventListener("click", downloadLightmap);
  qualitySelect.addEventListener("change", () => {
    const value = qualitySelect.value;
    if (!isQuality(value)) return;
    quality = value;
    updateBadges();
    status.textContent = "Quality changed; bake to apply.";
  });
  bouncesInput.addEventListener("change", () => {
    const value = Number.parseInt(bouncesInput.value, 10);
    bounces = Number.isFinite(value) ? Math.min(6, Math.max(1, value)) : scenario.bake.bounces;
    bouncesInput.value = String(bounces);
    status.textContent = "Bounce count changed; bake to apply.";
  });
  copyButton.addEventListener("click", () => void copySource());

  function setState(next: BakeState): void {
    state = next;
    root.dataset.bakeState = next;
  }

  function qualityLabel(): string {
    return `Quality: ${QUALITY_PRESETS[quality].label}`;
  }

  function updateBadges(): void {
    const badge = root.querySelector<HTMLElement>('[data-badge="quality"]');
    if (badge) badge.textContent = qualityLabel();
    const atlasBadge = root.querySelector<HTMLElement>('[data-badge="atlas"]');
    if (atlasBadge) {
      atlasBadge.textContent = unwrapped
        ? `Atlas ${unwrapped.atlas.width}×${unwrapped.atlas.height}`
        : "Atlas —";
    }
    stats.quality.textContent = QUALITY_PRESETS[quality].label;
  }

  function setTab(next: Tab): void {
    tab = next;
    for (const [id, button] of tabs) {
      const active = id === next;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    }
    for (const [id, panel] of panels) panel.classList.toggle("active", id === next);
    if (next === "atlas") renderAtlas();
    if (next === "code") renderCode();
  }

  function renderCode(): void {
    if (codeElement.dataset.rendered === "1") return;
    const source = sourceFor(scenario.meta.id);
    if (!source) {
      codeElement.textContent = `Source for ${scenario.meta.id} is unavailable.`;
      return;
    }
    codeElement.innerHTML = hljs.highlight(source, { language: "typescript" }).value;
    codeElement.dataset.rendered = "1";
  }

  async function copySource(): Promise<void> {
    const source = sourceFor(scenario.meta.id) ?? "";
    try {
      await navigator.clipboard.writeText(source);
    } catch {
      const area = el("textarea", { value: source });
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    copyButton.textContent = "Copied";
    setTimeout(() => {
      copyButton.textContent = "Copy";
    }, 1200);
  }

  function renderAtlas(): void {
    if (!result || !unwrapped) {
      atlasInfo.textContent = state === "baking" ? "Bake in progress…" : "Bake a lightmap to inspect its atlas.";
      return;
    }
    drawLightmap(atlasCanvas, result);
    drawCharts(chartCanvas, unwrapped, result);
    atlasInfo.textContent = `${unwrapped.atlas.chartCount} charts · ${(
      unwrapped.atlas.utilization * 100
    ).toFixed(1)}% utilized · ${result.width}×${result.height}`;
  }

  function downloadLightmap(): void {
    if (!result) return;
    const canvas = document.createElement("canvas");
    canvas.width = result.width;
    canvas.height = result.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    const image = context.createImageData(result.width, result.height);
    const { width, height, lightmap } = result;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const source = ((height - 1 - y) * width + x) * 4;
        const target = (y * width + x) * 4;
        image.data[target] = toneMap(lightmap[source]);
        image.data[target + 1] = toneMap(lightmap[source + 1]);
        image.data[target + 2] = toneMap(lightmap[source + 2]);
        image.data[target + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${scenario.meta.id}-lightmap.png`);
    }, "image/png");
  }

  function updateProgress(progress: BakeProgress): void {
    progressFill.style.width = `${(progress.fraction * 100).toFixed(1)}%`;
    progressFraction.textContent = `${Math.round(progress.fraction * 100)}%`;
    const stage =
      progress.stage === "bounce"
        ? `Bounce ${progress.bounce}/${progress.bounces} · object ${progress.object + 1}/${progress.objectCount}`
        : progress.stage === "postprocess"
          ? `Post-processing bounce ${progress.bounce}/${progress.bounces}`
          : progress.stage === "readback"
            ? `Reading back bounce ${progress.bounce}/${progress.bounces}`
            : progress.stage === "prepare"
              ? "Preparing GPU buffers"
              : "Finished";
    progressLabel.textContent = stage;
    status.textContent = `${stage} — ${Math.round(progress.fraction * 100)}%`;
  }

  function updateStats(next: BakeResult): void {
    stats.atlas.textContent = `${next.width}×${next.height}`;
    stats.objects.textContent = String(next.objectCount);
    stats.charts.textContent = String(unwrapped?.atlas.chartCount ?? "—");
    stats.triangles.textContent = String(next.triangleCount);
    stats.bounces.textContent = String(next.bounces);
    stats.duration.textContent = `${Math.round(next.durationMs)} ms`;
    stats.mean.textContent = formatNumber(next.stats.mean);
    stats.max.textContent = formatNumber(next.stats.max);
    stats.nonBlack.textContent = `${(next.stats.nonBlackRatio * 100).toFixed(1)}%`;
    stats.quality.textContent = QUALITY_PRESETS[quality].label;
    downloadButton.disabled = false;
  }

  function setBaking(baking: boolean): void {
    bakeButton.disabled = baking || !harness;
    cancelButton.disabled = !baking;
    qualitySelect.disabled = baking || preview;
    bouncesInput.disabled = baking || preview;
  }

  function showError(errorState: string, title: string, message: string): void {
    root.dataset.errorState = errorState;
    setState("error");
    errorTitle.textContent = title;
    errorMessage.textContent = message;
    stageError.hidden = false;
    stageError.textContent = `${title}\n${message}`;
    bakeButton.disabled = true;
    cancelButton.disabled = true;
    downloadButton.disabled = !result;
    status.textContent = "Bake unavailable.";
    display?.pause();
  }

  function clearError(): void {
    delete root.dataset.errorState;
    errorTitle.textContent = "";
    errorMessage.textContent = "";
    stageError.hidden = true;
    stageError.textContent = "";
  }

  function showFailure(mode: FailureMode, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    if (mode === "webgl2") {
      showError("webgl2", "WebGL2 is unavailable", message);
    } else if (mode === "float") {
      showError("ext_color_buffer_float", "EXT_color_buffer_float is missing", message);
    } else if (mode === "lightmapper") {
      showError("lightmapper-wasm", "lightmapper.wasm could not be loaded", message);
    } else if (mode === "hdri") {
      showError("hdri", "HDRI environment could not be loaded", message);
    } else {
      showError("xatlas-wasm", "xatlas.wasm could not be loaded", message);
    }
  }

  function showBakeError(error: unknown): void {
    const code = error instanceof BakeError ? error.code : "gl";
    if (code === "aborted") return;
    if (code === "webgl2") {
      showError("webgl2", "WebGL2 is unavailable", error instanceof Error ? error.message : String(error));
    } else if (code === "float") {
      showError(
        "ext_color_buffer_float",
        "EXT_color_buffer_float is missing",
        error instanceof Error ? error.message : String(error)
      );
    } else if (code === "module") {
      showError(
        "lightmapper-wasm",
        "lightmapper.wasm could not be loaded",
        error instanceof Error ? error.message : String(error)
      );
    } else {
      showError("bake", "Bake failed", error instanceof Error ? error.message : String(error));
    }
  }

  async function runBake(): Promise<void> {
    if (disposed || !harness || !display || !bakeScene || abort) return;
    clearError();
    bakeCount += 1;
    const controller = new AbortController();
    abort = controller;
    setState("baking");
    setBaking(true);
    status.textContent = "Preparing bake…";
    progressFill.style.width = "0%";
    progressFraction.textContent = "0%";
    display.pause();
    let lastResult = result;

    const options: BakeOptions = {
      hemisphereSize: QUALITY_PRESETS[quality].hemisphereSize,
      bounces,
      dilationPasses: scenario.bake.dilationPasses,
      smooth: scenario.bake.smooth ?? true,
      interpolationPasses: scenario.bake.interpolationPasses,
      interpolationThreshold: scenario.bake.interpolationThreshold,
      zNear: scenario.bake.zNear,
      zFar: scenario.bake.zFar,
      signal: controller.signal,
      onProgress: updateProgress,
      onBounce: (bounceResult) => {
        lastResult = bounceResult;
        result = bounceResult;
        display?.updateLightmap(bounceResult);
        updateStats(bounceResult);
      }
    };

    try {
      const final = await harness.bake(bakeScene, options);
      if (disposed) return;
      result = final;
      display.updateLightmap(final);
      updateStats(final);
      setState("done");
      status.textContent = `Bake complete in ${Math.round(final.durationMs)} ms.`;
      window.__showcase = {
        id: scenario.meta.id,
        quality,
        bounces: final.bounces,
        atlas: { ...unwrapped!.atlas },
        stats: final.stats,
        durationMs: final.durationMs,
        triangles: final.triangleCount,
        objects: final.objectCount,
        bakes: bakeCount
      };
      if (tab === "atlas") renderAtlas();
    } catch (error) {
      if (disposed) return;
      if (isAbortError(error) || controller.signal.aborted) {
        status.textContent = lastResult ? "Bake cancelled; previous result kept." : "Bake cancelled.";
        setState(lastResult ? "done" : "idle");
      } else {
        showBakeError(error);
      }
    } finally {
      abort = null;
      setBaking(false);
      if (!disposed) {
        display.resume();
        if (tab === "atlas") renderAtlas();
      }
    }
  }

  async function initialize(): Promise<void> {
    updateBadges();
    setBaking(false);

    if (forcedFailure === "hdri") {
      try {
        await loadHdrEnvironment("/missing-environment.hdr");
      } catch (error) {
        if (!disposed) showFailure("hdri", error);
        return;
      }
    } else if (forcedFailure) {
      try {
        if (forcedFailure === "xatlas") {
          resetXAtlasForTests();
          await unwrapScene(scenario, {
            moduleOptions: { locateFile: () => "/missing-xatlas.wasm" }
          });
        } else {
          await createBakeHarness({
            testHooks: {
              failWebGL2: forcedFailure === "webgl2",
              failFloat: forcedFailure === "float"
            },
            locateWasm:
              forcedFailure === "lightmapper" ? () => "/missing-lightmapper.wasm" : undefined
          });
        }
      } catch (error) {
        if (!disposed) showFailure(forcedFailure, error);
        return;
      }
    }

    try {
      // Preview captures keep the full scene but cap the atlas so the draft
      // bake stays fast on software WebGL2.
      unwrapped = await unwrapScene(scenario, {
        atlasSize: preview ? Math.min(scenario.bake.atlasSize, 512) : scenario.bake.atlasSize
      });
    } catch (error) {
      if (!disposed) {
        showError(
          "xatlas-wasm",
          "xatlas.wasm could not be loaded",
          error instanceof Error ? error.message : String(error)
        );
      }
      return;
    }
    if (disposed) return;

    let loadedEnvironment: LoadedEnvironment | null = null;
    if (scenario.bake.environment) {
      try {
        loadedEnvironment = await loadHdrEnvironment(scenario.bake.environment.url, {
          intensity: scenario.bake.environment.intensity
        });
      } catch (error) {
        if (!disposed) showFailure("hdri", error);
        return;
      }
    }
    if (disposed) return;

    updateBadges();
    stats.atlas.textContent = `${unwrapped.atlas.width}×${unwrapped.atlas.height}`;
    stats.charts.textContent = String(unwrapped.atlas.chartCount);
    stats.objects.textContent = String(unwrapped.litObjects.length + unwrapped.emissiveObjects.length);

    try {
      display = new ThreeDisplay(viewportHost, {
        background: scenario.meta.background ?? null,
        environment: loadedEnvironment?.texture ?? null,
        environmentIntensity: loadedEnvironment?.environment.intensity ?? 1,
        camera: scenario.meta.camera
      });
      display.setScene(unwrapped, undefined, scenario.meta.camera);
      display.pause();
    } catch (error) {
      if (!disposed) {
        showError(
          "three-js",
          "three.js could not start",
          error instanceof Error ? error.message : String(error)
        );
      }
      return;
    }

    try {
      harness = await createBakeHarness({
        locateWasm: forcedFailure === "lightmapper" ? () => "/missing-lightmapper.wasm" : undefined
      });
    } catch (error) {
      if (!disposed) showBakeError(error);
      return;
    }
    if (disposed) return;

    bakeScene = toBakeScene(unwrapped, scenario, loadedEnvironment?.environment);
    setBaking(false);
    status.textContent = "Ready to bake.";
    updateBadges();
    await runBake();
  }

  setTab("3d");
  void initialize().catch((error) => {
    if (!disposed) showBakeError(error);
  });

  return {
    element: root,
    dispose: () => {
      disposed = true;
      abort?.abort();
      abort = null;
      display?.dispose();
      display = null;
      harness?.dispose();
      harness = null;
      delete window.__showcase;
    }
  };
}

function toBakeScene(
  unwrapped: UnwrappedScene,
  scenario: SceneDefinition,
  environment?: BakeEnvironment
): BakeScene {
  const objects: BakeObject[] = [];
  for (const object of unwrapped.litObjects) {
    objects.push({
      kind: "lit",
      name: object.name,
      positions: object.positions,
      normals: object.normals,
      indices: object.indices,
      uvs: object.uvs,
      albedo: object.albedo
    } satisfies BakeLitObject);
  }
  for (const object of unwrapped.emissiveObjects) {
    objects.push(emissiveBakeObject(object));
  }
  const scene: BakeScene = {
    atlas: { width: unwrapped.atlas.width, height: unwrapped.atlas.height },
    ambient: scenario.bake.ambient,
    objects
  };
  if (environment) scene.environment = environment;
  return scene;
}

function emissiveBakeObject(mesh: SceneMesh): BakeEmissiveObject {
  return {
    kind: "emissive",
    name: mesh.name,
    positions: mesh.positions,
    normals: mesh.normals ?? new Float32Array(mesh.positions.length),
    indices: mesh.indices,
    emissive: mesh.emissive ?? [1, 1, 1]
  };
}

function drawLightmap(canvas: HTMLCanvasElement, result: BakeResult): void {
  canvas.width = result.width;
  canvas.height = result.height;
  const context = canvas.getContext("2d");
  if (!context) return;
  const image = context.createImageData(result.width, result.height);
  for (let y = 0; y < result.height; y += 1) {
    for (let x = 0; x < result.width; x += 1) {
      const source = ((result.height - 1 - y) * result.width + x) * 4;
      const target = (y * result.width + x) * 4;
      image.data[target] = toneMap(result.lightmap[source]);
      image.data[target + 1] = toneMap(result.lightmap[source + 1]);
      image.data[target + 2] = toneMap(result.lightmap[source + 2]);
      image.data[target + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
}

function drawCharts(canvas: HTMLCanvasElement, scene: UnwrappedScene, result: BakeResult): void {
  canvas.width = result.width;
  canvas.height = result.height;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);

  const paths = new Map<number, Path2D>();
  for (const object of scene.litObjects) {
    for (let i = 0; i < object.indices.length; i += 3) {
      const a = object.indices[i];
      const b = object.indices[i + 1];
      const c = object.indices[i + 2];
      const chart = object.charts[a];
      let path = paths.get(chart);
      if (!path) {
        path = new Path2D();
        paths.set(chart, path);
      }
      addUvPoint(path, object, a, result, true);
      addUvPoint(path, object, b, result, false);
      addUvPoint(path, object, c, result, false);
      path.closePath();
    }
  }

  for (const [chart, path] of paths) {
    const [r, g, b] = chartColor(chart);
    context.fillStyle = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 0.42)`;
    context.strokeStyle = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 0.85)`;
    context.lineWidth = 0.6;
    context.fill(path);
    context.stroke(path);
  }
}

function addUvPoint(
  path: Path2D,
  object: UnwrappedObject,
  vertex: number,
  result: BakeResult,
  move: boolean
): void {
  const u = object.uvs[vertex * 2];
  const v = object.uvs[vertex * 2 + 1];
  const x = u * result.width;
  const y = (1 - v) * result.height;
  if (move) path.moveTo(x, y);
  else path.lineTo(x, y);
}

function toneMap(value: number): number {
  const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  return Math.round(Math.pow(clamped, 1 / 2.2) * 255);
}
