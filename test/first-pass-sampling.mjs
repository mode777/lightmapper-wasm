#!/usr/bin/env node
// Regression probe for the WebGL2/GLES3 first-pass hemisphere sampling (F1).
//
// The probe extracts the ES first-pass vertex/fragment shaders from the
// pinned upstream header, renders them in headless Chrome with ANGLE
// SwiftShader against an asymmetric source pattern, and checks that output
// texel (x, y) sums exactly columns 6x..6x+5 of source rows 2y and 2y+1.
//
// Usage:
//   CHROME_SHELL_PATH=/path/to/chrome-headless-shell node test/first-pass-sampling.mjs
//
// Optional:
//   LIGHTMAPPER_HEADER=/path/to/lightmapper.h
//     Header to inspect instead of the thirdparty/lightmapper submodule copy.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const headerPath = resolve(
  repoRoot,
  process.env.LIGHTMAPPER_HEADER || join("thirdparty", "lightmapper", "lightmapper.h"),
);

function die(message) {
  console.error(`first-pass-sampling: ${message}`);
  process.exit(1);
}

function skipTrivia(source, index) {
  while (index < source.length) {
    if (/\s/.test(source[index])) {
      index += 1;
    } else if (source[index] === "/" && source[index + 1] === "/") {
      index += 2;
      while (index < source.length && source[index] !== "\n") index += 1;
    } else if (source[index] === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2);
      if (end < 0) throw new Error("unterminated block comment");
      index = end + 2;
    } else {
      break;
    }
  }
  return index;
}

function decodeEscape(source, index) {
  const escape = source[index];
  switch (escape) {
    case "n": return { value: "\n", next: index + 1 };
    case "r": return { value: "\r", next: index + 1 };
    case "t": return { value: "\t", next: index + 1 };
    case "0": return { value: "\0", next: index + 1 };
    case "\\": return { value: "\\", next: index + 1 };
    case '"': return { value: '"', next: index + 1 };
    case "'": return { value: "'", next: index + 1 };
    default: return { value: escape, next: index + 1 };
  }
}

// Parse a C expression made only of concatenated "..." string literals.
function parseCString(source, start, label) {
  let index = skipTrivia(source, start);
  let value = "";
  let sawLiteral = false;

  while (index < source.length) {
    if (source[index] === ";") {
      if (!sawLiteral) throw new Error(`no string literal found for ${label}`);
      return value;
    }
    if (source[index] !== '"') {
      throw new Error(
        `expected a string literal or ';' for ${label} at offset ${index}, got ${JSON.stringify(source[index])}`,
      );
    }

    sawLiteral = true;
    index += 1;
    let chunk = "";
    while (index < source.length && source[index] !== '"') {
      if (source[index] === "\\") {
        if (index + 1 >= source.length) throw new Error(`unterminated escape for ${label}`);
        const decoded = decodeEscape(source, index + 1);
        chunk += decoded.value;
        index = decoded.next;
      } else if (source[index] === "\n") {
        throw new Error(`unterminated string literal for ${label}`);
      } else {
        chunk += source[index];
        index += 1;
      }
    }
    if (index >= source.length) throw new Error(`unterminated string literal for ${label}`);
    index += 1;
    value += chunk;
    index = skipTrivia(source, index);
  }

  throw new Error(`unterminated C string expression for ${label}`);
}

