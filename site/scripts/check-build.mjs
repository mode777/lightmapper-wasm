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
const HDRI_BYTES = 1_615_248;

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

check("emits the checked-in HDRI asset", () => {
  if (hdriFiles.length !== 1) {
    throw new Error(`expected one .hdr asset, found ${hdriFiles.length}`);
  }
  const { file, name } = { file: hdriFiles[0], name: hdriFiles[0].split("/").pop() };
  if (!/studio_small_09_1k[-.][A-Za-z0-9_-]{6,}\.hdr$/.test(name ?? "")) {
    throw new Error(`HDRI asset does not look content-hashed: ${name}`);
  }
  if (statSync(file).size !== HDRI_BYTES) {
    throw new Error(`HDRI asset has ${statSync(file).size} bytes; expected ${HDRI_BYTES}`);
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

check("built JavaScript references the HDRI asset", () => {
  const scripts = listFiles(DIST).filter((file) => file.endsWith(".js"));
  if (scripts.length === 0) throw new Error("no JavaScript was emitted");
  const source = scripts.map((file) => readFileSync(file, "utf8")).join("\n");
  const file = hdriFiles[0];
  if (!file) throw new Error("HDRI asset is missing");
  const name = file.split("/").pop();
  if (!name || !source.includes(name)) throw new Error(`JavaScript does not reference ${name}`);
  const relativePath = relative(DIST, file).replace(/\\/g, "/");
  const url = `${BASE}${relativePath}`;
  if (!source.includes(url)) throw new Error(`JavaScript does not reference ${url}`);
});

if (failures.length > 0) {
  console.error(`[build-check] FAIL (${failures.length} checks)`);
  process.exitCode = 1;
} else {
  console.log(`[build-check] PASS (${checks.length} checks) — ${DIST}`);
}
