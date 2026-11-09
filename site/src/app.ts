import { createFooter, createHeader } from "./chrome";
import { createDemoPage } from "./demo-page";
import { scenarioById } from "./demos";
import { el } from "./dom";
import { createGallery } from "./gallery";
import { createNotFound } from "./not-found";
import { createRouter, type Route } from "./router";
import type { View } from "./view";

function viewFor(route: Route): View {
  if (route.name === "gallery") return createGallery(route);
  if (route.name === "demo") {
    const scenario = scenarioById(route.id);
    return scenario ? createDemoPage(scenario, route) : createNotFound(route);
  }
  return createNotFound(route);
}

function titleFor(route: Route): string {
  if (route.name === "gallery") return "lightmapper-wasm showcase";
  if (route.name === "demo") {
    const scenario = scenarioById(route.id);
    if (scenario) return `${scenario.meta.title} · lightmapper-wasm`;
  }
  return "Not found · lightmapper-wasm";
}

export function createApp(mount: HTMLElement): void {
  mount.replaceChildren();
  document.body.classList.remove("preview");

  const main = el("main", { className: "site-main", id: "main" });
  mount.append(createHeader(), main, createFooter());

  let current: View | null = null;

  const router = createRouter((route) => {
    current?.dispose();
    current = null;
    main.replaceChildren();

    if (route.query.get("preview") === "1") document.body.classList.add("preview");
    else document.body.classList.remove("preview");

    document.title = titleFor(route);
    current = viewFor(route);
    main.append(current.element);
    window.scrollTo({ top: 0, behavior: "auto" });
  });

  router.start();
}
