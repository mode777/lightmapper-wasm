// Headless-browser golden bake driver.
//
// 1. Serves the repository over http://127.0.0.1:<ephemeral>
// 2. Launches chrome-headless-shell (CHROME_SHELL_PATH) with SwiftShader WebGL
// 3. Runs test/bake/index.html and waits for window.__bakeTestResult
// 4. Compares the raw float lightmap against test/golden/quad-bake.f32
//
//   node scripts/run-headless-test.mjs                 # compare against golden
//   node scripts/run-headless-test.mjs --update-golden # rewrite golden files
//
// Requires `npm run build:dist` first (the page imports dist/index.js).

import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import puppeteer from "puppeteer-core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const UPDATE_GOLDEN = process.argv.includes("--update-golden");
const GOLDEN_DIR = join(ROOT, "test", "golden");
const GOLDEN_F32 = join(GOLDEN_DIR, "quad-bake.f32");
const GOLDEN_STATS = join(GOLDEN_DIR, "quad-bake.stats.json");
const RESULTS_PAGE = "test/bake/index.html";
const RESULT_TIMEOUT_MS = 120_000;
const MEAN_TOLERANCE = 0.01;
const PIXEL_DELTA = 0.05;
const PIXEL_DELTA_RATIO_LIMIT = 0.02;

const CHROME_SHELL_PATH =
  process.env.CHROME_SHELL_PATH ||
  join(os.homedir(), "browsers", "chrome-headless-shell", "linux-131.0.6778.264", "chrome-headless-shell-linux64", "chrome-headless-shell");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".f32": "application/octet-stream",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

function startStaticServer() {
  const server = http.createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      const relative = pathname === "/" ? `/${RESULTS_PAGE}` : pathname;
      const filePath = resolve(ROOT, `.${relative}`);
      if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        response.writeHead(404).end(`Not found: ${relative}`);
        return;
      }
      response.writeHead(200, {
        "Content-Type": MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      createReadStream(filePath).pipe(response);
    } catch (error) {
      response.writeHead(500).end(String(error));
    }
  });

  return new Promise((resolvePromise, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolvePromise({ server, port: address.port });
    });
  });
}

function computeStats(data, channels) {
  const min = new Array(channels).fill(Infinity);
  const max = new Array(channels).fill(-Infinity);
  const mean = new Array(channels).fill(0);
  let nonBlackPixels = 0;
  const pixelCount = data.length / channels;

  for (let i = 0; i < data.length; i += channels) {
    let pixelMax = -Infinity;
    for (let c = 0; c < channels; c += 1) {
      const value = data[i + c];
      if (value < min[c]) min[c] = value;
      if (value > max[c]) max[c] = value;
      mean[c] += value;
      if (c < 3 && value > pixelMax) pixelMax = value;
    }
    if (pixelMax > 0.001) nonBlackPixels += 1;
  }

  for (let c = 0; c < channels; c += 1) mean[c] /= pixelCount;
  return { min, max, mean, nonBlackRatio: nonBlackPixels / pixelCount };
}

function decodeF32(result) {
  const { width, height, channels } = result;
  const expectedBytes = width * height * channels * 4;
  if (!result.dataB64) throw new Error("bake result did not include dataB64");
  const buffer = Buffer.from(result.dataB64, "base64");
  if (buffer.byteLength !== expectedBytes) {
    throw new Error(`bake payload size mismatch: got ${buffer.byteLength} bytes, expected ${expectedBytes}`);
  }
  const copy = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new Float32Array(copy);
}

