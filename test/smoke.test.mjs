// Node smoke test for lightmapper-wasm.
//
// Plain Node (no test framework). Requires a WASM build at
// build/wasm/wasm/lightmapper_wasm.mjs (`npm run rebuild:wasm`, needs emsdk).
//
// The capability probe (EXT_color_buffer_float / RGBA32F readPixels) throws in
// Node, so we skip it and hand the wrapper a minimal stub GL object. Heap
// helpers and constants do not need GL; GL-dependent calls must fail cleanly
// through strict context binding.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createLightmapperModule } from "../src/index.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WASM_MODULE_PATH = resolve(ROOT, "build/wasm/wasm/lightmapper_wasm.mjs");
const WASM_BINARY_PATH = resolve(ROOT, "build/wasm/wasm/lightmapper_wasm.wasm");

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

function expectThrows(fn, matcher) {
  assert.throws(fn, matcher);
}

console.log("Lightmapper WASM smoke test");

if (!existsSync(WASM_MODULE_PATH) || !existsSync(WASM_BINARY_PATH)) {
  console.error(`FAIL missing WASM build: ${WASM_MODULE_PATH} / ${WASM_BINARY_PATH}`);
  console.error("     Run `npm run configure:wasm && npm run build:wasm` first (requires emsdk).");
  process.exit(1);
}

// The shipped artifact is intentionally built with `-sENVIRONMENT=web`
// (browser-only); Emscripten's shell preamble aborts the import in Node when
// `window` is undefined. Nothing here touches real WebGL (capability check is
// skipped and the stub context is never registered), so a minimal `window`
// global is sufficient for the module to instantiate in Node.
if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis;
}

const { default: moduleFactory } = await import(pathToFileURL(WASM_MODULE_PATH).href);
assert.equal(typeof moduleFactory, "function", "Emscripten module must default-export a factory function");

// Minimal WebGL2 stub. Only used so createLightmapperModule() can resolve a
// context object; skipCapabilityCheck prevents any real GL calls.
const stubWebGLContext = {
  getContextAttributes: () => ({ antialias: false }),
  getExtension: () => null
};

const lm = await createLightmapperModule({
  skipCapabilityCheck: true,
  webglContext: stubWebGLContext,
  // Keep strict binding on, but never let Emscripten try to wrap the stub.
  autoRegisterEmscriptenContext: false,
  moduleFactory,
  // The default build ships a separate .wasm asset and the loader skips asset
  // resolution when a custom moduleFactory is supplied. Hand the factory the
  // bytes directly: Node's fetch does not support file:// URLs.
  wasmModuleOptions: { wasmBinary: new Uint8Array(readFileSync(WASM_BINARY_PATH)) }
});

console.log("Module initialized (capability check skipped, stub WebGL2 context).");

check("constants match LIGHTMAPPER.md values", () => {
  const expected = {
    LM_NONE: 0x0000,
    LM_UNSIGNED_BYTE: 0x1401,
    LM_UNSIGNED_SHORT: 0x1403,
    LM_UNSIGNED_INT: 0x1405,
    LM_FLOAT: 0x1406,
    LM_FALSE: 0,
    LM_TRUE: 1,
    LM_ALL_CHANNELS: 0x0f
  };
  for (const [name, value] of Object.entries(expected)) {
    assert.equal(lm[name], value, `${name}: expected ${value}, got ${lm[name]}`);
  }
});

