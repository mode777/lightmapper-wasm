import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SCENARIOS } from "../src/demos";
import {
  EXPECTED_SCENARIO_IDS,
  PREVIEW_VERSION,
  SHARED_SOURCE_FILES,
  THUMBNAIL_DIR,
  THUMBNAIL_MANIFEST,
  THUMBNAIL_SETTINGS
} from "../src/demos/coverage";
import { SHARED_FILES, sourceFilesFor, sourceHash } from "../scripts/source-hash.mjs";

interface ManifestEntry {
  file: string;
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
  sourceHash: string;
  previewVersion: number;
  capturedAt: string;
}

interface Manifest {
  version: number;
  previewVersion: number;
  settings: {
    width: number;
    height: number;
    dpr: number;
    format: string;
    quality: number;
  };
  scenarios: Record<string, ManifestEntry>;
}

const SITE_ROOT = new URL("..", import.meta.url).pathname;
const PREVIEW_DIR = join(SITE_ROOT, THUMBNAIL_DIR);
const MANIFEST_PATH = join(SITE_ROOT, THUMBNAIL_MANIFEST);
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;

function webpSize(buffer: Buffer): { width: number; height: number } {
  expect(buffer.toString("ascii", 0, 4)).toBe("RIFF");
  expect(buffer.toString("ascii", 8, 12)).toBe("WEBP");
  const chunk = buffer.toString("ascii", 12, 16);

  if (chunk === "VP8X") {
    return {
      width: buffer.readUIntLE(24, 3) + 1,
      height: buffer.readUIntLE(27, 3) + 1
    };
  }
  if (chunk === "VP8 ") {
    expect(buffer[23]).toBe(0x9d);
    expect(buffer[24]).toBe(0x01);
    expect(buffer[25]).toBe(0x2a);
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff
    };
  }
  if (chunk === "VP8L") {
    expect(buffer[20]).toBe(0x2f);
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1
    };
  }
  throw new Error(`unsupported WebP chunk ${chunk}`);
}

describe("thumbnail manifest", () => {
  it("records the capture settings and preview version", () => {
    expect(manifest.version).toBe(1);
    expect(manifest.previewVersion).toBe(PREVIEW_VERSION);
    expect(manifest.settings).toEqual({
      width: THUMBNAIL_SETTINGS.width,
      height: THUMBNAIL_SETTINGS.height,
      dpr: THUMBNAIL_SETTINGS.dpr,
      format: THUMBNAIL_SETTINGS.format,
      quality: THUMBNAIL_SETTINGS.quality
    });
  });

  it("covers the catalog in order with a source hash per scenario", () => {
    expect(Object.keys(manifest.scenarios)).toEqual([...EXPECTED_SCENARIO_IDS]);
    expect(SCENARIOS.map((scenario) => scenario.meta.id)).toEqual([...EXPECTED_SCENARIO_IDS]);
    for (const scenario of SCENARIOS) {
      const entry = manifest.scenarios[scenario.meta.id];
      expect(entry, scenario.meta.id).toBeDefined();
      expect(entry.width).toBe(THUMBNAIL_SETTINGS.width);
      expect(entry.height).toBe(THUMBNAIL_SETTINGS.height);
      expect(entry.pixelWidth).toBe(THUMBNAIL_SETTINGS.width * THUMBNAIL_SETTINGS.dpr);
      expect(entry.pixelHeight).toBe(THUMBNAIL_SETTINGS.height * THUMBNAIL_SETTINGS.dpr);
      expect(entry.previewVersion).toBe(PREVIEW_VERSION);
      expect(entry.sourceHash).toBe(sourceHash(scenario.meta.id));
      expect(entry.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("has one non-empty WebP with matching dimensions per scenario", () => {
    for (const [id, entry] of Object.entries(manifest.scenarios)) {
      const file = join(PREVIEW_DIR, entry.file);
      expect(existsSync(file), `${id} thumbnail is missing`).toBe(true);
      expect(statSync(file).size).toBeGreaterThan(1024);
      const size = webpSize(readFileSync(file));
      expect(size.width, `${id} width`).toBe(entry.pixelWidth);
      expect(size.height, `${id} height`).toBe(entry.pixelHeight);
    }
  });

  it("detects source-hash drift and preview-version drift", () => {
    expect(manifest.scenarios["tabletop-atlas"].sourceHash).toBe(sourceHash("tabletop-atlas"));
    expect(manifest.scenarios["tabletop-atlas"].sourceHash).not.toBe(sourceHash("cornell-box"));
    expect(manifest.previewVersion).toBe(PREVIEW_VERSION);
    expect(SHARED_FILES).toEqual([...SHARED_SOURCE_FILES]);
  });

  it("includes the checked-in HDRI in the hdri-studio source hash", () => {
    const environment = "src/assets/environments/studio_small_09_1k.hdr";
    expect(sourceFilesFor("hdri-studio")).toContain(environment);
    expect(sourceFilesFor("cornell-box")).not.toContain(environment);
    expect(sourceHash("hdri-studio")).not.toBe(sourceHash("cornell-box"));
  });

  it("has no orphan thumbnail images", () => {
    const referenced = new Set(Object.values(manifest.scenarios).map((entry) => entry.file));
    const images = readdirSync(PREVIEW_DIR).filter((file) => file.endsWith(".webp"));
    expect(images.sort()).toEqual([...referenced].sort());
  });

  it("keeps the CSS fallback for missing thumbnails", () => {
    const gallery = readFileSync(new URL("../src/gallery.ts", import.meta.url), "utf8");
    const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
    expect(gallery).toContain("card-fallback");
    expect(gallery).toContain('addEventListener("error"');
    expect(styles).toMatch(/\.card-fallback\s*\{/);
  });
});
