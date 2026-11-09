#!/usr/bin/env node
// Reject an Emscripten toolchain other than the pinned 3.1.64 release.
//
// Usage:
//   npm run check:emsdk
//   EMCC=/path/to/emcc node scripts/check-emsdk.mjs
//
// The check runs before CMake configures a build directory, so a mismatched
// toolchain fails without leaving a partial build behind. See AD-008.

import { spawnSync } from "node:child_process";

const EXPECTED = "3.1.64";
const emcc = process.env.EMCC || "emcc";

const result = spawnSync(emcc, ["--version"], { encoding: "utf8" });

if (result.error) {
  console.error(
    `check-emsdk: could not run ${emcc}: ${result.error.message}\n` +
      `Activate Emscripten ${EXPECTED} first (see WASM_SETUP.md).`,
  );
  process.exit(1);
}

const output = `${result.stdout || ""}${result.stderr || ""}`;
const version = output.match(/\b(\d+\.\d+\.\d+)\b/);

if (result.status !== 0 || !version) {
  console.error(
    `check-emsdk: could not parse the version from \`${emcc} --version\` ` +
      `(exit ${result.status}). Expected Emscripten ${EXPECTED}.`,
  );
  process.exit(1);
}

if (version[1] !== EXPECTED) {
  console.error(
    `check-emsdk: expected Emscripten ${EXPECTED}, found ${version[1]}.\n` +
      "Install and activate the pinned toolchain (see AD-008 and WASM_SETUP.md).",
  );
  process.exit(1);
}

console.log(`check-emsdk: Emscripten ${version[1]} (expected ${EXPECTED})`);
