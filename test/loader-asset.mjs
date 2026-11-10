#!/usr/bin/env node
// Loader-asset probe for the published dist/ entries (change:
// separate-wasm-loader, tasks 3.1 + 3.2).
//
// The probe serves dist/ over HTTP from 127.0.0.1, loads the packaged entry
// in headless Chrome with ANGLE SwiftShader, and checks the asset-loading
// contract from the `wasm-loader` spec:
//
//   default-entry   import index.js, initialize with a real WebGL2 context,
//                   and observe exactly one request for lightmapper.wasm
//                   (streaming instantiation preferred on application/wasm);
//   supplied-bytes  pre-fetch the bytes, initialize with wasmBinary, and
//                   observe zero additional asset requests;
//   missing-locate  locateWasm points at a path the server answers with 404,
//                   and the surfaced rejection names lightmapper and the
//                   missing location;
//   probe-precedes  a WebGL2 context without EXT_color_buffer_float rejects
//                   with the capability error and performs zero asset fetches
//                   even though locateWasm points at a counted path;
//   single-file     import single.js and run a real bake with zero .wasm
//                   requests from page load through bake completion.
//
// The bake intentionally renders no scene geometry: lightmapper clears each
// hemisphere to lmCreate's clear colour ("valid background pixels") and the
// caller contributes nothing else, so the lightmap holds the sky colour.
//
// The page reports each scenario as console.log("LOADER-ASSET-RESULT ...")
// and mirrors the aggregate into <pre id="probe-result"> as base64 JSON, the
// same channel test/readback-state.mjs and test/first-pass-sampling.mjs use.
//
// Usage:
//   CHROME_SHELL_PATH=/path/to/chrome-headless-shell node test/loader-asset.mjs

import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(repoRoot, "dist");
const chrome = process.env.CHROME_SHELL_PATH;

const EXPECTED_DEFAULT_SCENARIOS = ["default-entry", "supplied-bytes", "missing-locate", "probe-precedes-fetch"];
const EXPECTED_SINGLE_SCENARIOS = ["single-file"];

function fail(message) {
  console.error(`loader-asset: ${message}`);
  process.exit(1);
}

if (!chrome) {
  fail(
    "CHROME_SHELL_PATH is not set. Point it at chrome-headless-shell, e.g. " +
      "CHROME_SHELL_PATH=~/browsers/chrome-headless-shell/linux-131.0.6778.264/chrome-headless-shell-linux64/chrome-headless-shell",
  );
}

