// Shared helpers for the headless Chrome showcase checks.

import { existsSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { createServer, preview } from "vite";

export function chromeShellPath() {
  const candidates = [
    process.env.CHROME_SHELL_PATH,
    path.join(
      os.homedir(),
      "browsers",
      "chrome-headless-shell",
      "linux-131.0.6778.264",
      "chrome-headless-shell-linux64",
      "chrome-headless-shell"
    ),
    path.join(
      os.homedir(),
      ".cache",
      "chrome",
      "manual",
      "chrome-headless-shell-linux64",
      "chrome-headless-shell"
    )
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      `chrome-headless-shell not found; set CHROME_SHELL_PATH (tried ${candidates.join(", ")})`
    );
  }
  return found;
}

export function siteRoot() {
  return path.resolve(import.meta.dirname, "..");
}

export async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

export async function startDevServer({ root = siteRoot(), port } = {}) {
  const resolvedPort = port ?? (await freePort());
  const server = await createServer({
    root,
    configFile: path.join(root, "vite.config.ts"),
    logLevel: "error",
    server: {
      host: "127.0.0.1",
      port: resolvedPort,
      strictPort: true
    }
  });
  await server.listen();
  return {
    url: `http://127.0.0.1:${resolvedPort}`,
    close: () => server.close()
  };
}

export async function startPreviewServer({ root = siteRoot(), port } = {}) {
  const resolvedPort = port ?? (await freePort());
  const server = await preview({
    root,
    configFile: path.join(root, "vite.config.ts"),
    logLevel: "error",
    preview: {
      host: "127.0.0.1",
      port: resolvedPort,
      strictPort: true
    }
  });
  return {
    url: `http://127.0.0.1:${resolvedPort}`,
    close: () =>
      new Promise((resolve) => {
        server.httpServer.close(() => resolve());
      })
  };
}

export async function launchBrowser() {
  return puppeteer.launch({
    executablePath: chromeShellPath(),
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
}

export async function openPage(
  browser,
  url,
  { label = "page", timeout = 30_000, requests = null } = {}
) {
  const page = await browser.newPage();
  const pageErrors = [];
  if (requests) page.on("request", (request) => requests.push(request.url()));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(`[${label}:console] ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error);
    console.error(`[${label}:pageerror] ${error.message}`);
  });
  page.on("requestfailed", (request) => {
    console.error(`[${label}:requestfailed] ${request.url()} — ${request.failure()?.errorText}`);
  });
  await page.goto(url, { waitUntil: "load", timeout });
  return { page, pageErrors };
}

export async function waitForExpression(page, expression, { timeout = 180_000 } = {}) {
  await page.waitForFunction(expression, { timeout, polling: 250 });
}

export function printChecks(label, checks) {
  for (const check of checks) {
    console.log(`[${label}] ${check.ok ? "PASS" : "FAIL"} ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
  }
}
