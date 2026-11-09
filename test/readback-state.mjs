#!/usr/bin/env node
// Regression probe for the WebGL2 readback path (F2/F9).
//
// The probe drives a real bake through the wrapper in headless Chrome with
// ANGLE SwiftShader, interposes the WebGL2 context so it can observe the
// readback calls, and checks:
//   - readback resources are reused instead of allocated per pass;
//   - the transfer height is the written-row bound, not the lightmap height;
//   - distinct read/draw framebuffer bindings and the read buffer are restored;
//   - an incomplete readback framebuffer logs and does not abort the bake.
//
// It uses the wrapper source plus an explicitly loaded compiled module so it
// can reach the Emscripten GL object registry for the binding sentinels. The
// packaged dist/ entry is checked separately by the packaging task.
//
// Usage:
//   CHROME_SHELL_PATH=/path/to/chrome-headless-shell node test/readback-state.mjs
//
// Optional:
//   READBACK_PROBE_MODE=full-height
//     One-pass 64x64 bake for a -DNDEBUG module; checks the oversized-row clamp.
//   READBACK_PROBE_MODULE=/build/wasm-noassert/wasm/lightmapper_wasm.mjs
//     Module URL (served from the repository root) used by the page.

import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const chrome = process.env.CHROME_SHELL_PATH;
const probeMode = process.env.READBACK_PROBE_MODE || "multi-pass";
const probeEntry = process.env.READBACK_PROBE_ENTRY || "src";
const moduleUrl = process.env.READBACK_PROBE_MODULE || "/build/wasm/wasm/lightmapper_wasm.mjs";

if (!chrome) {
  fail(
    "CHROME_SHELL_PATH is not set. Point it at chrome-headless-shell, e.g. " +
      "CHROME_SHELL_PATH=~/browsers/chrome-headless-shell/linux-131.0.6778.264/chrome-headless-shell-linux64/chrome-headless-shell",
  );
}

if (probeMode !== "multi-pass" && probeMode !== "full-height" && probeMode !== "packaged") {
  fail(`unknown READBACK_PROBE_MODE ${JSON.stringify(probeMode)}; use multi-pass, full-height or packaged`);
}

if (probeEntry !== "src" && probeEntry !== "dist") {
  fail(`unknown READBACK_PROBE_ENTRY ${JSON.stringify(probeEntry)}; use src or dist`);
}

if (probeMode === "full-height" && probeEntry !== "src") {
  fail("full-height mode requires READBACK_PROBE_ENTRY=src because it instruments the compiled module");
}

if (probeEntry === "src" && !statSync(join(repoRoot, moduleUrl), { throwIfNoEntry: false })) {
  fail(
    `missing compiled module ${moduleUrl}; build it first with ` +
      `"npm run configure:wasm && npm run build:wasm" (or the -DNDEBUG flavor for full-height mode)`,
  );
}