for (const [path, label] of [
  [join(distDir, "index.js"), "dist/index.js"],
  [join(distDir, "lightmapper.wasm"), "dist/lightmapper.wasm"],
  [join(distDir, "single.js"), "dist/single.js"],
]) {
  if (!statSync(path, { throwIfNoEntry: false })) {
    fail(`${label} is missing; run "npm run build:wasm && npm run build:wasm:single && npm run build:dist" first`);
  }
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function buildPage() {
  const pageScript = String.raw`
const out = document.getElementById("probe-result");
const suite = new URLSearchParams(location.search).get("suite") || "default";
const unhandled = [];
const results = [];
const instrumentation = {};

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function report(result) {
  out.textContent = encodeBase64(JSON.stringify(result));
}
function emit(result) {
  results.push(result);
  console.log("LOADER-ASSET-RESULT " + JSON.stringify(result));
}
window.addEventListener("unhandledrejection", (event) => {
  unhandled.push(String(event.reason));
});

// fetch instrumentation installed before any module import: every call is
// logged so the scenarios can count requests for the wasm asset.
const realFetch = window.fetch.bind(window);
const fetchLog = [];
window.fetch = function (input, init) {
  let url;
  try {
    url = typeof input === "string" ? input : (input && input.url) || String(input);
  } catch {
    url = String(input);
  }
  fetchLog.push(url);
  return realFetch(input, init);
};
function wasmFetchesSince(index) {
  return fetchLog.slice(index).filter((url) => /\.wasm(\?|#|$)/.test(url)).length;
}

// WebAssembly instrumentation records which instantiation path the loader
// takes. The loader itself prefers instantiateStreaming on application/wasm.
const realInstantiateStreaming = typeof WebAssembly.instantiateStreaming === "function"
  ? WebAssembly.instantiateStreaming.bind(WebAssembly)
  : null;
const realInstantiate = WebAssembly.instantiate.bind(WebAssembly);
let streamingCalls = 0;
let arrayBufferCalls = 0;
instrumentation.streamingWrapped = typeof realInstantiateStreaming === "function";
try {
  if (realInstantiateStreaming) {
    WebAssembly.instantiateStreaming = function (source, imports) {
      streamingCalls += 1;
      return realInstantiateStreaming(source, imports);
    };
  }
  WebAssembly.instantiate = function (bytes, imports) {
    arrayBufferCalls += 1;
    return realInstantiate(bytes, imports);
  };
} catch (error) {
  instrumentation.wrapError = String(error);
}

function makeContext() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  document.body.appendChild(canvas);
  const gl = canvas.getContext("webgl2", { antialias: false });
  if (!gl) throw new Error("WebGL2 context unavailable");
  return gl;
}

function errorMessage(error) {
  return error && error.message ? String(error.message) : String(error);
}

async function scenarioDefaultEntry() {
  const fetchStart = fetchLog.length;
  const streamingStart = streamingCalls;
  const arrayBufferStart = arrayBufferCalls;
  const gl = makeContext();
  const entry = await import("./index.js");
  const lm = await entry.createLightmapperModule({ webglContext: gl });

  const apiNames = [
    "lmCreate", "lmSetCosineWeights", "lmDestroy", "lmSetTargetLightmap", "lmSetGeometry",
    "lmBegin", "lmEnd", "lmProgress",
    "allocF32", "allocU8", "allocU16", "allocU32", "free",
    "viewF32", "viewU8", "viewU16", "viewU32",
    "copyToHeap", "copyFromHeap", "makeBeginFrameBuffers", "makeBoundContextCurrent"
  ];
  const missingApi = apiNames.filter((name) => typeof lm[name] !== "function");
  const constants = [lm.LM_FLOAT, lm.LM_UNSIGNED_INT, lm.LM_NONE, lm.LM_ALL_CHANNELS];
  const fetchCount = wasmFetchesSince(fetchStart);
  const streamingDelta = streamingCalls - streamingStart;
  const arrayBufferDelta = arrayBufferCalls - arrayBufferStart;

  const checks = {
    resolved: apiNames.length > 0 && missingApi.length === 0,
    constants: constants.every((value) => typeof value === "number"),
    boundContext: Number.isInteger(lm.boundContextHandle) && lm.boundContextHandle > 0,
    oneAssetFetch: fetchCount === 1,
    instantiated: streamingDelta + arrayBufferDelta >= 1
  };
  return {
    name: "default-entry",
    ok: Object.values(checks).every(Boolean),
    checks,
    metrics: {
      assetFetches: fetchCount,
      streamingCalls: streamingDelta,
      arrayBufferCalls: arrayBufferDelta,
      instantiationPath: streamingDelta > 0 ? "instantiateStreaming" : arrayBufferDelta > 0 ? "instantiate" : "none",
      missingApi,
      boundContextHandle: lm.boundContextHandle
    }
  };
}

async function scenarioSuppliedBytes() {
  const gl = makeContext();
  // Pre-fetch the asset in the page before initialization; this request is
  // the page's own and must not be repeated by the loader.
  const prefetchResponse = await fetch("./lightmapper.wasm");
  if (!prefetchResponse.ok) throw new Error("prefetch of ./lightmapper.wasm failed with HTTP " + prefetchResponse.status);
  const bytes = await prefetchResponse.arrayBuffer();
  const fetchStart = fetchLog.length;
  const entry = await import("./index.js");
  const lm = await entry.createLightmapperModule({ webglContext: gl, wasmBinary: bytes });
  const ptr = lm.allocF32(4);
  const fetchCount = wasmFetchesSince(fetchStart);
  const checks = {
    resolved: typeof lm.lmCreate === "function" && typeof lm.lmSetCosineWeights === "function" && typeof lm.lmDestroy === "function",
    heapUsable: Number.isInteger(ptr) && ptr > 0,
    noAssetFetch: fetchCount === 0
  };
  return {
    name: "supplied-bytes",
    ok: Object.values(checks).every(Boolean),
    checks,
    metrics: {
      prefetchFetches: 1,
      assetFetches: fetchCount,
      bytes: bytes.byteLength
    }
  };
}

async function scenarioMissingLocate() {
  const gl = makeContext();
  const entry = await import("./index.js");
  let rejected = false;
  let message = "";
  const fetchStart = fetchLog.length;
  try {
    await entry.createLightmapperModule({
      webglContext: gl,
      locateWasm: () => "/definitely-missing-lightmapper.wasm"
    });
  } catch (error) {
    rejected = true;
    message = errorMessage(error);
  }
  const checks = {
    rejected,
    namesLightmapper: /lightmapper/i.test(message),
    namesLocation: message.includes("/definitely-missing-lightmapper.wasm")
  };
  return {
    name: "missing-locate",
    ok: Object.values(checks).every(Boolean),
    checks,
    metrics: {
      assetFetches: wasmFetchesSince(fetchStart),
      rejectionMessage: message
    }
  };
}

async function scenarioProbePrecedesFetch() {
  const gl = makeContext();
  const realGetExtension = gl.getExtension.bind(gl);
  // Honest, deterministic capability failure: the context is a real SwiftShader
  // WebGL2 context, only the float-color-buffer extension is withheld.
  gl.getExtension = function (name) {
    return name === "EXT_color_buffer_float" ? null : realGetExtension(name);
  };
  const entry = await import("./index.js");
  const fetchStart = fetchLog.length;
  let rejected = false;
  let message = "";
  try {
    await entry.createLightmapperModule({
      webglContext: gl,
      locateWasm: () => "/counted/lightmapper.wasm"
    });
  } catch (error) {
    rejected = true;
    message = errorMessage(error);
  }
  const fetchCount = wasmFetchesSince(fetchStart);
  const checks = {
    rejected,
    capabilityError: /EXT_color_buffer_float/.test(message),
    noAssetFetch: fetchCount === 0
  };
  return {
    name: "probe-precedes-fetch",
    ok: Object.values(checks).every(Boolean),
    checks,
    metrics: {
      assetFetches: fetchCount,
      rejectionMessage: message
    }
  };
}

function sampleStats(data) {
  let finite = 0;
  let nonZero = 0;
  let maxAbs = 0;
  for (const value of data) {
    if (!Number.isFinite(value)) continue;
    finite += 1;
    if (value !== 0) nonZero += 1;
    const abs = Math.abs(value);
    if (abs > maxAbs) maxAbs = abs;
  }
  return { total: data.length, finite, nonZero, maxAbs };
}

async function scenarioSingleFile() {
  const fetchStart = fetchLog.length;
  const gl = makeContext();
  const entry = await import("./single.js");
  const errors = [];
  const printErr = (message) => { errors.push(String(message)); };
  const lm = await entry.createLightmapperModule({
    webglContext: gl,
    wasmModuleOptions: { printErr }
  });
  lm.makeBoundContextCurrent();

  const width = 16;
  const height = 16;
  const channels = 4;
  const lightmapPtr = lm.allocF32(width * height * channels);
  lm.viewF32(lightmapPtr, width * height * channels).fill(0);
  const begin = lm.makeBeginFrameBuffers();

  // Smallest working bake sequence: one axis-aligned quad, direct pass, clear
  // colour as the only light source so every covered texel is non-zero.
  const positions = lm.copyToHeap(new Float32Array([
    -1, -1, 0,
     1, -1, 0,
     1,  1, 0,
    -1,  1, 0
  ]));
  const normals = lm.copyToHeap(new Float32Array([
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
    0, 0, 1
  ]));
  const uvs = lm.copyToHeap(new Float32Array([
    0, 0,
    0.999, 0,
    0.999, 0.999,
    0, 0.999
  ]));
  const indices = lm.copyToHeap(new Uint32Array([0, 1, 2, 0, 2, 3]));

  const ctx = lm.lmCreate(32, 0.1, 100.0, 0.35, 0.2, 0.1, 0, 0.01, 0.0);
  lm.lmSetTargetLightmap(ctx, lightmapPtr, width, height, channels);
  lm.lmSetGeometry(
    ctx,
    0,
    lm.LM_FLOAT, positions, 0,
    lm.LM_FLOAT, normals, 0,
    lm.LM_FLOAT, uvs, 0,
    6,
    lm.LM_UNSIGNED_INT, indices
  );

  let iterations = 0;
  // Real scene draw between lmBegin/lmEnd, following examples/browser/scene.js:
  // the library's internal passes only mark texels covered by geometry, so
  // radiance must come from an actual draw with the begin view/projection.
  const bakeVertexSource = [
    "#version 300 es",
    "precision highp float;",
    "layout(location=0) in vec3 a_position;",
    "uniform mat4 u_view;",
    "uniform mat4 u_projection;",
    "void main() { gl_Position = u_projection * (u_view * vec4(a_position, 1.0)); }"
  ].join("\n");
  const bakeFragmentSource = [
    "#version 300 es",
    "precision highp float;",
    "out vec4 o_color;",
    "void main() { o_color = vec4(0.8, 0.6, 0.4, gl_FrontFacing ? 1.0 : 0.0); }"
  ].join("\n");

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error("bake shader compile failed: " + gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  const bakeProgram = gl.createProgram();
  gl.attachShader(bakeProgram, compileShader(gl.VERTEX_SHADER, bakeVertexSource));
  gl.attachShader(bakeProgram, compileShader(gl.FRAGMENT_SHADER, bakeFragmentSource));
  gl.linkProgram(bakeProgram);
  if (!gl.getProgramParameter(bakeProgram, gl.LINK_STATUS)) {
    throw new Error("bake program link failed: " + gl.getProgramInfoLog(bakeProgram));
  }
  const bakeUView = gl.getUniformLocation(bakeProgram, "u_view");
  const bakeUProjection = gl.getUniformLocation(bakeProgram, "u_projection");

  const bakeVao = gl.createVertexArray();
  gl.bindVertexArray(bakeVao);
  const bakeVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bakeVbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const bakeIbo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bakeIbo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  while (lm.lmBegin(ctx, begin.viewportPtr, begin.viewPtr, begin.projectionPtr)) {
    const viewport = begin.readViewport();
    gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(bakeProgram);
    gl.uniformMatrix4fv(bakeUView, false, begin.readViewMatrix());
    gl.uniformMatrix4fv(bakeUProjection, false, begin.readProjectionMatrix());
    gl.bindVertexArray(bakeVao);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 0);
    // No gl.clear: lmBegin owns the hemisphere clear for this pass.
    lm.lmEnd(ctx);
    iterations += 1;
    if (iterations > 100000) throw new Error("bake did not finish");
  }

  gl.bindVertexArray(null);
  gl.deleteProgram(bakeProgram);

  const stats = sampleStats(lm.viewF32(lightmapPtr, width * height * channels));
  lm.lmDestroy(ctx);
  begin.dispose();

  const fetchCount = wasmFetchesSince(fetchStart);
  const checks = {
    resolved: typeof lm.lmCreate === "function",
    bakeCompleted: iterations > 0,
    finiteSamples: stats.finite === stats.total,
    nonZeroSamples: stats.nonZero > 0,
    zeroWasmFetches: fetchCount === 0
  };
  return {
    name: "single-file",
    ok: Object.values(checks).every(Boolean),
    checks,
    metrics: {
      assetFetches: fetchCount,
      iterations,
      samples: stats,
      moduleErrors: errors
    }
  };
}

(async () => {
  try {
    if (!instrumentation.streamingWrapped && suite === "default") {
      // Not fatal by itself, but record it: the streaming scenario cannot be
      // observed when the browser lacks the API.
    }
    if (suite === "single") {
      emit(await scenarioSingleFile());
    } else if (suite === "default") {
      emit(await scenarioDefaultEntry());
      emit(await scenarioSuppliedBytes());
      emit(await scenarioMissingLocate());
      emit(await scenarioProbePrecedesFetch());
    } else {
      throw new Error("unknown suite " + suite);
    }

    const ok = results.every((result) => result.ok) && unhandled.length === 0;
    report({ suite, ok, scenarios: results, unhandled, instrumentation });
  } catch (error) {
    report({ suite, ok: false, scenarios: results, unhandled, instrumentation, error: String(error && error.stack ? error.stack : error), phase: "top-level" });
  }
})();
`;

  return `<!doctype html>
<meta charset="utf-8">
<title>lightmapper loader-asset probe</title>
<body>
<pre id="probe-result"></pre>
<script type="module">
${pageScript}
</script>
</body>
`;
}

function contentType(filePath) {
  switch (extname(filePath).toLowerCase()) {
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".wasm":
      return "application/wasm";
    default:
      return "application/octet-stream";
  }
}

function startServer() {
  const page = buildPage();
  const requests = new Map();
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer((request, response) => {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      requests.set(pathname, (requests.get(pathname) || 0) + 1);
      if (pathname === "/probe.html") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(page);
        return;
      }

      const filePath = normalize(join(distDir, pathname));
      if (!filePath.startsWith(distDir + sep)) {
        response.writeHead(404);
        response.end("not found");
        return;
      }

      try {
        const data = readFileSync(filePath);
        response.writeHead(200, { "content-type": contentType(filePath) });
        response.end(data);
      } catch {
        // Anything not present in dist/ (e.g. /counted/lightmapper.wasm and
        // /definitely-missing-lightmapper.wasm) is a 404, never a page file.
        response.writeHead(404);
        response.end("not found");
      }
    });
    server.listen(0, "127.0.0.1", () => resolvePromise({ server, requests }));
    server.on("error", rejectPromise);
  });
}

