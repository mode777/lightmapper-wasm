// Capture the checked-in gallery thumbnails from the preview routes.
//
//   npm run build --prefix site   # or this script builds for you
//   CHROME_SHELL_PATH=... npm run capture:thumbnails --prefix site

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "vite";
import { launchBrowser, siteRoot, startPreviewServer } from "./browser.mjs";
import {
  readPreviewVersion,
  readScenarioIds,
  readThumbnailSettings,
  sourceHash
} from "./source-hash.mjs";

const ROOT = siteRoot();
const PREVIEW_DIR = join(ROOT, "src", "assets", "previews");
const BASE = process.env.SITE_BASE || "/";
const CAPTURE_TIMEOUT_MS = 900_000;

async function waitForCapture(page, timeout) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const state = await page.evaluate(() => {
      const root = document.querySelector(".demo-page");
      return {
        done: root?.dataset.bakeState === "done",
        error: root?.dataset.errorState,
        status: document.querySelector(".muted")?.textContent ?? ""
      };
    });
    if (state.done) return;
    if (state.error) throw new Error(`bake failed with ${state.error}: ${state.status}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const state = await page.evaluate(() => {
    const root = document.querySelector(".demo-page");
    return {
      state: root?.dataset.bakeState,
      error: root?.dataset.errorState,
      status: document.querySelector(".muted")?.textContent ?? ""
    };
  });
  throw new Error(`timed out waiting for bake: ${JSON.stringify(state)}`);
}

async function main() {
  const settings = readThumbnailSettings();
  const previewVersion = readPreviewVersion();

  const noBuild =
    process.argv.includes("--no-build") || process.env.CAPTURE_NO_BUILD === "1";
  if (!noBuild) {
    console.log("[capture] building the site…");
    await build({
      root: ROOT,
      configFile: join(ROOT, "vite.config.ts"),
      logLevel: "error"
    });
  }

  const allIds = readScenarioIds();
  const onlyArg =
    process.argv.slice(2).find((arg) => arg.startsWith("--only="))?.slice("--only=".length) ??
    process.env.CAPTURE_ONLY;
  const only = onlyArg
    ? new Set(onlyArg.split(",").map((id) => id.trim()).filter(Boolean))
    : null;
  for (const id of only ?? []) {
    if (!allIds.includes(id)) throw new Error(`unknown scenario id in --only: ${id}`);
  }
  const ids = allIds.filter((id) => !only || only.has(id));

  mkdirSync(PREVIEW_DIR, { recursive: true });
  const manifestPath = join(PREVIEW_DIR, "manifest.json");
  const existing =
    only && existsSync(manifestPath)
      ? JSON.parse(readFileSync(manifestPath, "utf8"))
      : null;
  const server = await startPreviewServer({ root: ROOT });
  let browser = null;
  const manifest = existing ?? {
    version: 1,
    previewVersion,
    settings: {
      width: settings.width,
      height: settings.height,
      dpr: settings.dpr,
      format: "webp",
      quality: settings.quality
    },
    scenarios: {}
  };
  manifest.version = 1;
  manifest.previewVersion = previewVersion;
  manifest.settings = {
    width: settings.width,
    height: settings.height,
    dpr: settings.dpr,
    format: "webp",
    quality: settings.quality
  };

  try {
    for (const id of ids) {
      // Each scene gets a fresh browser so a prior bake cannot leave a stale
      // WebGL context or memory pressure behind on slower machines.
      browser = await launchBrowser();
      try {
        const page = await browser.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error));
        await page.setViewport({
          width: settings.width,
          height: settings.height,
          deviceScaleFactor: settings.dpr
        });
        const url = `${server.url}${BASE === "/" ? "" : BASE.replace(/\/$/, "")}/#/p/${id}?preview=1`;
        console.log(`[capture] ${id}: ${url}`);
        await page.goto(url, { waitUntil: "load", timeout: 30_000 });
        await waitForCapture(page, CAPTURE_TIMEOUT_MS);
        await page.evaluate(
          () =>
            new Promise((resolve) => {
              requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined)));
            })
        );

        const file = `${id}.webp`;
        await page.screenshot({
          path: join(PREVIEW_DIR, file),
          type: "webp",
          quality: settings.quality
        });
        if (errors.length > 0) {
          throw new Error(`${id}: page errors: ${errors.map((error) => error.message).join("; ")}`);
        }

        manifest.scenarios[id] = {
          file,
          width: settings.width,
          height: settings.height,
          pixelWidth: settings.width * settings.dpr,
          pixelHeight: settings.height * settings.dpr,
          sourceHash: sourceHash(id),
          previewVersion,
          capturedAt: new Date().toISOString()
        };
        await page.close();
        console.log(`[capture] wrote ${file}`);
      } finally {
        await browser.close().catch((error) => console.error(`[capture] close: ${error}`));
        browser = null;
      }
    }
  } finally {
    if (browser) await browser.close().catch((error) => console.error(`[capture] close: ${error}`));
    await server.close();
  }

  if (only) {
    const ordered = {};
    for (const id of allIds) {
      if (manifest.scenarios[id]) ordered[id] = manifest.scenarios[id];
      else console.warn(`[capture] warning: no thumbnail yet for ${id}`);
    }
    manifest.scenarios = ordered;
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[capture] wrote ${manifestPath}`);
}

main().catch((error) => {
  console.error(`[capture] fatal: ${error.stack || error}`);
  process.exitCode = 1;
});