function extractShaderSources(header) {
  const anchor = "// hemisphere shader";
  const anchorIndex = header.indexOf(anchor);
  if (anchorIndex < 0) {
    throw new Error(
      `missing first-pass shader marker ${JSON.stringify(anchor)} in ${headerPath}; ` +
        "the probe must fail loudly rather than test the wrong shader",
    );
  }

  const esStart = header.indexOf("#if", anchorIndex);
  if (esStart < 0) {
    throw new Error(
      `missing preprocessor guard after ${JSON.stringify(anchor)} in ${headerPath}; ` +
        "the probe must fail loudly rather than test the desktop branch",
    );
  }
  const selectorLineEnd = header.indexOf("\n", esStart);
  const selectorLine = header.slice(esStart, selectorLineEnd < 0 ? header.length : selectorLineEnd).trim();
  if (!/^#if\s+LM_GLES3\b/.test(selectorLine) || selectorLine.includes("__EMSCRIPTEN__")) {
    throw new Error(
      `missing LM_GLES3 selector after ${JSON.stringify(anchor)} in ${headerPath}; ` +
        `found ${JSON.stringify(selectorLine)}`,
    );
  }
  const esEnd = header.indexOf("#else", esStart);
  if (esEnd < 0) {
    throw new Error(`missing ${JSON.stringify("#else")} closing the ES first-pass shader in ${headerPath}`);
  }
  const block = header.slice(esStart, esEnd);

  const vsMarker = "const char *vs =";
  const fsMarker = "const char *fs =";
  const vsIndex = block.indexOf(vsMarker);
  const fsIndex = block.indexOf(fsMarker);
  if (vsIndex < 0 || fsIndex < 0 || fsIndex <= vsIndex) {
    throw new Error(`could not locate the ES first-pass vs/fs declarations in ${headerPath}`);
  }

  const vs = parseCString(block, vsIndex + vsMarker.length, "first-pass vertex shader");
  const fs = parseCString(block, fsIndex + fsMarker.length, "first-pass fragment shader");

  if (!vs.includes("#version 300 es")) {
    throw new Error("extracted ES first-pass vertex shader is not GLSL ES 3.00");
  }
  if (!fs.includes("#version 300 es") || !fs.includes("gl_FragCoord") || !fs.includes("hemispheres")) {
    throw new Error("extracted ES first-pass fragment shader does not look like the hemisphere pass");
  }

  return { vs, fs };
}

function buildProbePage(vs, fs) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>first-pass-sampling</title></head>
<body>
<pre id="probe-result"></pre>
<script>
"use strict";
const VS = ${JSON.stringify(vs)};
const FS = ${JSON.stringify(fs)};

// Source layout used by the real library: a batch of hemispheres, each
// 3*SIZE wide, downsampled to SIZE/2. The probe pads the source width so the
// buggy shifted window stays inside the texture and remains measurable.
const SIZE = 8;
const FB_X = 2;
const FB_Y = 2;
const OUT_W = (SIZE / 2) * FB_X;
const OUT_H = (SIZE / 2) * FB_Y;
const SRC_W = 3 * SIZE * FB_X + 12;
const SRC_H = SIZE * FB_Y;
const WGT_W = 3 * SIZE;
const WGT_H = SIZE;

function finish(result) {
  const json = JSON.stringify(result);
  document.getElementById("probe-result").textContent =
    btoa(unescape(encodeURIComponent(json)));
  document.title = result.ok ? "PASS" : "FAIL";
}

function sourceTexel(x, y) {
  return 1.0 + ((x * 0.01) + (y * 0.001));
}

function sourcePattern(x, y, channel) {
  if (channel === 0) return sourceTexel(x, y);
  if (channel === 1) return 1.0 + ((x * 7 + y * 3) % 13) * 0.01;
  if (channel === 2) return 1.0 + ((x * 3 + y * 5) % 11) * 0.01;
  return 1.0 + ((x + 2 * y) % 7) * 0.01;
}

function weightPattern(x, y, channel) {
  if (channel === 0) return 1.0 + ((x * 5 + y * 3) % 7) * 0.01;
  return 1.0 + ((x * 2 + y * 7) % 5) * 0.01;
}

function makeSourceData() {
  const data = new Float32Array(SRC_W * SRC_H * 4);
  for (let y = 0; y < SRC_H; y += 1) {
    for (let x = 0; x < SRC_W; x += 1) {
      const offset = (y * SRC_W + x) * 4;
      for (let c = 0; c < 4; c += 1) data[offset + c] = sourcePattern(x, y, c);
    }
  }
  return data;
}

function makeWeightData() {
  const data = new Float32Array(WGT_W * WGT_H * 4);
  for (let y = 0; y < WGT_H; y += 1) {
    for (let x = 0; x < WGT_W; x += 1) {
      const offset = (y * WGT_W + x) * 4;
      data[offset + 0] = weightPattern(x, y, 0);
      data[offset + 1] = weightPattern(x, y, 1);
      data[offset + 2] = 1.0;
      data[offset + 3] = 1.0;
    }
  }
  return data;
}