function runChrome(args, timeoutMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(chrome, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      rejectPromise(new Error(`chrome-headless-shell timed out after ${timeoutMs}ms\nstdout: ${stdout.slice(0, 4000)}\nstderr: ${stderr.slice(0, 4000)}`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 32 * 1024 * 1024) stdout = stdout.slice(-32 * 1024 * 1024);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > 4 * 1024 * 1024) stderr = stderr.slice(-4 * 1024 * 1024);
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.on("close", (status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ status, stdout, stderr });
    });
  });
}

function extractResult(stdout, suite) {
  const match = (stdout || "").match(/<pre id="probe-result">([\s\S]*?)<\/pre>/);
  if (!match) return null;
  try {
    return JSON.parse(Buffer.from(decodeEntities(match[1]).trim(), "base64").toString("utf8"));
  } catch (error) {
    fail(`could not decode the ${suite} probe result: ${error.message}`);
  }
}

async function runSuite(port, suite, workDir) {
  const url = `http://127.0.0.1:${port}/probe.html?suite=${encodeURIComponent(suite)}`;
  let result;
  try {
    result = await runChrome(
      [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu-sandbox",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--user-data-dir=" + join(workDir, `profile-${suite}`),
        "--virtual-time-budget=120000",
        "--dump-dom",
        url
      ],
      240_000,
    );
  } catch (error) {
    fail(`failed to launch chrome-headless-shell at ${chrome}: ${error.message}`);
  }

  if (result.status !== 0) {
    fail(
      `chrome-headless-shell (${suite}) exited with status ${result.status}: ` +
        `${(result.stderr || result.stdout || "").trim().slice(0, 2000)}`,
    );
  }

  const probe = extractResult(result.stdout, suite);
  if (!probe) {
    fail(
      `probe result element missing from the ${suite} DOM; chrome output:\n` +
        `${(result.stdout || result.stderr || "").trim().slice(0, 2000)}`,
    );
  }
  if (probe.phase === "top-level" || probe.error) {
    for (const scenario of probe.scenarios || []) printScenario(scenario);
    fail(`probe failed in ${probe.phase || "unknown"} phase: ${probe.error}`);
  }
  if (process.env.LOADER_ASSET_DEBUG) {
    console.log(JSON.stringify(probe, null, 2));
  }
  return probe;
}