function fail(message) {
  console.error(`readback-state: ${message}`);
  process.exit(1);
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
const errors = [];
function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function report(result) {
  out.textContent = encodeBase64(JSON.stringify(result));
}
window.addEventListener("error", (event) => {
  report({ ok: false, error: String(event.error || event.message), phase: "window" });
});
window.addEventListener("unhandledrejection", (event) => {
  report({ ok: false, error: String(event.reason), phase: "unhandledrejection" });
});

(async () => {
  const params = new URLSearchParams(location.search);
  const moduleUrl = params.get("module") || MODULE_URL;
  const mode = params.get("mode") || "multi-pass";
  const entry = params.get("entry") || "src";
  const printErr = (message) => { errors.push(String(message)); console.error("wasm-stderr: " + message); };

  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  document.body.appendChild(canvas);
  const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL2 context unavailable");

  const wrapperModule = entry === "dist" ? await import("/dist/index.js") : await import("/src/index.js");
  const { createLightmapperModule } = wrapperModule;
  let mod = null;
  let moduleFactory = null;
  if (entry === "src") {
    const realFactory = (await import(moduleUrl)).default;
    moduleFactory = async (options) => {
      mod = await realFactory(options);
      return mod;
    };
  }

  const lm = await createLightmapperModule({
    webglContext: gl,
    ...(moduleFactory ? { moduleFactory } : {}),
    wasmModuleOptions: { printErr }
  });
  lm.makeBoundContextCurrent();
  if (entry === "src" && (!mod || !mod.GL || !Array.isArray(mod.GL.framebuffers))) {
    throw new Error("Emscripten GL registry is unavailable");
  }

  const width = 64;
  const height = 64;
  const channels = 4;
  const lightmapPtr = lm.allocF32(width * height * channels);
  const begin = lm.makeBeginFrameBuffers();

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

  let active = false;
  let sentinelMode = false;
  let forceIncomplete = false;
  let createCount = 0;
  let deleteCount = 0;
  const trace = [];
  let readSentinel = null;
  let drawSentinel = null;

  if (entry === "src") {
    // Emscripten-managed framebuffer objects so glGetIntegerv can serialize the
    // sentinel names and glBindFramebuffer can look them up again.
    const idPtr = mod._malloc(4);
    function genFramebuffer() {
      mod.GL.genObject(1, idPtr, "createFramebuffer", mod.GL.framebuffers);
      const id = mod.HEAP32[idPtr >> 2];
      if (!id) throw new Error("could not create a sentinel framebuffer");
      return { id, fb: mod.GL.framebuffers[id] };
    }
    readSentinel = genFramebuffer();
    drawSentinel = genFramebuffer();
    mod._free(idPtr);

    function colorTexture() {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 4, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      return texture;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, readSentinel.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTexture(), 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, colorTexture(), 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, drawSentinel.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTexture(), 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    const raw = {
      createFramebuffer: gl.createFramebuffer.bind(gl),
      deleteFramebuffer: gl.deleteFramebuffer.bind(gl),
      bindFramebuffer: gl.bindFramebuffer.bind(gl),
      readPixels: gl.readPixels.bind(gl),
      readBuffer: gl.readBuffer.bind(gl),
      getParameter: gl.getParameter.bind(gl),
      checkFramebufferStatus: gl.checkFramebufferStatus.bind(gl)
    };

    const labels = new Map([
      [readSentinel.fb, "readSentinel"],
      [drawSentinel.fb, "drawSentinel"]
    ]);
    const label = (fb) => (fb ? labels.get(fb) || "other" : "default");

    gl.createFramebuffer = (...args) => {
      if (active) createCount += 1;
      return raw.createFramebuffer(...args);
    };
    gl.deleteFramebuffer = (fb) => {
      if (active) deleteCount += 1;
      return raw.deleteFramebuffer(fb);
    };
    gl.bindFramebuffer = (target, fb) => {
      if (active) trace.push({ type: "bind", target, fb: label(fb) });
      return raw.bindFramebuffer(target, fb);
    };
    gl.readPixels = (...args) => {
      if (active) trace.push({ type: "readPixels", x: args[0], y: args[1], width: args[2], height: args[3] });
      return raw.readPixels(...args);
    };
    gl.readBuffer = (modeValue) => {
      if (active) trace.push({ type: "readBuffer", mode: modeValue });
      return raw.readBuffer(modeValue);
    };
    gl.getParameter = (pname) => {
      if (active && sentinelMode) {
        if (pname === gl.READ_FRAMEBUFFER_BINDING) return readSentinel.fb;
        if (pname === gl.DRAW_FRAMEBUFFER_BINDING) return drawSentinel.fb;
        if (pname === gl.READ_BUFFER) return gl.COLOR_ATTACHMENT1;
      }
      return raw.getParameter(pname);
    };
    gl.checkFramebufferStatus = (target) => {
      if (active && forceIncomplete) return gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT;
      return raw.checkFramebufferStatus(target);
    };
  }

  function resetScene(ctx) {
    lm.viewF32(lightmapPtr, width * height * channels).fill(0);
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
  }

  function bake(ctx, label) {
    let iterations = 0;
    while (lm.lmBegin(ctx, begin.viewportPtr, begin.viewPtr, begin.projectionPtr)) {
      const viewport = begin.readViewport();
      gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      lm.lmEnd(ctx);
      iterations += 1;
      if (iterations > 100000) throw new Error("bake did not finish: " + label);
    }
    return iterations;
  }

  function findRestore(index) {
    const window = trace.slice(index + 1, index + 8);
    const read = window.find((entry) => entry.type === "bind" && entry.target === gl.READ_FRAMEBUFFER);
    const draw = window.find((entry) => entry.type === "bind" && entry.target === gl.DRAW_FRAMEBUFFER);
    const readBuffer = window.find((entry) => entry.type === "readBuffer");
    return {
      read: read ? read.fb : null,
      draw: draw ? draw.fb : null,
      readBuffer: readBuffer ? readBuffer.mode : null,
      readBeforeDraw: !!(read && draw && window.indexOf(read) < window.indexOf(draw)),
      readBufferAfterRead: !!(read && readBuffer && window.indexOf(read) < window.indexOf(readBuffer))
    };
  }

  const contexts = [];
  const scenarios = [];

  function runScenario(name, ctx, modeName) {
    const traceStart = trace.length;
    const createStart = createCount;
    const deleteStart = deleteCount;
    active = true;
    sentinelMode = true;
    let iterations = 0;
    let aborted = false;
    let abortError = null;
    try {
      iterations = bake(ctx, name);
    } catch (error) {
      aborted = true;
      abortError = String(error);
    }
    active = false;
    sentinelMode = false;

    const readbacks = trace
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.type === "readPixels");
    const heights = readbacks.map(({ entry }) => entry.height);
    const restores = readbacks.map(({ index }) => findRestore(index));
    const creates = createCount - createStart;
    const deletes = deleteCount - deleteStart;

    const checks = {
      completed: !aborted,
      readbackCount: modeName === "full-height" ? readbacks.length === 1 : readbacks.length >= 2,
      transferHeight:
        modeName === "full-height"
          ? heights.length > 0 && heights.every((value) => value === height)
          : heights.length > 0 && heights.every((value) => value <= height) && heights.some((value) => value < height),
      transferWithinLightmap: heights.every((value) => value > 0 && value <= height),
      reusedFramebuffer: creates <= 1 && deletes === 0,
      restoredBindings: restores.every((restore) => restore.read === "readSentinel" && restore.draw === "drawSentinel"),
      restoreOrder: restores.every((restore) => restore.readBeforeDraw),
      restoredReadBuffer: restores.every((restore) => restore.readBuffer === gl.COLOR_ATTACHMENT1),
      readBufferAfterRead: restores.every((restore) => restore.readBufferAfterRead)
    };

    scenarios.push({
      name,
      ok: Object.values(checks).every(Boolean),
      iterations,
      aborted,
      abortError,
      checks,
      readbackHeights: heights,
      framebufferCreates: creates,
      framebufferDeletes: deletes,
      restores,
      traceLength: trace.length - traceStart
    });
    return { aborted, abortError };
  }

  const ctx = lm.lmCreate(32, 0.1, 100.0, 0, 0, 0, mode === "full-height" ? 0 : 2, 0.01, 0.0);
  contexts.push(ctx);
  resetScene(ctx);

  if (mode === "packaged") {
    try {
      const iterations = bake(ctx, "packaged");
      lm.lmDestroy(ctx);
      report({ ok: true, mode, entry, iterations, glError: gl.getError(), errors });
    } catch (error) {
      report({ ok: false, mode, entry, error: String(error), errors });
    }
    return;
  }

  runScenario("success", ctx, mode);

  // Forced failure: the readback framebuffer reports incomplete. The bake must
  // log and continue; the context must still be usable afterwards.
  resetScene(ctx);
  const errorsBeforeFailure = errors.length;
  active = true;
  sentinelMode = true;
  forceIncomplete = true;
  let failureAborted = false;
  let failureAbortError = null;
  try {
    bake(ctx, "failure");
  } catch (error) {
    failureAborted = true;
    failureAbortError = String(error);
  }
  forceIncomplete = false;
  active = false;
  sentinelMode = false;

  const failureMessages = errors.slice(errorsBeforeFailure);
  const failureLogged = failureMessages.some((message) => /readback framebuffer/i.test(message));

  let contextUsable = false;
  let usabilityError = null;
  if (!failureAborted) {
    resetScene(ctx);
    try {
      bake(ctx, "after-failure");
      contextUsable = true;
    } catch (error) {
      usabilityError = String(error);
    }
  }

  scenarios.push({
    name: "failure",
    ok: !failureAborted && failureLogged && contextUsable,
    aborted: failureAborted,
    abortError: failureAbortError,
    logged: failureLogged,
    messages: failureMessages,
    contextUsable,
    usabilityError
  });

  let destroyError = null;
  try {
    for (const context of contexts) lm.lmDestroy(context);
  } catch (error) {
    destroyError = String(error);
  }
  const glErrorAfterDestroy = gl.getError();
  if (glErrorAfterDestroy !== gl.NO_ERROR) {
    destroyError = destroyError || "0x" + glErrorAfterDestroy.toString(16);
  }
  scenarios.push({
    name: "destroy",
    ok: !destroyError,
    error: destroyError,
    glError: glErrorAfterDestroy
  });

  begin.dispose();

  const ok = scenarios.every((scenario) => scenario.ok);
  report({
    ok,
    mode,
    entry,
    moduleUrl,
    constants: {
      LM_FLOAT: lm.LM_FLOAT,
      LM_UNSIGNED_INT: lm.LM_UNSIGNED_INT,
      LM_NONE: lm.LM_NONE
    },
    scenarios,
    errors
  });
})().catch((error) => {
  report({ ok: false, error: String(error), phase: "top-level", errors });
});
`;

  return `<!doctype html>
<meta charset="utf-8">
<title>lightmapper readback probe</title>
<body>
<pre id="probe-result"></pre>
<script type="module">
const MODULE_URL = ${JSON.stringify(moduleUrl)};
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
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer((request, response) => {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      if (process.env.READBACK_PROBE_DEBUG) console.error(`probe-server: ${request.method} ${pathname}`);
      if (pathname === "/probe.html") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(page);
        return;
      }

      const filePath = normalize(join(repoRoot, pathname));
      if (!filePath.startsWith(repoRoot + sep)) {
        response.writeHead(403);
        response.end("forbidden");
        return;
      }

      try {
        const data = readFileSync(filePath);
        response.writeHead(200, { "content-type": contentType(filePath) });
        response.end(data);
      } catch {
        response.writeHead(404);
        response.end("not found");
      }
    });
    server.listen(0, "127.0.0.1", () => resolvePromise(server));
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

