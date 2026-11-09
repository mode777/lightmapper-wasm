import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

const DEFAULT_BUILD_DIR = join(ROOT, "build", "wasm", "wasm");
const SINGLE_BUILD_DIR = join(ROOT, "build", "wasm-single", "wasm");
const GLUE_FILE = "lightmapper_wasm.mjs";
const WASM_FILE = "lightmapper_wasm.wasm";
const LOADER_FILE = join(ROOT, "src", "index.js");
const TYPES_FILE = join(ROOT, "types", "index.d.ts");

function fail(message) {
  throw new Error(`build-dist: ${message}`);
}

function readRequired(path, description) {
  if (!existsSync(path)) {
    fail(`missing ${description}: ${path}`);
  }
  return readFileSync(path);
}

// Replace exactly once or fail the build naming the replacement. Zero matches
// means the input drifted; multiple matches mean the patch would be ambiguous.
function assertReplace(source, pattern, replacement, name) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matches = [...source.matchAll(new RegExp(pattern.source, flags))];
  if (matches.length !== 1) {
    fail(`${name}: expected exactly one match, found ${matches.length}`);
  }
  return source.replace(pattern, replacement);
}

// Strip the Emscripten ES module export; dist inlines the factory directly.
function inlineFactory(glueSource, label) {
  const stripped = assertReplace(
    glueSource,
    /export default Module;\s*$/,
    "",
    `${label} export default strip`
  );

  return `// --- Inlined Emscripten WASM module (${label}) ---
${stripped}
const _inlinedModuleFactory = Module;
// --- End inlined module ---

`;
}

// The default-flavour glue resolves its own (never-taken) fetch path against
// the build-output filename; retarget it to the published asset so bundlers
// see one consistent literal and do not warn about a missing file.
function retargetGlueAssetLiteral(glueSource) {
  return assertReplace(
    glueSource,
    /new URL\("lightmapper_wasm\.wasm",\s*import\.meta\.url\)/,
    'new URL("./lightmapper.wasm", import.meta.url)',
    "glue asset literal retarget"
  );
}

function patchLoader(loaderSource, { singleFile }) {
  let patched = loaderSource;

  patched = assertReplace(
    patched,
    /const DEFAULT_WASM_MODULE_RELATIVE_PATH\s*=\s*"[^"]+";?\n?/,
    "",
    "DEFAULT_WASM_MODULE_RELATIVE_PATH removal"
  );

  patched = assertReplace(
    patched,
    /const moduleFactory = options\.moduleFactory\s*\n?\s*\|\|\s*\(await import\(DEFAULT_WASM_MODULE_RELATIVE_PATH\)\)\.default;/,
    "const moduleFactory = _inlinedModuleFactory;",
    "dynamic import fallback replacement"
  );

  if (singleFile) {
    patched = assertReplace(
      patched,
      /var _singleFileFactory = false;/,
      "const _singleFileFactory = true;",
      "single-file factory marker"
    );
  } else {
    patched = assertReplace(
      patched,
      /const WASM_ASSET_PATH = "[^"]+";/,
      'const WASM_ASSET_PATH = "./lightmapper.wasm";',
      "WASM_ASSET_PATH rewrite"
    );

    // Bundler asset plugins only rewrite literal new URL("<path>",
    // import.meta.url) calls, so the default entry must resolve the asset
    // with the literal, not through the constant.
    patched = assertReplace(
      patched,
      /new URL\(WASM_ASSET_PATH, import\.meta\.url\)/,
      'new URL("./lightmapper.wasm", import.meta.url)',
      "WASM asset URL literal rewrite"
    );

    // The default entry keeps the embedded-flavour marker false; assert it is
    // present so both entries are assembled from the same loader source.
    patched = assertReplace(
      patched,
      /var _singleFileFactory = false;/,
      "var _singleFileFactory = false;",
      "single-file factory marker"
    );
  }

  return patched;
}

// -- clean dist/ -------------------------------------------------------------
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// -- read inputs (both flavours required) ------------------------------------
const defaultGlue = readRequired(
  join(DEFAULT_BUILD_DIR, GLUE_FILE),
  "default flavour Emscripten glue"
).toString("utf8");
const defaultWasm = readRequired(
  join(DEFAULT_BUILD_DIR, WASM_FILE),
  "default flavour wasm asset"
);
const singleGlue = readRequired(
  join(SINGLE_BUILD_DIR, GLUE_FILE),
  "single-file flavour Emscripten glue"
).toString("utf8");
const loaderSource = readRequired(LOADER_FILE, "loader source").toString("utf8");
const typesSource = readRequired(TYPES_FILE, "type declarations");

// -- default entry: inlined glue + separate .wasm asset ----------------------
const indexEntry = inlineFactory(retargetGlueAssetLiteral(defaultGlue), "separate wasm asset")
  + patchLoader(loaderSource, { singleFile: false });
writeFileSync(join(DIST, "index.js"), indexEntry, "utf8");

cpSync(join(DEFAULT_BUILD_DIR, WASM_FILE), join(DIST, "lightmapper.wasm"));
const copiedWasm = readFileSync(join(DIST, "lightmapper.wasm"));
if (!copiedWasm.equals(defaultWasm)) {
  fail("dist/lightmapper.wasm is not byte-identical to the emitted wasm asset");
}

// -- single-file entry: embedded base64 payload, marker skips resolution -----
const singleEntry = inlineFactory(singleGlue, "single-file bundle")
  + patchLoader(loaderSource, { singleFile: true });
writeFileSync(join(DIST, "single.js"), singleEntry, "utf8");

// -- copy type definitions ---------------------------------------------------
cpSync(TYPES_FILE, join(DIST, "index.d.ts"));
cpSync(TYPES_FILE, join(DIST, "single.d.ts"));

console.log(
  "dist/ assembled: index.js + lightmapper.wasm + single.js + index.d.ts + single.d.ts."
);