function printScenario(scenario) {
  const marker = scenario.ok ? "PASS" : "FAIL";
  console.log(`${marker} ${scenario.name} ${JSON.stringify(scenario.checks)}`);
  if (scenario.metrics) {
    console.log(`     metrics=${JSON.stringify(scenario.metrics)}`);
  }
}

function requireScenarios(probe, expected) {
  const names = (probe.scenarios || []).map((scenario) => scenario.name);
  for (const name of expected) {
    if (!names.includes(name)) fail(`scenario ${name} did not run (ran: ${names.join(", ") || "none"})`);
  }
  for (const scenario of probe.scenarios || []) printScenario(scenario);
  for (const scenario of probe.scenarios || []) {
    if (!scenario.ok) fail(`scenario ${scenario.name} failed checks ${JSON.stringify(scenario.checks)}`);
  }
  if ((probe.unhandled || []).length > 0) {
    fail(`unhandled promise rejection(s) in the page: ${probe.unhandled.join(" | ")}`);
  }
}

function metric(scenario, name) {
  if (!scenario || !scenario.metrics || typeof scenario.metrics[name] !== "number") {
    fail(`scenario ${scenario && scenario.name} did not report numeric metric ${name}`);
  }
  return scenario.metrics[name];
}

const workDir = mkdtempSync(join(tmpdir(), "lightmapper-loader-asset-"));
let server;
try {
  const started = await startServer();
  server = started.server;
  const port = server.address().port;

  // -- default entry suite: tasks 3.1 (a)-(d) --------------------------------
  const defaultProbe = await runSuite(port, "default", workDir);
  requireScenarios(defaultProbe, EXPECTED_DEFAULT_SCENARIOS);
  if (!defaultProbe.ok) fail("the default-entry page reported ok=false");

  const [defaultEntry, suppliedBytes, missingLocate, probePrecedes] = defaultProbe.scenarios;
  if (metric(defaultEntry, "assetFetches") !== 1) {
    fail(`default-entry fetched lightmapper.wasm ${metric(defaultEntry, "assetFetches")} times, expected exactly 1`);
  }
  if (metric(defaultEntry, "streamingCalls") + metric(defaultEntry, "arrayBufferCalls") < 1) {
    fail("default-entry never reached a measured WebAssembly instantiation path");
  }
  if (metric(suppliedBytes, "assetFetches") !== 0) {
    fail(`supplied-bytes performed ${metric(suppliedBytes, "assetFetches")} asset fetches, expected 0`);
  }
  if (metric(missingLocate, "assetFetches") !== 1) {
    fail(`missing-locate performed ${metric(missingLocate, "assetFetches")} asset fetches, expected the one 404 request`);
  }
  if (metric(probePrecedes, "assetFetches") !== 0) {
    fail(`probe-precedes-fetch performed ${metric(probePrecedes, "assetFetches")} asset fetches, expected 0`);
  }
  if (!defaultProbe.scenarios.every((scenario) => scenario.ok)) {
    fail("not every default-entry scenario passed");
  }

  // -- single-file suite: task 3.2 ------------------------------------------
  const singleProbe = await runSuite(port, "single", workDir);
  requireScenarios(singleProbe, EXPECTED_SINGLE_SCENARIOS);
  if (!singleProbe.ok) fail("the single-file page reported ok=false");
  const singleFile = singleProbe.scenarios[0];
  if (metric(singleFile, "assetFetches") !== 0) {
    fail(`single-file performed ${metric(singleFile, "assetFetches")} .wasm fetches, expected 0`);
  }
  if (!(singleFile.metrics.samples && singleFile.metrics.samples.nonZero > 0)) {
    fail("single-file bake produced no non-zero lightmap samples");
  }

  // -- independent server-side cross-check -----------------------------------
  const servedWasm = started.requests.get("/lightmapper.wasm") || 0;
  const servedCounted = started.requests.get("/counted/lightmapper.wasm") || 0;
  if (servedWasm !== 2) {
    fail(`server served /lightmapper.wasm ${servedWasm} times; expected 2 (one loader fetch + one page prefetch)`);
  }
  if (servedCounted !== 0) {
    fail(`server saw ${servedCounted} requests for the counted probe path; the failed probe must not fetch`);
  }

  console.log(
    `asset fetches: default-entry=${metric(defaultEntry, "assetFetches")}, ` +
      `bytes-supplied=${metric(suppliedBytes, "assetFetches")}(+${metric(suppliedBytes, "prefetchFetches")} prefetch), ` +
      `single=${metric(singleFile, "assetFetches")}, probe-fail=${metric(probePrecedes, "assetFetches")}`,
  );
  console.log(
    `instantiation path: default-entry=${defaultEntry.metrics.instantiationPath} ` +
      `(streaming=${metric(defaultEntry, "streamingCalls")}, arrayBuffer=${metric(defaultEntry, "arrayBufferCalls")})`,
  );
  console.log(
    `server: /lightmapper.wasm=${servedWasm} /counted/lightmapper.wasm=${servedCounted} ` +
      `(requests=${started.requests.size})`,
  );
  console.log(
    `single-file bake: iterations=${singleFile.metrics.iterations} ` +
      `samples=${singleFile.metrics.samples.nonZero}/${singleFile.metrics.samples.total} non-zero ` +
      `maxAbs=${singleFile.metrics.samples.maxAbs}`,
  );

  const scenarioCount = defaultProbe.scenarios.length + singleProbe.scenarios.length;
  console.log(`loader-asset: all ${scenarioCount} scenarios passed`);
} finally {
  if (server) await new Promise((resolvePromise) => server.close(resolvePromise));
  rmSync(workDir, { recursive: true, force: true });
}
