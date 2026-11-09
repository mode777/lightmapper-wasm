// Node-only consumer test: pack the tarball, install it into a scratch Vite
// project, build, and assert that the separate wasm asset is emitted beside
// the bundled entry with Vite's default asset handling (no wasm plugin).
//
// No browser and no repository-local installs: every dependency except the
// packed package is installed into a scratch directory under the OS temp dir.

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const BUILD_DIST = join(ROOT, "scripts", "build-dist.mjs");
const DIST_WASM = join(DIST, "lightmapper.wasm");
const OUT_DIR_NAME = "build-out";
const VITE_VERSION = "6.4.5";
const COMMAND_TIMEOUT_MS = 240_000;

const checks = [];
let scratch = "";

function fail(message) {
  throw new Error(message);
}

function check(name, run) {
  run();
  checks.push(name);
  console.log(`PASS: ${name}`);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

async function run(command, args, options = {}) {
  const label = [command, ...args].join(" ");
  try {
    return await execFileAsync(command, args, {
      cwd: options.cwd ?? ROOT,
      env: { ...process.env, CI: "true", NO_COLOR: "1", ...options.env },
      timeout: COMMAND_TIMEOUT_MS,
      killSignal: "SIGKILL",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    const timedOut = error.killed === true || error.signal === "SIGKILL";
    const stdout = error.stdout ? error.stdout.toString() : "";
    const stderr = error.stderr ? error.stderr.toString() : "";
    fail(
      `command failed${timedOut ? ` (timed out after ${COMMAND_TIMEOUT_MS / 1000}s)` : ""}: ${label}\n` +
        `exit: ${error.code ?? error.signal}\n` +
        `--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}\n--- error ---\n${error.message}`
    );
  }
}

const repoPackage = readJson(join(ROOT, "package.json"));
const tarballNamePattern = new RegExp(
  `^${repoPackage.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-.*\\.tgz$`
);

async function main() {
  scratch = mkdtempSync(join(tmpdir(), "lightmapper-wasm-consumer-vite-"));
  console.log(`consumer-vite: scratch directory ${scratch}`);

  // -- 1. assemble dist and pack the tarball --------------------------------
  await run(process.execPath, [BUILD_DIST]);

  check("build-dist assembled the default entry, asset and single entry", () => {
    for (const file of ["index.js", "lightmapper.wasm", "single.js"]) {
      if (!existsSync(join(DIST, file))) {
        fail(`missing dist/${file} after build-dist`);
      }
    }
  });
  const distWasm = readFileSync(DIST_WASM);
  const distWasmHash = sha256(distWasm);

  // `npm pack --pack-destination` does not run the custom "pack" script (npm
  // only auto-runs prepack/prepare here); build-dist above is the explicit
  // assembly step, matching `npm run pack` minus its destination choice.
  await run("npm", ["pack", "--pack-destination", scratch]);

  const tarballs = readdirSync(scratch).filter((name) => tarballNamePattern.test(name));
  if (tarballs.length !== 1) {
    fail(`expected exactly one packed tarball in ${scratch}, found ${tarballs.length}`);
  }
  const tarball = join(scratch, tarballs[0]);
  console.log(`consumer-vite: packed ${basename(tarball)}`);

  const tarList = (await run("tar", ["tzf", tarball])).stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const requiredEntries = [
    "package/dist/index.js",
    "package/dist/lightmapper.wasm",
    "package/dist/single.js",
    "package/dist/index.d.ts",
    "package/dist/single.d.ts",
    "package/README.md",
    "package/LIGHTMAPPER.md",
    "package/WASM_SETUP.md",
    "package/LICENSE",
  ];
  const forbiddenPrefixes = [
    "package/build/",
    "package/src/",
    "package/wasm/",
    "package/examples/",
    "package/test/",
    "package/openspec/",
    "package/docs/",
    "package/node_modules/",
  ];

  check("tarball contains both entries, the asset and the declarations", () => {
    for (const entry of requiredEntries) {
      if (!tarList.includes(entry)) {
        fail(`tarball is missing ${entry}`);
      }
    }
  });

  check("tarball contains no build tree, sources, tests or planning files", () => {
    for (const entry of tarList) {
      const forbidden = forbiddenPrefixes.find((prefix) => entry.startsWith(prefix));
      if (forbidden) {
        fail(`tarball leaks ${entry} (forbidden prefix ${forbidden})`);
      }
    }
  });

  const packedManifest = JSON.parse(
    (await run("tar", ["xOzf", tarball, "package/package.json"])).stdout
  );

  check("tarball embeds the packaged manifest with the ./single export", () => {
    const single = packedManifest.exports && packedManifest.exports["./single"];
    if (!single || single.default !== "./dist/single.js" || single.types !== "./dist/single.d.ts") {
      fail('packaged package.json does not map "./single" to dist/single.js + dist/single.d.ts');
    }
  });

  // -- 2. scaffold the scratch Vite consumer --------------------------------
  const project = join(scratch, "project");
  mkdirSync(join(project, "src"), { recursive: true });

  writeFileSync(
    join(project, "package.json"),
    `${JSON.stringify(
      {
        name: "lightmapper-wasm-consumer-scratch",
        version: "0.0.0",
        private: true,
        type: "module",
        dependencies: {
          [repoPackage.name]: `file:${tarball}`,
        },
        devDependencies: {
          vite: VITE_VERSION,
        },
      },
      null,
      2
    )}\n`
  );
  writeFileSync(
    join(project, "index.html"),
    '<!doctype html>\n<html>\n  <body>\n    <script type="module" src="/src/main.js"></script>\n  </body>\n</html>\n'
  );
  writeFileSync(
    join(project, "src", "main.js"),
    [
      'import { createLightmapperModule } from "lightmapper-wasm";',
      "",
      "globalThis.createLightmapperModule = createLightmapperModule;",
      'console.log("lightmapper-wasm entry:", typeof createLightmapperModule);',
      "",
    ].join("\n")
  );
  writeFileSync(
    join(project, "vite.config.js"),
    [
      'import { defineConfig } from "vite";',
      "",
      "// Default asset handling on purpose: the packed entry is expected to make",
      "// Vite emit the wasm through new URL(..., import.meta.url).",
      "export default defineConfig({",
      "  build: {",
      `    outDir: "${OUT_DIR_NAME}",`,
      "    emptyOutDir: true,",
      "  },",
      "});",
      "",
    ].join("\n")
  );

  // -- 3. install the tarball and Vite in the scratch project ---------------
  try {
    await run("npm", ["install", "--no-audit", "--no-fund"], { cwd: project });
  } catch (error) {
    fail(
      `npm install failed in the scratch project (is the npm registry reachable?):\n${error.message}`
    );
  }

  check("scratch project installed the packed package", () => {
    if (!existsSync(join(project, "node_modules", repoPackage.name, "package.json"))) {
      fail("npm install did not create the expected node_modules/lightmapper-wasm");
    }
  });

  const installedVite = readJson(join(project, "node_modules", "vite", "package.json")).version;
  console.log(`consumer-vite: installed vite ${installedVite} (scratch devDependency only)`);

  // -- 4. assert the tarball-installed package layout on disk --------------
  const installedDist = join(project, "node_modules", repoPackage.name, "dist");

  check("installed package keeps dist/lightmapper.wasm beside index.js and single.js", () => {
    for (const file of ["index.js", "single.js", "index.d.ts", "single.d.ts", "lightmapper.wasm"]) {
      if (!existsSync(join(installedDist, file))) {
        fail(`installed package is missing dist/${file}`);
      }
    }
    const installedWasm = readFileSync(join(installedDist, "lightmapper.wasm"));
    if (sha256(installedWasm) !== distWasmHash) {
      fail("installed dist/lightmapper.wasm does not match the repository dist asset");
    }
  });

  check("installed package manifest maps ./single to the single-file entry", () => {
    const manifest = readJson(join(project, "node_modules", repoPackage.name, "package.json"));
    const single = manifest.exports && manifest.exports["./single"];
    if (!single || single.default !== "./dist/single.js" || single.types !== "./dist/single.d.ts") {
      fail('installed package.json does not map "./single" to dist/single.js + dist/single.d.ts');
    }
  });

  // -- 5. build the consumer with Vite --------------------------------------
  const viteBin = join(project, "node_modules", "vite", "bin", "vite.js");
  await run(process.execPath, [viteBin, "build"], { cwd: project });

  const outDir = join(project, OUT_DIR_NAME);
  check("vite build emits the consumer output directory", () => {
    if (!existsSync(outDir) || !statSync(outDir).isDirectory()) {
      fail(`vite build did not create ${outDir}`);
    }
  });

  const outputFiles = walk(outDir);
  const jsFiles = outputFiles.filter((file) => file.endsWith(".js"));
  if (jsFiles.length === 0) {
    fail("vite build produced no JavaScript bundle");
  }
  const bundledJs = jsFiles.map((file) => readFileSync(file, "utf8")).join("\n");

  check("bundled JavaScript contains the lightmapper loader", () => {
    if (!bundledJs.includes("createLightmapperModule")) {
      fail("bundled JavaScript does not reference createLightmapperModule");
    }
    if (!bundledJs.includes("Failed to fetch lightmapper wasm at")) {
      fail("bundled JavaScript does not contain the loader's wasm error message");
    }
  });

  check("built HTML references the bundled entry module", () => {
    const html = readFileSync(join(outDir, "index.html"), "utf8");
    for (const file of jsFiles) {
      if (!html.includes(basename(file))) {
        fail(`index.html does not reference ${basename(file)}`);
      }
    }
  });

  const wasmAssets = outputFiles.filter((file) => file.endsWith(".wasm"));
  check("vite emits exactly one hashed .wasm asset", () => {
    if (wasmAssets.length !== 1) {
      fail(
        `expected one emitted .wasm asset, found ${wasmAssets.length}. ` +
          `Vite's asset plugin only rewrites new URL("literal", import.meta.url); ` +
          `check that the packaged entry resolves the asset with a string literal.`
      );
    }
    if (!/^[A-Za-z0-9_-]*-[A-Za-z0-9_-]{6,}\.wasm$/.test(basename(wasmAssets[0]))) {
      fail(`emitted asset is not content-hashed: ${basename(wasmAssets[0])}`);
    }
  });

  const emittedWasm = readFileSync(wasmAssets[0]);
  check("emitted .wasm is byte-identical to dist/lightmapper.wasm", () => {
    if (emittedWasm.length !== distWasm.length) {
      fail(
        `emitted .wasm is ${emittedWasm.length} bytes, expected ${distWasm.length} (dist/lightmapper.wasm)`
      );
    }
    if (sha256(emittedWasm) !== distWasmHash) {
      fail("emitted .wasm sha256 does not match dist/lightmapper.wasm");
    }
  });

  check("built JavaScript references the emitted .wasm asset", () => {
    const assetName = basename(wasmAssets[0]);
    if (!bundledJs.includes(assetName)) {
      fail(`bundled JavaScript does not reference the emitted asset ${assetName}`);
    }
  });

  console.log(`consumer-vite: all ${checks.length} checks passed`);
}

try {
  await main();
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  if (scratch) {
    console.error(`consumer-vite: scratch kept for debugging at ${scratch}`);
  }
  process.exitCode = 1;
} finally {
  if (process.exitCode !== 1 && scratch) {
    rmSync(scratch, { recursive: true, force: true });
    console.log("consumer-vite: scratch directory removed");
  }
}