function texel(data, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return [0, 0, 0, 0];
  const offset = (y * width + x) * 4;
  return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
}

// Reference model for one output texel: the 6x2 block at (originX, originY),
// with the weights indexed from the same block origin modulo the weight
// texture, exactly as a correct first-pass shader should sample.
function evaluateBlock(source, weights, originX, originY) {
  const out = [0, 0, 0, 0];
  const weightX = ((originX % WGT_W) + WGT_W) % WGT_W;
  const weightY = ((originY % WGT_H) + WGT_H) % WGT_H;
  for (let dy = 0; dy < 2; dy += 1) {
    for (let dx = 0; dx < 6; dx += 1) {
      const s = texel(source, SRC_W, SRC_H, originX + dx, originY + dy);
      const w = texel(weights, WGT_W, WGT_H, weightX + dx, weightY + dy);
      out[0] += s[0] * w[0];
      out[1] += s[1] * w[0];
      out[2] += s[2] * w[0];
      out[3] += s[3] * w[1];
    }
  }
  return out;
}

function l1(a, b) {
  let sum = 0;
  for (let i = 0; i < 4; i += 1) sum += Math.abs(a[i] - b[i]);
  return sum;
}

function closeEnough(actual, expected) {
  for (let i = 0; i < 4; i += 1) {
    const tolerance = 1e-4 * Math.max(1, Math.abs(expected[i])) + 1e-5;
    if (Math.abs(actual[i] - expected[i]) > tolerance) return false;
  }
  return true;
}

// Find which 6x2 block the shader actually sampled, within a small window.
function inferBlock(source, weights, actual, expectedX, expectedY) {
  let best = null;
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -6; dx <= 6; dx += 1) {
      const ox = expectedX + dx;
      const oy = expectedY + dy;
      if (ox < 0 || oy < 0 || ox + 5 >= SRC_W || oy + 1 >= SRC_H) continue;
      const candidate = evaluateBlock(source, weights, ox, oy);
      const error = l1(candidate, actual);
      if (!best || error < best.error) best = { x: ox, y: oy, error };
    }
  }
  return best;
}

function main() {
  const canvas = document.createElement("canvas");
  canvas.width = OUT_W;
  canvas.height = OUT_H;
  const gl = canvas.getContext("webgl2", { antialias: false });
  if (!gl) {
    finish({ ok: false, error: "WebGL2 context unavailable" });
    return;
  }
  if (!gl.getExtension("EXT_color_buffer_float")) {
    finish({ ok: false, error: "EXT_color_buffer_float unavailable; RGBA32F render targets are required" });
    return;
  }

  const source = makeSourceData();
  const weights = makeWeightData();

  function compile(type, sourceText) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, sourceText);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error("shader compile failed: " + gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  function texture(width, height, data) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, data);
    return tex;
  }

  try {
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("program link failed: " + gl.getProgramInfoLog(program));
    }

    const sourceTexture = texture(SRC_W, SRC_H, source);
    const weightTexture = texture(WGT_W, WGT_H, weights);
    const outputTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, outputTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, OUT_W, OUT_H, 0, gl.RGBA, gl.FLOAT, null);

    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outputTexture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("RGBA32F framebuffer incomplete: 0x" + status.toString(16));
    }

    gl.viewport(0, 0, OUT_W, OUT_H);
    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, "hemispheres"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "weights"), 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, weightTexture);
    gl.bindVertexArray(gl.createVertexArray());
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    const actual = new Float32Array(OUT_W * OUT_H * 4);
    gl.readPixels(0, 0, OUT_W, OUT_H, gl.RGBA, gl.FLOAT, actual);
    const glError = gl.getError();
    if (glError !== gl.NO_ERROR) {
      throw new Error("WebGL error after readPixels: 0x" + glError.toString(16));
    }

    const failures = [];
    let checked = 0;
    for (let y = 0; y < OUT_H; y += 1) {
      for (let x = 0; x < OUT_W; x += 1) {
        const expectedX = 6 * x;
        const expectedY = 2 * y;
        const expected = evaluateBlock(source, weights, expectedX, expectedY);
        const offset = (y * OUT_W + x) * 4;
        const observed = [actual[offset], actual[offset + 1], actual[offset + 2], actual[offset + 3]];
        checked += 1;
        if (!closeEnough(observed, expected)) {
          const actualBlock = inferBlock(source, weights, observed, expectedX, expectedY);
          failures.push({
            output: [x, y],
            expectedOrigin: [expectedX, expectedY],
            actualOrigin: actualBlock ? [actualBlock.x, actualBlock.y] : null,
            expected,
            actual: observed,
          });
        }
      }
    }

    finish({
      ok: failures.length === 0,
      checked,
      grid: [OUT_W, OUT_H],
      sourceSize: [SRC_W, SRC_H],
      weightSize: [WGT_W, WGT_H],
      failures: failures.slice(0, 8),
      failureCount: failures.length,
    });
  } catch (error) {
    finish({ ok: false, error: String(error && error.stack ? error.stack : error) });
  }
}

