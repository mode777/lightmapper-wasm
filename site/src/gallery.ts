import { SCENARIOS } from "./demos";
import { sectionInfo, SECTIONS } from "./demos/sections";
import type { SceneDefinition, SceneSection } from "./demos/types";
import { el } from "./dom";
import { demoHref, type Route } from "./router";
import type { View } from "./view";

const THUMBNAILS = import.meta.glob("/src/assets/previews/*.webp", {
  eager: true,
  query: "?url",
  import: "default"
}) as Record<string, string>;

function thumbnailFor(id: string): string | null {
  return THUMBNAILS[`/src/assets/previews/${id}.webp`] ?? null;
}

export function createGallery(_route: Route): View {
  const cards: HTMLElement[] = [];

  const grid = el("div", { className: "gallery-grid" });
  for (const scenario of SCENARIOS) {
    const card = sceneCard(scenario);
    cards.push(card);
    grid.append(card);
  }

  const filters = el("div", { className: "filters", role: "group", "aria-label": "Filter by technique" });
  const allButton = filterButton("All", "all");
  filters.append(allButton);
  for (const section of SECTIONS) filters.append(filterButton(section.label, section.id));

  function filterButton(label: string, id: SceneSection | "all"): HTMLButtonElement {
    return el(
      "button",
      {
        type: "button",
        className: id === "all" ? "filter active" : "filter",
        textContent: label,
        "aria-pressed": id === "all" ? "true" : "false",
        dataset: { filter: id },
        onClick: () => {
          for (const button of filters.querySelectorAll<HTMLButtonElement>(".filter")) {
            const active = button.dataset.filter === id;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
          }
          for (const card of cards) {
            const sections = (card.dataset.sections ?? "").split(" ");
            card.hidden = id !== "all" && !sections.includes(id);
          }
        }
      }
    );
  }

  const element = el(
    "section",
    { className: "gallery" },
    el(
      "div",
      { className: "hero panel" },
      el(
        "div",
        {},
        el("p", { className: "eyebrow", textContent: "WebAssembly lightmap baking" }),
        el(
          "h1",
          {},
          "Light, ",
          el("span", { textContent: "baked" }),
          " in the browser."
        ),
        el("p", {
          className: "hero-lead",
          textContent:
            "Four scenes, one raw-WebGL bake harness and a shared xatlas atlas. Every lightmap is computed on the GPU from the same wasm artifact the package ships."
        }),
        el(
          "div",
          { className: "hero-actions" },
          el("a", {
            className: "button primary",
            href: demoHref("cornell-box"),
            textContent: "Open the Cornell box"
          }),
          el("a", {
            className: "button",
            href: "https://github.com/mode777/lightmapper-wasm/blob/Main/LIGHTMAPPER.md",
            textContent: "Read the API guide",
            rel: "noreferrer"
          }),
          el("a", {
            className: "button",
            href: "https://github.com/mode777/lightmapper-wasm",
            textContent: "View source",
            rel: "noreferrer"
          })
        )
      ),
      el(
        "div",
        { className: "hero-facts", "aria-label": "Showcase facts" },
        fact(String(SCENARIOS.length), "procedural scenarios"),
        fact("3", "views per scene: 3D, atlas, code"),
        fact("2", "wasm modules: lightmapper + xatlas"),
        fact(String(SCENARIOS.reduce((sum, scene) => sum + scene.bake.bounces, 0)), "configured bounces")
      )
    ),
    el(
      "div",
      { className: "section-heading" },
      el("h2", { textContent: "Bake gallery" }),
      el("p", {
        textContent:
          "Filter by the technique a scene demonstrates. Every scenario unwraps its lit meshes through one xatlas atlas."
      })
    ),
    filters,
    grid,
    el("p", {
      className: "thumbnail-note",
      textContent:
        "Thumbnails are captured from the preview routes with headless Chrome and checked against the scene source hash."
    })
  );

  return {
    element,
    dispose: () => undefined
  };
}

function fact(value: string, label: string): HTMLElement {
  return el(
    "div",
    { className: "fact" },
    el("strong", { textContent: value }),
    el("span", { textContent: label })
  );
}

function sceneCard(scenario: SceneDefinition): HTMLElement {
  const thumb = thumbnailFor(scenario.meta.id);
  const fallback = el("div", { className: "card-fallback", textContent: scenario.meta.id });
  const preview = el("a", {
    className: "card-preview",
    href: demoHref(scenario.meta.id),
    "aria-label": `Open ${scenario.meta.title}`
  });
  preview.append(fallback);
  if (thumb) {
    const image = el("img", {
      src: thumb,
      alt: `${scenario.meta.title} baked preview`,
      loading: "eager",
      decoding: "async"
    });
    const showFallback = (): void => {
      image.remove();
      fallback.style.display = "";
    };
    const hideFallback = (): void => {
      fallback.style.display = "none";
    };
    image.addEventListener("load", hideFallback);
    image.addEventListener("error", showFallback);
    if (image.complete) {
      if (image.naturalWidth > 0) hideFallback();
      else showFallback();
    }
    preview.append(image);
  }

  const labels = el("div", { className: "card-labels" });
  const sectionLabels = new Set(
    scenario.meta.sections.map((section) => sectionInfo(section).label.toLowerCase())
  );
  for (const section of scenario.meta.sections) {
    labels.append(el("span", { className: "label technique", textContent: sectionInfo(section).label }));
  }
  for (const feature of scenario.meta.features) {
    if (!sectionLabels.has(feature.toLowerCase())) {
      labels.append(el("span", { className: "label", textContent: feature }));
    }
  }

  return el(
    "article",
    {
      className: "scene-card",
      dataset: {
        sections: scenario.meta.sections.join(" "),
        scenario: scenario.meta.id
      }
    },
    preview,
    el(
      "div",
      { className: "card-body" },
      el("h3", {}, el("a", { href: demoHref(scenario.meta.id), textContent: scenario.meta.title })),
      el("p", { textContent: scenario.meta.description }),
      labels,
      el("p", {
        className: "faint",
        textContent: `${scenario.bake.atlasSize}² atlas · ${scenario.bake.bounces} bounce${
          scenario.bake.bounces === 1 ? "" : "s"
        } · ${(scenario.bake.atlasSize * scenario.bake.atlasSize).toLocaleString("en-US")} texels`
      })
    )
  );
}
