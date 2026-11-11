// Root package must not leak the private studio package or its dependencies.
//
//   node test/studio-pack.test.mjs

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function check(name, run) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    fail(`${name}: ${error.message}`);
  }
}

const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
const pack = JSON.parse(
  execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  })
);
const entry = pack[0];
const files = entry.files.map((file) => file.path);
const paths = files.join("\n");

check("root exports stay at the default and single-file entries", () => {
  assert.deepEqual(Object.keys(pkg.exports).sort(), [".", "./single"]);
});

check("root package has no runtime dependencies", () => {
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.optionalDependencies, undefined);
  assert.equal(pkg.peerDependencies, undefined);
});

check("tarball excludes the private studio package", () => {
  assert.equal(paths.includes("studio/"), false);
  assert.equal(files.some((file) => file.startsWith("studio/")), false);
});

check("tarball excludes studio dependencies and entries", () => {
  assert.equal(paths.includes("xatlas-wasm"), false);
  assert.equal(paths.includes("lightmap-studio"), false);
  assert.equal(files.some((file) => file.includes("studio")), false);
});

check("tarball contains the existing published entry and asset", () => {
  assert.ok(files.includes("dist/index.js"));
  assert.ok(files.includes("dist/lightmapper.wasm"));
  assert.ok(files.includes("dist/index.d.ts"));
  assert.ok(files.includes("LICENSE"));
});

if (process.exitCode) process.exit(process.exitCode);
console.log("Root pack boundary test PASS");