check("allocF32/allocU8/allocU16/allocU32 return increasing, sane pointers", () => {
  const pF32 = lm.allocF32(16);
  const pU8 = lm.allocU8(16);
  const pU16 = lm.allocU16(16);
  const pU32 = lm.allocU32(16);
  try {
    for (const [name, ptr] of Object.entries({ pF32, pU8, pU16, pU32 })) {
      assert.ok(Number.isInteger(ptr) && ptr > 0, `${name} must be a positive integer pointer, got ${ptr}`);
    }
    assert.ok(pU8 >= pF32 + 16 * 4, `pU8 (${pU8}) should be above the 64-byte pF32 block (${pF32})`);
    assert.ok(pU16 >= pU8 + 16, `pU16 (${pU16}) should be above the 16-byte pU8 block (${pU8})`);
    assert.ok(pU32 >= pU16 + 16 * 2, `pU32 (${pU32}) should be above the 32-byte pU16 block (${pU16})`);
  } finally {
    lm.free(pF32);
    lm.free(pU8);
    lm.free(pU16);
    lm.free(pU32);
  }
});

check("viewF32/viewU8 round-trip through copyToHeap/copyFromHeap", () => {
  const pattern = new Float32Array([1.5, -2.25, 3.125, 0, 42, -0.5, 0.001, 123.456]);
  const ptr = lm.copyToHeap(pattern);
  try {
    assert.deepEqual(Array.from(lm.viewF32(ptr, pattern.length)), Array.from(pattern));
    const readBack = lm.copyFromHeap(ptr, new Float32Array(pattern.length));
    assert.deepEqual(Array.from(readBack), Array.from(pattern));

    // Writes through viewF32 must hit the same heap memory.
    lm.viewF32(ptr, pattern.length)[0] = 9.75;
    assert.equal(lm.viewF32(ptr, 1)[0], 9.75);
  } finally {
    lm.free(ptr);
  }

  const bytes = new Uint8Array([0, 1, 2, 253, 254, 255, 7, 8]);
  const bytePtr = lm.copyToHeap(bytes);
  try {
    assert.deepEqual(Array.from(lm.viewU8(bytePtr, bytes.length)), Array.from(bytes));
    assert.deepEqual(Array.from(lm.copyFromHeap(bytePtr, new Uint8Array(bytes.length))), Array.from(bytes));
  } finally {
    lm.free(bytePtr);
  }
});

check("makeBeginFrameBuffers allocates readable buffers and disposes cleanly", () => {
  const buffers = lm.makeBeginFrameBuffers();
  try {
    for (const [name, ptr] of Object.entries({
      viewportPtr: buffers.viewportPtr,
      viewPtr: buffers.viewPtr,
      projectionPtr: buffers.projectionPtr
    })) {
      assert.ok(Number.isInteger(ptr) && ptr > 0, `${name} must be a positive pointer, got ${ptr}`);
    }
    assert.equal(buffers.readViewport().length, 4);
    assert.equal(buffers.readViewMatrix().length, 16);
    assert.equal(buffers.readProjectionMatrix().length, 16);
  } finally {
    buffers.dispose();
  }
});

check("negative: allocF32(0) throws", () => {
  expectThrows(() => lm.allocF32(0), /positive integer/i);
});

check("negative: copyToHeap(Int8Array) throws", () => {
  expectThrows(() => lm.copyToHeap(new Int8Array(4)), /Float32Array, Uint8Array, Uint16Array, and Uint32Array/);
});

check("negative: lmCreate without a bound context throws a context-binding error", () => {
  expectThrows(
    () => lm.lmCreate(64, 0.001, 100.0, 0, 0, 0, 2, 0.01, 0.0),
    (error) => {
      assert.match(error.message, /context/i);
      assert.match(error.message, /Strict context binding/i);
      return true;
    }
  );
});

check("negative: free(-1) throws", () => {
  expectThrows(() => lm.free(-1), /non-negative integer pointer/i);
});

// The task packet listed free(0) as a throwing case, but src/index.js:free()
// only rejects negative/non-integer pointers and Emscripten's `_free(0)` is a
// documented no-op. Assert the real contract instead of a throw that would
// always fail on the remote box.
check("free(0) is a safe no-op (Emscripten contract)", () => {
  lm.free(0);
});

console.log(`\nSMOKE TEST ${failed === 0 ? "PASS" : "FAIL"} — ${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
