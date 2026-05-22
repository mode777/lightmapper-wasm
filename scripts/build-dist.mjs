import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

const WASM_BUILD_DIR = join(ROOT, "build", "wasm", "wasm");
const WASM_MJS = "lightmapper_wasm.mjs";

// -- clean dist/ -------------------------------------------------------------
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// -- read Emscripten single-file output (contains embedded base64 wasm) ------
let emscriptenSource = readFileSync(join(WASM_BUILD_DIR, WASM_MJS), "utf8");

// Strip the ES module export — we'll reference the function directly
emscriptenSource = emscriptenSource.replace(/export default Module;\s*$/, "");

// -- read & patch index.js ---------------------------------------------------
let indexSrc = readFileSync(join(ROOT, "src", "index.js"), "utf8");

// Remove the DEFAULT_WASM_MODULE_RELATIVE_PATH constant
indexSrc = indexSrc.replace(
  /const DEFAULT_WASM_MODULE_RELATIVE_PATH\s*=\s*"[^"]+";?\n?/,
  ""
);

// Replace the dynamic import fallback with the inlined factory
indexSrc = indexSrc.replace(
  /const moduleFactory = options\.moduleFactory\s*\n?\s*\|\|\s*\(await import\(DEFAULT_WASM_MODULE_RELATIVE_PATH\)\)\.default;/,
  "const moduleFactory = options.moduleFactory || _inlinedModuleFactory;"
);

// Prepend the inlined Emscripten factory at the top of the file
const inlineHeader = `// --- Inlined Emscripten WASM module (single-file, base64-embedded) ---
${emscriptenSource}
const _inlinedModuleFactory = Module;
// --- End inlined module ---

`;

indexSrc = inlineHeader + indexSrc;

writeFileSync(join(DIST, "index.js"), indexSrc, "utf8");

// -- copy type definitions ---------------------------------------------------
cpSync(join(ROOT, "types", "index.d.ts"), join(DIST, "index.d.ts"));

console.log("dist/ assembled successfully (single-file bundle).");
