import { el } from "./dom";
import type { Route } from "./router";
import type { View } from "./view";

export function createNotFound(route: Route): View {
  const element = el(
    "section",
    { className: "not-found" },
    el("p", { className: "eyebrow", textContent: "404" }),
    el("h1", { textContent: "That scene is not in the gallery." }),
    el("p", { textContent: `No scenario matches ${route.path}.` }),
    el("a", { className: "button primary", href: "#/", textContent: "Back to the gallery" })
  );
  return { element, dispose: () => undefined };
}
