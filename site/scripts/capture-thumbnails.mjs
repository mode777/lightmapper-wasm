// Capture the checked-in gallery thumbnails from the preview routes.
//
//   npm run build --prefix site   # or this script builds for you
//   CHROME_SHELL_PATH=... npm run capture:thumbnails --prefix site

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "vite";
import { launchBrowser, siteRoot, startPreviewServer, waitForExpression } from "./browser.mjs";
import {
  readPreviewVersion,
  readScenarioIds,
  readThumbnailSettings,
  sourceHash
} from "./source-hash.mjs";

const ROOT = siteRoot();
const PREVIEW_DIR = join(ROOT, "src", "assets", "previews");
const BASE = process.env.SITE_BASE || "/";
const CAPTURE_TIMEOUT_MS = 600_000;

async function main() {
  const settings = readThumbnailSettings();
  const previewVersion = readPreviewVersion();

  console.log("[capture] building the site…");
  await build({
    root: ROOT,
    configFile: join(ROOT, "vite.config.ts"),
    logLevel: "error"
  });

  mkdirSync(PREVIEW_DIR, { recursive: true });
  const server = await startPreviewServer({ root: ROOT });
  let browser = null;
  const manifest = {
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

  try {
    browser = await launchBrowser();
    for (const id of readScenarioIds()) {
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
      await waitForExpression(
        page,
        "document.querySelector('.demo-page')?.dataset.bakeState === 'done'",
        { timeout: CAPTURE_TIMEOUT_MS }
      );
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
    }
  } finally {
    if (browser) await browser.close().catch((error) => console.error(`[capture] close: ${error}`));
    await server.close();
  }

  writeFileSync(join(PREVIEW_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[capture] wrote ${join(PREVIEW_DIR, "manifest.json")}`);
}

main().catch((error) => {
  console.error(`[capture] fatal: ${error.stack || error}`);
  process.exitCode = 1;
});