const workDir = mkdtempSync(join(tmpdir(), "lightmapper-readback-"));
let server;
try {
  server = await startServer();
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/probe.html?mode=${encodeURIComponent(probeMode)}&entry=${encodeURIComponent(probeEntry)}&module=${encodeURIComponent(moduleUrl)}`;

  const result = await runChrome(
    [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu-sandbox",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--user-data-dir=" + join(workDir, "profile"),
      "--virtual-time-budget=30000",
      "--dump-dom",
      url
    ],
    180_000,
  ).catch((error) => fail(`failed to launch chrome-headless-shell at ${chrome}: ${error.message}`));

  if (result.status !== 0) {
    fail(
      `chrome-headless-shell exited with status ${result.status}: ` +
        `${(result.stderr || result.stdout || "").trim().slice(0, 2000)}`,
    );
  }

  const match = (result.stdout || "").match(/<pre id="probe-result">([\s\S]*?)<\/pre>/);
  if (!match) {
    fail(
      "probe result element missing from DOM; chrome output:\n" +
        `${(result.stdout || result.stderr || "").trim().slice(0, 2000)}`,
    );
  }

  let probe;
  try {
    probe = JSON.parse(Buffer.from(decodeEntities(match[1]).trim(), "base64").toString("utf8"));
  } catch (error) {
    fail(`could not decode probe result: ${error.message}`);
  }

  if (probe.error) {
    if (probe.errors && probe.errors.length) {
      console.error("stderr/console errors:");
      for (const message of probe.errors.slice(0, 20)) console.error(`  ${message}`);
    }
    fail(`probe failed in ${probe.phase || "unknown"} phase: ${probe.error}`);
  }
  if (process.env.READBACK_PROBE_DEBUG) console.log(JSON.stringify(probe, null, 2));

  for (const scenario of probe.scenarios || []) {
    const marker = scenario.ok ? "PASS" : "FAIL";
    console.log(`${marker} ${scenario.name}${scenario.checks ? " " + JSON.stringify(scenario.checks) : ""}`);
    if (scenario.readbackHeights) {
      console.log(`     readbackHeights=${JSON.stringify(scenario.readbackHeights)} creates=${scenario.framebufferCreates} deletes=${scenario.framebufferDeletes}`);
    }
    if (scenario.restores && scenario.restores.some((restore) => restore.read !== "readSentinel" || restore.draw !== "drawSentinel")) {
      console.log(`     restores=${JSON.stringify(scenario.restores)}`);
    }
    if (scenario.aborted) {
      console.log(`     aborted=${scenario.abortError}`);
    }
  }

  if (!probe.ok) {
    if (probe.errors && probe.errors.length) {
      console.error("stderr/console errors:");
      for (const message of probe.errors.slice(0, 20)) console.error(`  ${message}`);
    }
    fail(`readback probe failed (mode=${probe.mode})`);
  }

  console.log(`readback-state: all scenarios passed (mode=${probe.mode}, entry=${probe.entry || "src"})`);
} finally {
  if (server) await new Promise((resolvePromise) => server.close(resolvePromise));
  rmSync(workDir, { recursive: true, force: true });
}
