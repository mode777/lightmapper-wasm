# Proposal

## Why

The showcase has ambient-only, emissive-only and environment-only scenarios, but
every environment scene depends on a checked-in HDR file. It has no example of
the common non-HDRI outdoor setup: a directional sun plus a procedural sky. That
leaves users without a reference when an HDRI is too large, unavailable, or
undesirable for a scene, and it means the environment path is only proven against
Radiance files rather than against generated linear equirectangular data.

## What Changes

- Turn the scene environment descriptor into a discriminated union:
  `kind: "hdr"` with a Vite-resolved URL and intensity for the existing
  `hdri-studio` and `hdri-outdoor` scenes, and `kind: "sky"` with a procedural
  gradient and sun descriptor. The demo page resolves either kind to the same
  bake-environment plus display-texture pair.
- Add a deterministic procedural-sky generator under
  `site/src/environment/sky.ts`. It produces bottom-up linear RGBA float
  equirectangular data from a zenith/horizon/ground gradient and a sun disk
  described by direction, color, angular radius and intensity. It reuses
  the existing environment validation and `DataTexture` path; no `.hdr` file,
  network request or new dependency is involved.
- Add a seventh scenario, `sun-sky-outdoor`: a non-HDRI courtyard with lit
  meshes only, black ambient and no emissive geometry. The generated sky
  gradient supplies the cool fill, and a low sun disk in the same environment
  supplies the directional direct light and shadows.
- Broaden the `environment` technique section to cover checked-in HDRI and
  procedural-sky scenes, and register the new scenario in the catalog, raw
  source coverage, expected ids and gallery copy.
- Add generator unit tests, scene/catalog/source/thumbnail coverage, a
  procedural-sky harness check and a preview smoke bake for the new route.
  Recapture the thumbnails affected by the shared scene-contract change. The
  production build check remains valid because the new environment has no file
  asset.
- Update `site/README.md`, the root `README.md`, the showcase subsection and
  roadmap in `docs/wasm-improvements.md`, and the showcase sentence in
  `openspec/config.yaml`.

The directional light is a small, bright sun disk inside the generated
equirectangular environment. `lightmapper.h` already integrates whatever the
caller draws into each hemisphere pass, so this needs no new analytic-light API,
harness shader, C change or package change.

## Capabilities

### New Capabilities

None. The change extends the established showcase capability; it does not
introduce a durable new system capability.

### Modified Capabilities

- `showcase-site`: add the `sun-sky-outdoor` scenario and the procedural-sky
  environment descriptor/generator; broaden the `environment` filter to cover
  procedural skies; extend the catalog, source, thumbnail and smoke-bake
  validation for the seventh scenario.

## Impact

All work items are owned by `mode777/lightmapper-wasm`; no `[lightmapper]`
upstream task is required.

- `site/src/demos/types.ts`, `sections.ts`, `coverage.ts`, `index.ts`,
  `sources.ts` — the environment union, the broadened section text, the new
  scenario id and catalog registration.
- `site/src/environment/sky.ts` — new deterministic procedural-sky generator
  and descriptor validation; `site/src/environment/hdr.ts` continues to own the
  shared environment texture helper.
- `site/src/demos/sun-sky-outdoor.ts` — new scene module.
- `site/src/demo-page.ts` — resolve `kind: "hdr"` or `kind: "sky"` before
  creating the display and bake scene; the display texture is the same
  generated environment the bake receives.
- `site/test/` and `site/scripts/` — generator, catalog, scene, source,
  thumbnail, harness and smoke coverage; `source-hash.mjs` includes the
  procedural generator in the new scene's hash.
- `site/src/assets/previews/` and `site/README.md`; the root `README.md`;
  `docs/wasm-improvements.md`; `openspec/config.yaml`.
- No change to `site/src/bake/`, `site/src/display/`, `thirdparty/lightmapper`,
  `src/`, `wasm/`, the Emscripten build, the wasm loader, the npm artifact
  layout, the public package API or the release workflow. The bake harness
  already accepts arbitrary linear equirectangular `BakeEnvironment` data and
  the display already accepts an equirectangular background texture (AD-017).

This change implements AD-017 (environment baking in the showcase), AD-016
(xatlas-everywhere UVs) and AD-015 (the showcase is a separate consumer deployed
from the tested artifact). It introduces no new decision and does not supersede
an accepted ADR. The sun is part of the generated environment, not a new
analytic-light or harness feature.

Dependency: `add-hdri-environment-baking` is implemented but not yet archived.
Archive it before archiving this change so the six-scenario catalog requirement
is in the main spec before this change replaces it with the seven-scenario
version. Implementation can proceed on the current code because the sixth
scenario, the environment path and the display background already exist.

Out of scope: analytic point/directional lights, a new bake-harness light type
or shader pass, time-of-day or dynamic sky controls, cloud or weather
simulation, HDRI asset changes, Node rendering, native GL, WebGL1, worker or
off-screen baking, npm publishing mechanics, real-time display lighting and
promotion of the harness or display to package entries (AD-018/AD-019 remain
follow-up changes). No upstream `[lightmapper]` task is required.
