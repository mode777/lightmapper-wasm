// Validate the assembled production build and its wasm asset references.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const DIST = process.env.CHECK_BUILD_DIST || join(ROOT, "dist");
const BASE = process.env.SITE_BASE || "/";

const failures = [];
const checks = [];

function check(name, body) {
  try {
    body();
    checks.push(name);
    console.log(`[build-check] PASS ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`[build-check] FAIL ${name}: ${error.message}`);
  }
}

function read(path, description) {
  if (!existsSync(path)) throw new Error(`missing ${description}: ${path}`);
  return readFileSync(path);
}

function listFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

function findWasm(prefix) {
  const pattern = new RegExp(`^${prefix}[-.][A-Za-z0-9_-]+\\.wasm$`);
  return listFiles(DIST)
    .filter((file) => pattern.test(file.split("/").pop() ?? ""))
    .map((file) => ({ file, name: file.split("/").pop() }));
}

check("dist/index.html exists", () => {
  read(join(DIST, "index.html"), "index.html");
});

check("index.html contains the app mount and a module script", () => {
  const html = read(join(DIST, "index.html"), "index.html").toString("utf8");
  if (!html.includes('id="app"')) throw new Error("#app mount is missing");
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
  if (scripts.length === 0) throw new Error("no module script is referenced");
  for (const script of scripts) {
    const path = script.startsWith("/") ? join(DIST, script.replace(BASE, "/")) : join(DIST, script);
    if (!existsSync(path)) throw new Error(`referenced script is missing: ${script}`);
  }
});

check("index.html carries the SITE_BASE path", () => {
  if (BASE === "/") return;
  const html = read(join(DIST, "index.html"), "index.html").toString("utf8");
  if (!html.includes(BASE)) throw new Error(`SITE_BASE ${BASE} is not present in index.html`);
  for (const match of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) {
    if (!match[1].startsWith(BASE)) {
      throw new Error(`asset ${match[1]} does not start with ${BASE}`);
    }
  }
});

const lightmapperFiles = findWasm("lightmapper");
const xatlasFiles = findWasm("xatlas");
const hdriFiles = listFiles(DIST).filter((file) => file.endsWith(".hdr"));
const HDRI_ASSETS = [
  { prefix: "studio_small_09_1k", bytes: 1_615_248 },
  { prefix: "kloofendal_48d_partly_cloudy_puresky_1k", bytes: 1_435_119 },
  { prefix: "qwantani_dusk_2_puresky_1k", bytes: 1_166_018 }
];

function findHdriAsset(prefix) {
  const pattern = new RegExp(`^${prefix}[-.][A-Za-z0-9_-]{6,}\\.hdr$`);
  return hdriFiles.find((file) => pattern.test(file.split("/").pop() ?? ""));
}

check("emits a hashed lightmapper.wasm", () => {
  if (lightmapperFiles.length !== 1) {
    throw new Error(`expected one lightmapper wasm asset, found ${lightmapperFiles.length}`);
  }
  const { file, name } = lightmapperFiles[0];
  if (!/[-.][A-Za-z0-9_-]{6,}\.wasm$/.test(name ?? "")) {
    throw new Error(`lightmapper wasm does not look content-hashed: ${name}`);
  }
  if (statSync(file).size <= 0) throw new Error("lightmapper wasm is empty");
});

check("emits a hashed xatlas.wasm", () => {
  if (xatlasFiles.length !== 1) {
    throw new Error(`expected one xatlas wasm asset, found ${xatlasFiles.length}`);
  }
  const { file, name } = xatlasFiles[0];
  if (!/[-.][A-Za-z0-9_-]{6,}\.wasm$/.test(name ?? "")) {
    throw new Error(`xatlas wasm does not look content-hashed: ${name}`);
  }
  if (statSync(file).size <= 0) throw new Error("xatlas wasm is empty");
});

check("emits all three checked-in HDRI assets", () => {
  if (hdriFiles.length !== HDRI_ASSETS.length) {
    throw new Error(`expected ${HDRI_ASSETS.length} .hdr assets, found ${hdriFiles.length}`);
  }
  for (const asset of HDRI_ASSETS) {
    const file = findHdriAsset(asset.prefix);
    if (!file) throw new Error(`missing hashed HDRI asset for ${asset.prefix}`);
    const size = statSync(file).size;
    if (size !== asset.bytes) {
      throw new Error(`${asset.prefix} has ${size} bytes; expected ${asset.bytes}`);
    }
  }
});

check("builds every environment scenario against a checked-in HDRI", () => {
  if (hdriFiles.length !== HDRI_ASSETS.length) {
    throw new Error(
      `expected exactly ${HDRI_ASSETS.length} .hdr assets for the environment scenarios, found ${hdriFiles.length}`
    );
  }
  const scripts = listFiles(DIST).filter((file) => file.endsWith(".js"));
  if (scripts.length === 0) throw new Error("no JavaScript was emitted");
  const source = scripts.map((file) => readFileSync(file, "utf8")).join("\n");
  for (const id of ["hdri-studio", "hdri-outdoor", "hdri-dusk"]) {
    if (!source.includes(id)) {
      throw new Error(`built JavaScript does not reference the ${id} scenario`);
    }
  }
});

check("built JavaScript references both wasm assets", () => {
  const scripts = listFiles(DIST).filter((file) => file.endsWith(".js"));
  if (scripts.length === 0) throw new Error("no JavaScript was emitted");
  const source = scripts.map((file) => readFileSync(file, "utf8")).join("\n");
  for (const { name } of [...lightmapperFiles, ...xatlasFiles]) {
    if (!source.includes(name)) throw new Error(`JavaScript does not reference ${name}`);
  }
  if (BASE !== "/" && !source.includes(`${BASE}assets/`)) {
    throw new Error(`JavaScript does not reference the ${BASE} asset path`);
  }
  for (const { file } of [...lightmapperFiles, ...xatlasFiles]) {
    const relativePath = relative(DIST, file).replace(/\\/g, "/");
    const url = `${BASE}${relativePath}`;
    if (!source.includes(url)) throw new Error(`JavaScript does not reference ${url}`);
  }
});

check("built JavaScript references all three HDRI assets", () => {
  const scripts = listFiles(DIST).filter((file) => file.endsWith(".js"));
  if (scripts.length === 0) throw new Error("no JavaScript was emitted");
  const source = scripts.map((file) => readFileSync(file, "utf8")).join("\n");
  for (const asset of HDRI_ASSETS) {
    const file = findHdriAsset(asset.prefix);
    if (!file) throw new Error(`HDRI asset is missing: ${asset.prefix}`);
    const name = file.split("/").pop();
    if (!name || !source.includes(name)) throw new Error(`JavaScript does not reference ${name}`);
    const relativePath = relative(DIST, file).replace(/\\/g, "/");
    const url = `${BASE}${relativePath}`;
    if (!source.includes(url)) throw new Error(`JavaScript does not reference ${url}`);
  }
});

if (failures.length > 0) {
  console.error(`[build-check] FAIL (${failures.length} checks)`);
  process.exitCode = 1;
} else {
  console.log(`[build-check] PASS (${checks.length} checks) — ${DIST}`);
}
