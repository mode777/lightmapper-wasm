#!/usr/bin/env node
// Report the size and SHA-256 of each wasm build flavour.
//
// Usage:
//   npm run report:artifact
//   node scripts/report-artifact.mjs [path/to/lightmapper_wasm.mjs]
//
// The default flavour emits a separate lightmapper_wasm.wasm beside the
// lightmapper_wasm.mjs glue, so the asset is hashed directly. The opt-in
// single-file flavour (-sSINGLE_FILE=1) embeds the binary as a base64 data
// URI; its payload is extracted and decoded. Both may be reported in one run.
// An explicit module path reports only that module, so single-file-only build
// directories keep working.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_MODULE = resolve(ROOT, "build", "wasm", "wasm", "lightmapper_wasm.mjs");
const DEFAULT_WASM = resolve(ROOT, "build", "wasm", "wasm", "lightmapper_wasm.wasm");
const SINGLE_MODULE = resolve(ROOT, "build", "wasm-single", "wasm", "lightmapper_wasm.mjs");
const distEntry = resolve(ROOT, "dist", "index.js");

function fail(message) {
  console.error(`report-artifact: ${message}`);
  process.exit(1);
}

function label(path) {
  return relative(ROOT, path) || path;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function readEmbeddedWasm(modulePath) {
  const source = readFileSync(modulePath, "utf8");
  const payloads = [...source.matchAll(/data:application\/octet-stream;base64,([A-Za-z0-9+/=]+)/g)]
    .map((match) => match[1])
    .sort((a, b) => b.length - a.length);

  if (payloads.length === 0) {
    fail(
      `no data:application/octet-stream;base64 payload found in ${modulePath}; ` +
        "the build may not be using -sSINGLE_FILE=1",
    );
  }

  const wasm = Buffer.from(payloads[0], "base64");
  if (wasm.length < 4 || wasm.readUInt32BE(0) !== 0x0061736d) {
    fail(`decoded payload in ${modulePath} is not a wasm binary`);
  }
  return wasm;
}

function reportSeparate(wasmPath, modulePath) {
  if (!existsSync(wasmPath)) {
    fail(`missing ${wasmPath}; run "npm run configure:wasm && npm run build:wasm" first`);
  }
  if (!existsSync(modulePath)) {
    fail(`missing ${modulePath}; the separate-asset build must emit the glue module`);
  }

  const wasm = readFileSync(wasmPath);
  console.log(`report-artifact: ${label(wasmPath)} (separate-asset flavour)`);
  console.log(`  wasm bytes:   ${wasm.length}`);
  console.log(`  wasm sha256:  ${sha256(wasm)}`);
  console.log(`  glue .mjs:    ${statSync(modulePath).size} bytes (${label(modulePath)})`);
}

function reportEmbedded(modulePath) {
  if (!existsSync(modulePath)) {
    fail(`missing ${modulePath}; run "npm run configure:wasm:single && npm run build:wasm:single" first`);
  }

  const wasm = readEmbeddedWasm(modulePath);
  console.log(`report-artifact: ${label(modulePath)} (single-file flavour)`);
  console.log(`  glue .mjs:    ${statSync(modulePath).size} bytes`);
  console.log(`  embedded wasm bytes:  ${wasm.length}`);
  console.log(`  embedded wasm sha256: ${sha256(wasm)}`);
}

const explicitModule = process.argv[2] ? resolve(process.argv[2]) : null;

if (explicitModule) {
  if (!existsSync(explicitModule)) {
    fail(`missing ${explicitModule}; run "npm run configure:wasm && npm run build:wasm" first`);
  }
  const siblingWasm = explicitModule.endsWith(".mjs")
    ? `${explicitModule.slice(0, -".mjs".length)}.wasm`
    : null;
  if (siblingWasm && existsSync(siblingWasm)) {
    reportSeparate(siblingWasm, explicitModule);
  } else {
    reportEmbedded(explicitModule);
  }
} else {
  if (!existsSync(DEFAULT_MODULE)) {
    fail(`missing ${DEFAULT_MODULE}; run "npm run configure:wasm && npm run build:wasm" first`);
  }
  if (existsSync(DEFAULT_WASM)) {
    reportSeparate(DEFAULT_WASM, DEFAULT_MODULE);
  } else {
    // Single-file-only build/wasm directory: keep the previous behavior.
    reportEmbedded(DEFAULT_MODULE);
  }
  if (existsSync(SINGLE_MODULE)) {
    reportEmbedded(SINGLE_MODULE);
  }
}

if (existsSync(distEntry)) {
  console.log(`report-artifact: dist`);
  console.log(`  dist/index.js: ${statSync(distEntry).size} bytes`);
} else {
  console.log("report-artifact: dist");
  console.log("  dist/index.js: not built");
}
