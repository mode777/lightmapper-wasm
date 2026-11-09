import { el } from "./dom";
import { demoHref } from "./router";

export const REPOSITORY_URL = "https://github.com/mode777/lightmapper-wasm";
export const PACKAGE_URL = "https://www.npmjs.com/package/lightmapper-wasm";

export function createHeader(): HTMLElement {
  return el(
    "header",
    { className: "site-header" },
    el(
      "a",
      { className: "brand", href: "#/", "aria-label": "lightmapper-wasm showcase home" },
      el("span", { className: "brand-mark", "aria-hidden": "true" }, "LM"),
      el(
        "span",
        { className: "brand-copy" },
        el("strong", { textContent: "lightmapper" }),
        el("span", { textContent: "-wasm" })
      )
    ),
    el(
      "nav",
      { className: "site-nav", "aria-label": "Primary" },
      el("a", { href: "#/", textContent: "Gallery" }),
      el("a", { href: demoHref("cornell-box"), textContent: "Cornell box" }),
      el("a", { href: REPOSITORY_URL, textContent: "GitHub", rel: "noreferrer" }),
      el("a", { className: "nav-cta", href: PACKAGE_URL, textContent: "npm", rel: "noreferrer" })
    )
  );
}

export function createFooter(): HTMLElement {
  return el(
    "footer",
    { className: "site-footer" },
    el(
      "p",
      {},
      "Baked in the browser with WebAssembly and WebGL2. Built from the tested ",
      el("code", { textContent: "lightmapper-wasm" }),
      " artifact."
    ),
    el(
      "p",
      { className: "footer-links" },
      el("a", { href: REPOSITORY_URL, textContent: "Source", rel: "noreferrer" }),
      el("a", { href: PACKAGE_URL, textContent: "Package", rel: "noreferrer" }),
      el("a", { href: "https://github.com/ands/lightmapper", textContent: "Upstream lightmapper", rel: "noreferrer" }),
      el("a", { href: "https://github.com/mode777/xatlas-wasm", textContent: "xatlas-wasm", rel: "noreferrer" })
    )
  );
}