main();
</script>
</body>
</html>
`;
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function main() {
  const chrome = process.env.CHROME_SHELL_PATH;
  if (!chrome) {
    die(
      "CHROME_SHELL_PATH is not set. Point it at chrome-headless-shell, e.g. " +
        "CHROME_SHELL_PATH=~/browsers/chrome-headless-shell/linux-131.0.6778.264/chrome-headless-shell-linux64/chrome-headless-shell",
    );
  }

  let vs;
  let fs;
  try {
    const header = readFileSync(headerPath, "utf8");
    ({ vs, fs } = extractShaderSources(header));
  } catch (error) {
    die(error.message);
  }

  const workDir = mkdtempSync(join(tmpdir(), "lightmapper-first-pass-"));
  try {
    const htmlPath = join(workDir, "probe.html");
    writeFileSync(htmlPath, buildProbePage(vs, fs));

    const result = spawnSync(
      chrome,
      [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu-sandbox",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--user-data-dir=" + join(workDir, "profile"),
        "--virtual-time-budget=15000",
        "--dump-dom",
        "file://" + htmlPath,
      ],
      { encoding: "utf8", timeout: 90_000, maxBuffer: 16 * 1024 * 1024 },
    );

    if (result.error) {
      die(`failed to launch chrome-headless-shell at ${chrome}: ${result.error.message}`);
    }
    if (result.status !== 0) {
      die(
        `chrome-headless-shell exited with status ${result.status}: ` +
          `${(result.stderr || result.stdout || "").trim().slice(0, 2000)}`,
      );
    }

    const match = (result.stdout || "").match(/<pre id="probe-result">([\s\S]*?)<\/pre>/);
    if (!match) {
      die(
        "probe result element missing from DOM; chrome output:\n" +
          `${(result.stdout || result.stderr || "").trim().slice(0, 2000)}`,
      );
    }

    let probe;
    try {
      probe = JSON.parse(Buffer.from(decodeEntities(match[1]).trim(), "base64").toString("utf8"));
    } catch (error) {
      die(`could not decode probe result: ${error.message}`);
    }

    if (probe.error) {
      die(`probe failed: ${probe.error}`);
    }
    if (!probe.ok) {
      console.error(
        `first-pass-sampling: ${probe.failureCount}/${probe.checked} output texels failed`,
      );
      for (const failure of probe.failures) {
        console.error(
          `  output (${failure.output.join(", ")}) expected origin ` +
            `(${failure.expectedOrigin.join(", ")}) but sampled ` +
            `${failure.actualOrigin ? `(${failure.actualOrigin.join(", ")})` : "an out-of-bounds block"}`,
        );
      }
      process.exit(1);
    }

    console.log(
      `✓ first-pass sampling probe passed: ${probe.checked} output texels, ` +
        `${probe.sourceSize[0]}x${probe.sourceSize[1]} source, ` +
        `${probe.weightSize[0]}x${probe.weightSize[1]} weights`,
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main();