function compareAgainstGolden(actual, result) {
  const { width, height, channels } = result;
  if (!existsSync(GOLDEN_F32) || !existsSync(GOLDEN_STATS)) {
    console.error(`[golden] missing ${GOLDEN_F32} or ${GOLDEN_STATS}`);
    console.error("[golden] run `npm run test:update-golden` to capture them first");
    return false;
  }

  const meta = JSON.parse(readFileSync(GOLDEN_STATS, "utf8"));
  if (meta.width !== width || meta.height !== height || meta.channels !== channels) {
    console.error(
      `[golden] dimensions mismatch: golden ${meta.width}x${meta.height}x${meta.channels}, actual ${width}x${height}x${channels}`
    );
    return false;
  }

  const goldenBuffer = readFileSync(GOLDEN_F32);
  const expectedBytes = width * height * channels * 4;
  if (goldenBuffer.byteLength !== expectedBytes) {
    console.error(`[golden] golden file has ${goldenBuffer.byteLength} bytes, expected ${expectedBytes}`);
    return false;
  }
  const golden = new Float32Array(
    goldenBuffer.buffer.slice(goldenBuffer.byteOffset, goldenBuffer.byteOffset + goldenBuffer.byteLength)
  );

  const actualStats = computeStats(actual, channels);
  const goldenStats = computeStats(golden, channels);
  const meanDiffs = actualStats.mean.map((value, index) => Math.abs(value - goldenStats.mean[index]));

  const pixelCount = width * height;
  let differingPixels = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    let differs = false;
    for (let c = 0; c < channels; c += 1) {
      const index = pixel * channels + c;
      if (Math.abs(actual[index] - golden[index]) > PIXEL_DELTA) {
        differs = true;
        break;
      }
    }
    if (differs) differingPixels += 1;
  }
  const differingRatio = differingPixels / pixelCount;

  console.log(`[golden] per-channel |mean diff|: [${meanDiffs.map((v) => v.toFixed(6)).join(", ")}] (limit ${MEAN_TOLERANCE})`);
  console.log(
    `[golden] pixels differing by >${PIXEL_DELTA}: ${differingPixels}/${pixelCount} (${(differingRatio * 100).toFixed(3)}%, limit ${PIXEL_DELTA_RATIO_LIMIT * 100}%)`
  );
  console.log(
    `[golden] actual mean=[${actualStats.mean.map((v) => v.toFixed(5)).join(", ")}] nonBlackRatio ${actualStats.nonBlackRatio.toFixed(4)}`
  );

  const meansOk = meanDiffs.every((difference) => difference <= MEAN_TOLERANCE);
  const pixelsOk = differingRatio <= PIXEL_DELTA_RATIO_LIMIT;
  if (!meansOk) console.error("[golden] FAIL: channel mean drifted beyond tolerance");
  if (!pixelsOk) console.error("[golden] FAIL: too many pixels changed");
  return meansOk && pixelsOk;
}

function writeGolden(actual, result) {
  mkdirSync(GOLDEN_DIR, { recursive: true });
  const stats = computeStats(actual, result.channels);
  writeFileSync(GOLDEN_F32, Buffer.from(actual.buffer, actual.byteOffset, actual.byteLength));
  writeFileSync(
    GOLDEN_STATS,
    `${JSON.stringify(
      {
        width: result.width,
        height: result.height,
        channels: result.channels,
        stats,
        generatedAt: new Date().toISOString(),
        source: "test/bake/index.html"
      },
      null,
      2
    )}\n`
  );
  console.log(`[golden] wrote ${GOLDEN_F32}`);
  console.log(`[golden] wrote ${GOLDEN_STATS}`);
}

async function main() {
  if (!existsSync(CHROME_SHELL_PATH)) {
    throw new Error(`chrome-headless-shell not found at ${CHROME_SHELL_PATH} (set CHROME_SHELL_PATH)`);
  }
  if (!existsSync(join(ROOT, "dist", "index.js"))) {
    throw new Error("dist/index.js is missing — run `npm run build:dist` first");
  }

  const { server, port } = await startStaticServer();
  let browser = null;
  try {
    console.log(`[driver] chrome: ${CHROME_SHELL_PATH}`);
    browser = await puppeteer.launch({
      executablePath: CHROME_SHELL_PATH,
      headless: "shell",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--use-angle=swiftshader",
        // Chrome 131 requires this to allow the SwiftShader WebGL fallback.
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
        "--mute-audio",
        "--hide-scrollbars"
      ]
    });

    const page = await browser.newPage();
    page.on("console", (message) => console.log(`[browser:${message.type()}] ${message.text()}`));
    page.on("pageerror", (error) => console.error(`[browser:pageerror] ${error.message}`));
    page.on("requestfailed", (request) =>
      console.error(`[browser:requestfailed] ${request.url()} — ${request.failure()?.errorText}`)
    );

    const url = `http://127.0.0.1:${port}/${RESULTS_PAGE}`;
    console.log(`[driver] opening ${url}`);
    await page.goto(url, { waitUntil: "load", timeout: 30_000 });
    await page.waitForFunction("window.__bakeTestResult !== undefined", {
      timeout: RESULT_TIMEOUT_MS,
      polling: 250
    });

    const result = await page.evaluate(() => window.__bakeTestResult);
    if (!result || result.ok !== true) {
      console.error(`[driver] bake failed: ${result?.error || "no result"}`);
      return false;
    }

    console.log(
      `[driver] bake ok: ${result.width}x${result.height}x${result.channels}, ` +
        `nonBlackRatio=${result.stats?.nonBlackRatio?.toFixed(4) ?? "n/a"}`
    );
    const actual = decodeF32(result);

    if (UPDATE_GOLDEN) {
      writeGolden(actual, result);
      return true;
    }
    return compareAgainstGolden(actual, result);
  } finally {
    if (browser) await browser.close().catch((error) => console.error(`[driver] browser close failed: ${error}`));
    await new Promise((resolvePromise) => server.close(resolvePromise));
  }
}

main()
  .then((passed) => {
    console.log(passed ? "BAKE TEST PASS" : "BAKE TEST FAIL");
    process.exitCode = passed ? 0 : 1;
  })
  .catch((error) => {
    console.error(`[driver] fatal: ${error.stack || error}`);
    console.log("BAKE TEST FAIL");
    process.exitCode = 1;
  });
