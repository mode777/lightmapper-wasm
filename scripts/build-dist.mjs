import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

const WASM_BUILD_DIR = join(ROOT, "build", "wasm", "wasm");
const WASM_MJS = "lightmapper_wasm.mjs";
const WASM_BIN = "lightmapper_wasm.wasm";

// -- clean dist/ -------------------------------------------------------------
rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, "wasm"), { recursive: true });

// -- copy WASM artefacts -----------------------------------------------------
cpSync(join(WASM_BUILD_DIR, WASM_MJS), join(DIST, "wasm", WASM_MJS));
cpSync(join(WASM_BUILD_DIR, WASM_BIN), join(DIST, "wasm", WASM_BIN));

// -- copy & patch index.js ---------------------------------------------------
let indexSrc = readFileSync(join(ROOT, "src", "index.js"), "utf8");

// Rewrite the default WASM path so it resolves relative to dist/index.js
indexSrc = indexSrc.replace(
  /const DEFAULT_WASM_MODULE_RELATIVE_PATH\s*=\s*"[^"]+";/,
  'const DEFAULT_WASM_MODULE_RELATIVE_PATH = "./wasm/lightmapper_wasm.mjs";'
);

writeFileSync(join(DIST, "index.js"), indexSrc, "utf8");

// -- copy type definitions ---------------------------------------------------
cpSync(join(ROOT, "types", "index.d.ts"), join(DIST, "index.d.ts"));

console.log("dist/ assembled successfully.");
