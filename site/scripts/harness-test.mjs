// Headless harness + display checks. Requires a WebGL2-capable Chrome.

import { launchBrowser, openPage, printChecks, siteRoot, startDevServer, waitForExpression } from "./browser.mjs";

const TIMEOUT_MS = 240_000;

async function main() {
  const server = await startDevServer({ root: siteRoot() });
  let browser = null;

  try {
    browser = await launchBrowser();
    const { page, pageErrors } = await openPage(browser, `${server.url}/test/harness.html`, {
      label: "harness",
      timeout: 30_000
    });

    await waitForExpression(page, "window.__harnessTestResult !== undefined", {
      timeout: TIMEOUT_MS
    });
    const result = await page.evaluate(() => window.__harnessTestResult);
    printChecks("harness", result?.checks ?? []);

    if (result?.error) console.error(`[harness] fatal: ${result.error}`);
    if (pageErrors.length > 0) {
      for (const error of pageErrors) console.error(`[harness] page error: ${error.message}`);
    }
    if (!result?.ok || pageErrors.length > 0) {
      console.error("HARNESS TEST FAIL");
      return false;
    }
    console.log("HARNESS TEST PASS");
    return true;
  } finally {
    if (browser) await browser.close().catch((error) => console.error(`[harness] close: ${error}`));
    await server.close();
  }
}

main()
  .then((ok) => {
    process.exitCode = ok ? 0 : 1;
  })
  .catch((error) => {
    console.error(`[harness] fatal: ${error.stack || error}`);
    console.error("HARNESS TEST FAIL");
    process.exitCode = 1;
  });
