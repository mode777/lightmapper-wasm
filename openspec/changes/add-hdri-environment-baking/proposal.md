# Proposal

## Why

The showcase currently bakes only constant ambient colors and emissive geometry.
That leaves out the most common way studio and product scenes are lit: an HDR
environment map. The lightmapper already integrates whatever the caller draws
inside each hemisphere pass, so the site-local bake harness can add HDRI
environment lighting without touching the C library, the wasm build or the
package API. The fifth scenario also gives the showcase a stronger proof of the
recommended workflow than another emitter-only room.

Two showcase copy problems are fixed in the same change. The global navigation
and hero currently feature the Cornell box as if it were a product page rather
than one catalog example, and the gallery does not say that the underlying
library is `lightmapper.h`. The showcase should attribute the single-header
library it is built on and link to it.

## What Changes

- Add an optional linear equirectangular HDR environment to the site-local bake
  harness. When present, the harness draws a fullscreen environment skybox for
  every lightmapper hemisphere side before scene geometry, with depth test and
  depth writes disabled. Environment radiance contributes to direct and
  multi-bounce lighting, and the clear color is no longer the visible
  background.
- Add a fifth showcase scenario, `hdri-studio`, lit solely by a checked-in CC0
  HDRI from Poly Haven. The scenario has no analytic lights and no emissive
  meshes; the environment is the only light source. Add an `environment`
  technique section to the gallery filters.
- Decode the HDRI once in the site with three.js `HDRLoader` in `FloatType`
  mode, normalize it to a bottom-up linear equirectangular buffer, and share
  the same data between the bake harness and the three.js display background.
  The display layer gains an equirectangular HDRI background path; it remains
  bake-free.
- Check in the HDRI under `site/src/assets/environments/` with provenance and
  license notes. Add a developer script that resolves the 1k HDR download URL
  through the Poly Haven API, verifies the expected size/MD5 and refreshes the
  local asset. The site never fetches Poly Haven at runtime and CI does not
  depend on the network for assets.
- Replace the global `Cornell box` nav link and the hero `Open the Cornell box`
  call to action with a neutral gallery action. The Cornell box remains one of
  the catalog scenarios and keeps its card and route.
- Add a visible gallery attribution: "Based on lightmapper.h" with a link to
  `https://github.com/ands/lightmapper` (and the author credit). Rename the
  footer's upstream link so it names `lightmapper.h` explicitly.
- Update the catalog, section coverage, source coverage, thumbnails, headless
  harness checks and smoke bake for the fifth scenario. Add environment-only,
  black-environment, invalid-environment and environment-load-failure checks.
- Update `site/README.md`, the root README showcase section,
  `docs/decisions.md` (new AD-017) and `docs/wasm-improvements.md` (roadmap row
  11) with the implemented behavior and asset provenance.

## Capabilities

### New Capabilities

None. This change extends the showcase capabilities introduced by
`add-showcase-site`; it does not introduce a new durable system capability.

### Modified Capabilities

- `bake-harness`: add an optional equirectangular HDR environment input, a
  hemisphere-pass skybox draw, environment validation, texture lifecycle and
  environment-specific verification.
- `showcase-site`: add the `hdri-studio` scenario and `environment` section,
  HDRI asset provenance and build coverage, the attribution requirement, and
  the neutral global navigation rule.
- `threejs-display`: support a linear equirectangular HDRI scene background in
  addition to solid and transparent backgrounds, including texture ownership
  and disposal.

## Impact

- `site/src/bake/` — scene types, shaders, environment validation and the
  fullscreen skybox draw.
- `site/src/environment/` — new HDR loading/normalization module.
- `site/src/display/` — equirectangular HDRI background support.
- `site/src/demos/` — `hdri-studio`, catalog/source registration, the
  `environment` section and scene metadata.
- `site/src/assets/environments/` — checked-in Poly Haven HDRI, provenance and
  license note.
- `site/scripts/` — HDRI fetch/refresh script, smoke and build checks.
- `site/test/` — catalog, scene, source, environment, thumbnail and harness
  coverage for the new path.
- `site/README.md` and the root `README.md` — scenario list, environment
  workflow, attribution and licensing.
- `docs/decisions.md` — new AD-017; `docs/wasm-improvements.md` — roadmap row
  11 and the showcase subsection.

No upstream `[lightmapper]` task is required: the C library already receives
the environment because it is drawn by the caller. The change does not touch
`thirdparty/lightmapper`, the Emscripten build, the wasm loader, the npm
artifact layout, the public package API or the release workflow.

Out of scope: Node rendering, native GL, WebGL1, worker/off-screen baking, npm
publishing mechanics, PMREM/IBL lighting of display materials, real-time or
dynamic environment updates, runtime HDRI downloads, and promotion of the bake
harness or display layer to package entries (AD-018/AD-019 remain follow-up
changes).
