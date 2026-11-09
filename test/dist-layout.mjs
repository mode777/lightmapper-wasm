import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const TYPES = join(ROOT, "types", "index.d.ts");
const BUILD_WASM = join(ROOT, "build", "wasm", "wasm", "lightmapper_wasm.wasm");
const BASE64_WASM = /data:application\/octet-stream;base64,[A-Za-z0-9+/=]{200,}/;

const checks = [];

function fail(message) {
  throw new Error(message);
}

function check(name, run) {
  run();
  checks.push(name);
}

function readRequired(path, label) {
  if (!existsSync(path)) {
    fail(`${label} missing at ${path}`);
  }
  return readFileSync(path);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

try {
  // -- default entry ---------------------------------------------------------
  const indexEntry = readRequired(join(DIST, "index.js"), "dist/index.js").toString("utf8");

  check("dist/index.js exists", () => {});

  check("dist/index.js exports createLightmapperModule", () => {
    if (!indexEntry.includes("export async function createLightmapperModule")) {
      fail("dist/index.js does not export createLightmapperModule");
    }
  });

  check('dist/index.js rewrites WASM_ASSET_PATH to "./lightmapper.wasm"', () => {
    if (!indexEntry.includes('WASM_ASSET_PATH = "./lightmapper.wasm"')) {
      fail('dist/index.js does not contain WASM_ASSET_PATH = "./lightmapper.wasm"');
    }
    // Bundler asset plugins only rewrite literal new URL() calls, so the
    // published entry must resolve the asset through the literal form.
    if (!indexEntry.includes('new URL("./lightmapper.wasm", import.meta.url)')) {
      fail('dist/index.js does not resolve the asset via the literal new URL("./lightmapper.wasm", import.meta.url)');
    }
    if (indexEntry.includes("new URL(WASM_ASSET_PATH, import.meta.url)")) {
      fail("dist/index.js still resolves the asset through the WASM_ASSET_PATH constant");
    }
  });

  check("dist/index.js embeds no base64 wasm payload", () => {
    if (BASE64_WASM.test(indexEntry)) {
      fail("dist/index.js contains an embedded base64 wasm payload");
    }
  });

  // -- separate asset --------------------------------------------------------
  const distWasm = readRequired(join(DIST, "lightmapper.wasm"), "dist/lightmapper.wasm");
  const buildWasm = readRequired(BUILD_WASM, "emitted build wasm asset");

  check("dist/lightmapper.wasm starts with the wasm magic \\0asm", () => {
    if (distWasm.length < 4 || distWasm.subarray(0, 4).toString("latin1") !== "\0asm") {
      fail("dist/lightmapper.wasm does not start with the wasm magic \\0asm");
    }
  });

  check("dist/lightmapper.wasm is byte-identical to the emitted asset", () => {
    const distHash = sha256(distWasm);
    const buildHash = sha256(buildWasm);
    if (distHash !== buildHash) {
      fail(
        `dist/lightmapper.wasm (sha256 ${distHash}) does not match the emitted asset (sha256 ${buildHash})`
      );
    }
  });

  // -- single-file entry -----------------------------------------------------
  const singleEntry = readRequired(join(DIST, "single.js"), "dist/single.js").toString("utf8");

  check("dist/single.js contains the embedded base64 wasm payload", () => {
    if (!BASE64_WASM.test(singleEntry)) {
      fail("dist/single.js does not contain the embedded base64 wasm payload");
    }
  });

  check("dist/single.js sets the single-file marker true", () => {
    if (!singleEntry.includes("const _singleFileFactory = true;")) {
      fail("dist/single.js does not contain const _singleFileFactory = true;");
    }
  });

  // -- declarations ----------------------------------------------------------
  const typesSource = readRequired(TYPES, "types/index.d.ts");
  const indexTypes = readRequired(join(DIST, "index.d.ts"), "dist/index.d.ts");
  const singleTypes = readRequired(join(DIST, "single.d.ts"), "dist/single.d.ts");

  check("dist/index.d.ts is byte-identical to types/index.d.ts", () => {
    if (!indexTypes.equals(typesSource)) {
      fail("dist/index.d.ts does not match types/index.d.ts");
    }
  });

  check("dist/single.d.ts is byte-identical to types/index.d.ts", () => {
    if (!singleTypes.equals(typesSource)) {
      fail("dist/single.d.ts does not match types/index.d.ts");
    }
  });
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
}

console.log(`PASS: dist layout verified (${checks.length} checks)`);
for (const name of checks) {
  console.log(`  - ${name}`);
}
