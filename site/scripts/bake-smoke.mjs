// Headless showcase smoke test: gallery, preview bakes, tabs and failure states.

import { launchBrowser, openPage, siteRoot, startDevServer, waitForExpression } from "./browser.mjs";

const BAKE_TIMEOUT_MS = 600_000;
const FAILURE_ROUTES = ["webgl2", "float", "lightmapper", "xatlas", "hdri"];

function check(name, condition, detail = "") {
  if (condition) {
    console.log(`[smoke] PASS ${name}`);
    return true;
  }
  console.error(`[smoke] FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  return false;
}

async function openRoute(browser, base, path, label) {
  const requests = [];
  const { page, pageErrors } = await openPage(browser, `${base}${path}`, {
    label,
    timeout: 30_000,
    requests
  });
  return { page, pageErrors, requests };
}

async function waitForDemoState(page, timeout = BAKE_TIMEOUT_MS) {
  await waitForExpression(
    page,
    "document.querySelector('.demo-page')?.dataset.bakeState === 'done' || document.querySelector('.demo-page')?.dataset.errorState !== undefined",
    { timeout }
  );
}

async function checkGallery(browser, base, results) {
  const { page, pageErrors } = await openRoute(browser, base, "/", "gallery");
  try {
    await waitForExpression(page, "document.querySelectorAll('.scene-card').length > 0", {
      timeout: 60_000
    });
    const count = await page.$$eval(".scene-card", (cards) => cards.length);
    results.push(check("gallery renders six scenarios", count === 6, `saw ${count}`));

    await page.click('[data-filter="ambient"]');
    const visible = await page.$$eval(".scene-card", (cards) =>
      cards.filter((card) => !card.hidden).map((card) => card.dataset.scenario)
    );
    results.push(
      check("gallery filter narrows to ambient", visible.length === 1 && visible[0] === "ao-studio", visible.join(","))
    );

    await page.click('[data-filter="environment"]');
    const environmentVisible = await page.$$eval(".scene-card", (cards) =>
      cards.filter((card) => !card.hidden).map((card) => card.dataset.scenario)
    );
    results.push(
      check(
        "gallery filter narrows to the environment scenarios",
        environmentVisible.length === 2 &&
          environmentVisible.includes("hdri-studio") &&
          environmentVisible.includes("hdri-outdoor"),
        environmentVisible.join(",")
      )
    );

    await page.click('[data-filter="all"]');
    const restored = await page.$$eval(".scene-card", (cards) => cards.filter((card) => !card.hidden).length);
    results.push(check("gallery filter restores all scenarios", restored === 6, `saw ${restored}`));

    await page.waitForFunction(
      () => [...document.querySelectorAll(".card-preview img")].every((image) => image.complete),
      { timeout: 30_000 }
    );
    const thumbnails = await page.$$eval(".card-preview img", (images) =>
      images.map((image) => ({ src: image.getAttribute("src") ?? "", width: image.naturalWidth }))
    );
    results.push(
      check(
        "gallery loads the checked-in thumbnails",
        thumbnails.length === 6 && thumbnails.every((image) => image.width > 0 && image.src.includes(".webp")),
        JSON.stringify(thumbnails)
      )
    );

    const attribution = await page.$eval(".hero-attribution a", (anchor) => ({
      text: anchor.textContent ?? "",
      href: anchor.getAttribute("href") ?? ""
    }));
    results.push(
      check(
        "gallery attributes lightmapper.h with an upstream link",
        attribution.text.includes("lightmapper.h") &&
          attribution.href === "https://github.com/ands/lightmapper",
        JSON.stringify(attribution)
      )
    );

    const featured = await page.$$eval(".site-nav a, .hero-actions a", (links) =>
      links
        .map((link) => link.getAttribute("href") ?? "")
        .filter((href) => href.includes("/p/"))
    );
    results.push(check("gallery does not feature one scenario link", featured.length === 0, featured.join(",")));
    results.push(check("gallery has no page errors", pageErrors.length === 0, pageErrors.map((e) => e.message).join("; ")));
  } finally {
    await page.close();
  }
}

async function checkPreviewBake(browser, base, id, results) {
  const { page, pageErrors, requests } = await openRoute(browser, base, `/#/p/${id}?preview=1`, id);
  try {
    await waitForDemoState(page);
    const state = await page.evaluate(() => {
      const root = document.querySelector(".demo-page");
      return {
        bakeState: root?.dataset.bakeState,
        errorState: root?.dataset.errorState,
        showcase: window.__showcase,
        bodyPreview: document.body.classList.contains("preview"),
        headerDisplay: getComputedStyle(document.querySelector(".site-header")).display,
        asideDisplay: getComputedStyle(document.querySelector(".demo-aside")).display,
        tabsDisplay: getComputedStyle(document.querySelector(".tabs")).display,
        stageRatio: (() => {
          const stage = document.querySelector(".stage");
          const rect = stage.getBoundingClientRect();
          return rect.height > 0 ? rect.width / rect.height : 0;
        })()
      };
    });

    results.push(check(`${id} preview bake reaches done`, state.bakeState === "done", state.errorState ?? ""));
    const stats = state.showcase?.stats;
    results.push(
      check(
        `${id} returns finite non-zero statistics`,
        Boolean(
          stats &&
            Number.isFinite(stats.mean) &&
            Number.isFinite(stats.max) &&
            stats.max > 0 &&
            stats.nonBlackRatio > 0
        ),
        JSON.stringify(stats)
      )
    );
    results.push(
      check(
        `${id} preview hides page chrome`,
        state.bodyPreview &&
          state.headerDisplay === "none" &&
          state.asideDisplay === "none" &&
          state.tabsDisplay === "none"
      )
    );
    results.push(check(`${id} preview stage is 16:10`, Math.abs(state.stageRatio - 1.6) < 0.03, String(state.stageRatio)));

    const bakesBefore = state.showcase?.bakes;
    await page.evaluate(() => document.querySelector('[data-tab="code"]')?.click());
    await page.waitForFunction(() => document.querySelector(".code-view code")?.textContent?.includes("export const"), {
      timeout: 30_000
    });
    const sourceMatches = await page.evaluate(async (scenarioId) => {
      const module = await import("/src/demos/sources.ts");
      const code = document.querySelector(".code-view code")?.textContent ?? "";
      return code === module.SCENE_SOURCES[scenarioId];
    }, id);
    results.push(check(`${id} code view matches sources.ts`, sourceMatches));

    await page.evaluate(() => document.querySelector('[data-tab="atlas"]')?.click());
    const atlas = await page.evaluate(() => {
      const lightmap = document.querySelector(".atlas-frame canvas");
      return {
        width: lightmap?.width ?? 0,
        height: lightmap?.height ?? 0,
        info: document.querySelector(".atlas-view .thumbnail-note")?.textContent ?? ""
      };
    });
    results.push(
      check(`${id} atlas view has the baked lightmap`, atlas.width > 0 && atlas.height > 0 && atlas.info.includes("charts"), JSON.stringify(atlas))
    );

    await page.evaluate(() => document.querySelector('[data-tab="3d"]')?.click());
    const bakesAfter = await page.evaluate(() => window.__showcase?.bakes);
    results.push(check(`${id} switching tabs does not re-bake`, bakesAfter === bakesBefore, `${bakesBefore} -> ${bakesAfter}`));

    if (id.startsWith("hdri-")) {
      const hdriRequests = requests.filter((url) => url.includes(".hdr"));
      const external = requests.filter(
        (url) => url.includes("polyhaven.com") || url.includes("polyhaven.org")
      );
      results.push(
        check(
          `${id} loads the HDRI from the site origin`,
          hdriRequests.length > 0 &&
            hdriRequests.every((url) => url.startsWith(base)) &&
            external.length === 0,
          JSON.stringify({ hdriRequests, external })
        )
      );
    }

    results.push(check(`${id} has no page errors`, pageErrors.length === 0, pageErrors.map((e) => e.message).join("; ")));
  } finally {
    await page.close();
  }
}

async function checkFailureState(browser, base, mode, results) {
  const expected = {
    webgl2: "webgl2",
    float: "ext_color_buffer_float",
    lightmapper: "lightmapper-wasm",
    xatlas: "xatlas-wasm",
    hdri: "hdri"
  }[mode];
  const { page, pageErrors } = await openRoute(
    browser,
    base,
    `/#/p/ao-studio?preview=1&fail=${mode}`,
    `fail-${mode}`
  );
  try {
    await waitForExpression(
      page,
      "document.querySelector('.demo-page')?.dataset.errorState !== undefined",
      { timeout: 120_000 }
    );
    const state = await page.evaluate(() => {
      const root = document.querySelector(".demo-page");
      return {
        errorState: root?.dataset.errorState,
        message: document.querySelector(".error-panel")?.textContent ?? "",
        bakeDisabled: document.querySelector(".aside-card .button.primary")?.disabled,
        stageMessage: document.querySelector(".stage-message")?.textContent ?? ""
      };
    });
    results.push(check(`${mode} failure names the error`, state.errorState === expected, state.errorState ?? ""));
    results.push(
      check(
        `${mode} failure disables bake and shows a message`,
        state.bakeDisabled === true && state.message.length > 0 && state.stageMessage.length > 0,
        JSON.stringify(state)
      )
    );
    results.push(check(`${mode} failure has no page errors`, pageErrors.length === 0, pageErrors.map((e) => e.message).join("; ")));
  } finally {
    await page.close();
  }
}

async function main() {
  const server = await startDevServer({ root: siteRoot() });
  let browser = null;
  const results = [];

  try {
    browser = await launchBrowser();
    await checkGallery(browser, server.url, results);
    await checkPreviewBake(browser, server.url, "cornell-box", results);
    await checkPreviewBake(browser, server.url, "tabletop-atlas", results);
    await checkPreviewBake(browser, server.url, "hdri-studio", results);
    await checkPreviewBake(browser, server.url, "hdri-outdoor", results);
    for (const mode of FAILURE_ROUTES) {
      await checkFailureState(browser, server.url, mode, results);
    }
  } finally {
    if (browser) await browser.close().catch((error) => console.error(`[smoke] close: ${error}`));
    await server.close();
  }

  if (!results.every(Boolean)) {
    console.error("SMOKE TEST FAIL");
    return false;
  }
  console.log("SMOKE TEST PASS");
  return true;
}

main()
  .then((ok) => {
    process.exitCode = ok ? 0 : 1;
  })
  .catch((error) => {
    console.error(`[smoke] fatal: ${error.stack || error}`);
    console.error("SMOKE TEST FAIL");
    process.exitCode = 1;
  });
