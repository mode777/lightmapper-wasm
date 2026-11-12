# Spec Delta

## ADDED Requirements

### Requirement: Dusk HDRI scenario

The showcase SHALL provide an `hdri-dusk` scenario whose lit meshes are
illuminated solely by a checked-in linear equirectangular dusk HDRI from Poly
Haven's Qwantani Dusk 2 (Pure Sky). It SHALL use black ambient, contain no
emissive meshes, display the same HDRI as its background, and appear in the
catalog with the `environment` section and a preview route.

#### Scenario: Dusk scene is in the catalog

- **WHEN** the gallery is rendered
- **THEN** `hdri-dusk` appears with the environment section, a preview route and a checked-in thumbnail

#### Scenario: Dusk sky is the only light

- **WHEN** the dusk scene is baked
- **THEN** its lightmap is non-black solely because of the dusk environment, with black ambient, no emissive meshes and no analytic lights

#### Scenario: Background shows the dusk sky

- **WHEN** the dusk demo page loads
- **THEN** the 3D viewport uses the same Qwantani Dusk 2 Pure Sky HDRI as its background and shows no baked terrain

#### Scenario: Dusk reads as soft fill

- **WHEN** an isolated object is baked in the dusk scene
- **THEN** the environment provides a soft, low-contrast blue-hour fill with no crisp directional sun shadow

#### Scenario: Dusk scene compiles its source view

- **WHEN** the dusk scene's Code view is opened
- **THEN** it shows the exact scene module source that produced the current bake

### Requirement: Site validation and HDRI production build

The site test suite SHALL validate catalog metadata, scene and atlas geometry,
source coverage and thumbnail coverage. A headless smoke bake SHALL cover the
Cornell box, tabletop, HDRI studio, HDRI outdoor and HDRI dusk scenes. A
production build SHALL emit and reference the hashed `lightmapper.wasm`,
`xatlas.wasm` and all three checked-in HDRI assets.

#### Scenario: Valid catalog

- **WHEN** the site validation suite runs
- **THEN** every scenario has unique metadata, valid sections, a source entry and finite geometry

#### Scenario: Broken scene fails CI

- **WHEN** a scenario throws, unwraps to empty geometry or produces a non-finite value
- **THEN** the suite fails and names the scenario

#### Scenario: Smoke bake completes

- **WHEN** the headless smoke test opens the Cornell box, tabletop, HDRI studio, HDRI outdoor and HDRI dusk preview routes
- **THEN** all five bakes reach the done state with finite, non-zero lightmap statistics

#### Scenario: Wasm assets are emitted and referenced

- **WHEN** the site is built with `SITE_BASE=/lightmapper-wasm/`
- **THEN** the output contains a hashed `lightmapper.wasm` and `xatlas.wasm` and the built JavaScript references both

#### Scenario: HDRI assets are emitted and referenced

- **WHEN** the site is built with `SITE_BASE=/lightmapper-wasm/`
- **THEN** the output contains all three checked-in HDRI assets and the built JavaScript references them

### Requirement: Outdoor HDRI feature sampling

The `hdri-outdoor` and `hdri-dusk` bake environments SHALL prefilter their
brightest feature, the sun/cloud field or the dusk horizon glow, so it covers
no fewer than six hemicube texels at the standard H64 and high H128 presets.
`hdri-studio` and the non-outdoor scenarios SHALL keep their existing lighting.

#### Scenario: HDRI outdoor meets the budget

- **WHEN** `hdri-outdoor` is baked at H64
- **THEN** its prefiltered sun/cloud feature covers at least six hemicube texels and the full-resolution HDRI remains the display background

#### Scenario: Dusk horizon meets the budget

- **WHEN** `hdri-dusk` is baked at H64
- **THEN** its prefiltered bright horizon feature covers at least six hemicube texels and the full-resolution dusk HDRI remains the display background

#### Scenario: High quality meets the budget

- **WHEN** either outdoor HDRI scene is baked at H128
- **THEN** its brightest feature covers at least six texels and the shading remains consistent with H64

#### Scenario: Studio scene is unchanged

- **WHEN** `hdri-studio` is baked
- **THEN** it keeps its existing environment-only lighting and smoothing

#### Scenario: Sampling budget is enforced

- **WHEN** a scene declares a bright feature below the six-texel budget
- **THEN** the scene test fails and names the computed texel coverage

#### Scenario: One soft shadow per isolated object

- **WHEN** an isolated object is baked in an outdoor scene
- **THEN** it produces one soft area-light shadow rather than multiple hemicube-shaped lobes

### Requirement: Outdoor HDRI diffuse weighting

The outdoor environment scenes SHALL use cosine hemisphere weighting. The
non-outdoor scenes SHALL keep the uniform default unless they opt in. Outdoor
sun/sky exposure SHALL be recalibrated for the cosine response.

#### Scenario: Dusk outdoor scene uses cosine

- **WHEN** `hdri-dusk` is baked
- **THEN** every lightmapper context uses the cosine hemisphere weight

#### Scenario: HDRI outdoor scene uses cosine

- **WHEN** `hdri-outdoor` is baked
- **THEN** every lightmapper context uses the cosine hemisphere weight

#### Scenario: Non-outdoor scenes keep uniform

- **WHEN** `ao-studio`, `cornell-box`, `emissive-alcove`, `tabletop-atlas` or `hdri-studio` is baked
- **THEN** it keeps the uniform default and its existing lighting

#### Scenario: Grazing light is reduced

- **WHEN** an outdoor scene with a low sun is baked with cosine weighting
- **THEN** its grazing sun and horizon-sky contribution is lower than the uniform result

#### Scenario: Exposure is recalibrated

- **WHEN** the outdoor scenes are switched to cosine weighting
- **THEN** their sun/sky intensity is tuned so the overall exposure and shadow readability remain comparable to the previous bake

### Requirement: HDRI bake and display variants

The showcase environment resolver SHALL produce a display environment or
texture and a bake environment from a checked-in HDRI. The display SHALL use
the full decoded data; the bake SHALL use a prefiltered diffuse copy. Both
SHALL preserve orientation and intensity, and invalid or unsupported data
SHALL be rejected before GPU resources are created.

#### Scenario: HDRI display and bake variants

- **WHEN** an HDRI environment is resolved
- **THEN** the display texture uses the full decoded data and the bake copy uses the broader prefilter

#### Scenario: Intensity is preserved

- **WHEN** the display and bake variants are resolved
- **THEN** both apply the scene's environment intensity without duplicating or dropping it

#### Scenario: No-sun environment is unchanged

- **WHEN** a scene has an environment and no outdoor sun preset
- **THEN** the bake and display environments keep their existing prefilter and data behavior

#### Scenario: Invalid environment is rejected

- **WHEN** the source dimensions, data length, finite values or intensity are invalid
- **THEN** the scene reports a clear environment error and creates no bake or display texture

#### Scenario: Unsupported environment kind is rejected

- **WHEN** a scene descriptor requests an environment kind other than a checked-in HDRI
- **THEN** the page reports an environment error and starts no bake

### Requirement: Outdoor HDRI smoothing and quality presets

The `hdri-outdoor` and `hdri-dusk` presets SHALL use twelve smoothing passes
because their prefiltered cloud and horizon fields expose line artifacts at
lower smoothing. Neither preset SHALL rely on smoothing alone to hide hemicube
sampling. The standard preset SHALL remain H64 and the high preset SHALL use
H128.

#### Scenario: HDRI lines are suppressed

- **WHEN** either outdoor HDRI scene is baked
- **THEN** it uses twelve smoothing passes and its close-up render has no lightmap line artifacts

#### Scenario: Standard and high presets

- **WHEN** the quality selector is changed
- **THEN** standard uses H64 and high uses H128 while the brightest environment feature remains within the sampling budget

#### Scenario: Other scenes keep their presets

- **WHEN** a non-outdoor scene is baked
- **THEN** its existing hemisphere size and smoothing preset remain unchanged

## MODIFIED Requirements

### Requirement: Gallery lists the scenario catalog

The gallery SHALL list the seven scenarios `ao-studio`, `cornell-box`,
`emissive-alcove`, `tabletop-atlas`, `hdri-studio`, `hdri-outdoor` and
`hdri-dusk`. Each entry SHALL show a title, a short description, feature
labels and technique sections, and SHALL link to a stable route. The gallery
SHALL support filtering by section, including `environment` for the
checked-in HDRI scenes.

#### Scenario: Gallery renders

- **WHEN** a visitor opens the site root
- **THEN** all seven catalog scenarios appear with their metadata

#### Scenario: Deep link opens a scenario

- **WHEN** a visitor opens a scenario route directly
- **THEN** that scenario's page loads with its 3D view and metadata

#### Scenario: Filter narrows the gallery

- **WHEN** the visitor selects a technique section
- **THEN** only scenarios declaring that section remain visible

#### Scenario: Environment filter

- **WHEN** the visitor selects the environment section
- **THEN** the three checked-in HDRI scenarios remain visible

#### Scenario: Unknown route shows not found

- **WHEN** a visitor opens a route that is not in the catalog
- **THEN** the site shows a not-found page instead of a blank view

#### Scenario: Removed scene has no route

- **WHEN** a visitor opens the former `sun-sky-outdoor` route
- **THEN** the site shows the not-found page and starts no bake

### Requirement: Outdoor HDRI scenario

The showcase SHALL provide an `hdri-outdoor` scenario whose lit meshes are
illuminated solely by a checked-in linear equirectangular daytime outdoor HDRI.
The scenario SHALL declare no analytic lights and no emissive meshes, SHALL use
a black ambient color and SHALL display the same daytime HDRI as its background.
The asset SHALL be Poly Haven's Pure Sky variant so the scene's own ground plane
is the only ground; the background SHALL NOT show baked terrain, hills or a
second horizon.

#### Scenario: Outdoor HDRI is in the catalog

- **WHEN** the gallery is rendered
- **THEN** `hdri-outdoor` appears with the environment section and a preview route

#### Scenario: Daylight is the only light

- **WHEN** the HDRI outdoor scene is baked
- **THEN** its lightmap is non-black solely because of the daytime environment, with black ambient and no emissive meshes

#### Scenario: Background shows the daytime sky

- **WHEN** the HDRI outdoor demo page loads
- **THEN** the 3D viewport uses the same daytime Pure Sky HDRI as its background and shows no baked terrain

#### Scenario: Outdoor asset is the Pure Sky variant

- **WHEN** the `hdri-outdoor` environment descriptor is inspected
- **THEN** it references the Pure Sky Kloofendal asset and not the version with baked ground and hills

### Requirement: HDRI asset provenance and build

The HDRIs used by the showcase SHALL be checked-in CC0 Poly Haven assets with
their sources, authors, licenses and variants recorded. A developer script
SHALL resolve each asset through the Poly Haven API and verify its expected
size or checksum. The site SHALL NOT fetch Poly Haven or another external host
at runtime, and the production build SHALL emit and reference the checked-in
HDRI assets.

#### Scenario: Provenance is recorded

- **WHEN** the environment asset directory is inspected
- **THEN** it contains the studio, Pure Sky daytime and Pure Sky dusk HDRIs and a note naming Poly Haven, each asset id, variant, author and CC0

#### Scenario: Runtime is self-contained

- **WHEN** an HDRI demo page loads from the built site
- **THEN** its HDRI is served from the site origin and no request goes to Poly Haven

#### Scenario: Refresh script uses the API

- **WHEN** the developer runs the HDRI refresh script
- **THEN** it resolves each download URL through the Poly Haven API, verifies the asset and writes the checked-in file

#### Scenario: Single-asset selection

- **WHEN** the developer selects one asset with the script's `--asset=` option
- **THEN** the script verifies or refreshes only that asset and leaves the others untouched

#### Scenario: Production build emits the HDRIs

- **WHEN** the site is built with `SITE_BASE=/lightmapper-wasm/`
- **THEN** the output contains all three HDRI assets and the built JavaScript references them

### Requirement: Outdoor sampling evidence

The site SHALL verify the sampling budget, cosine weighting, environment
variants and smoothing in the headless harness, scene and smoke suites, and
SHALL recapture thumbnails for every scene whose lighting changed.

#### Scenario: Harness verifies weighting and a single soft shadow

- **WHEN** the headless harness test bakes an outdoor scene
- **THEN** it asserts cosine weighting, a single soft shadow and the sampling budget

#### Scenario: Outdoor preview routes complete

- **WHEN** the smoke test opens the `hdri-outdoor` and `hdri-dusk` preview routes
- **THEN** both reach the done state with finite statistics, load their HDRI from the site origin and make no failed asset request

#### Scenario: Changed thumbnails are refreshed

- **WHEN** the outdoor scene sources or shared preview settings change
- **THEN** the affected thumbnails are recaptured and their manifest hashes match the current sources

#### Scenario: Display remains bake-free

- **WHEN** the display layer renders the outdoor scenes
- **THEN** it consumes the final lightmap and full background without importing the bake harness or performing a bake

## REMOVED Requirements

### Requirement: Site validation and production build

**Reason**: The site no longer has a procedural scene to validate or smoke-bake, and the production build now carries three checked-in HDRI assets instead of two. The replacement requirement states the same catalog, smoke, wasm and HDRI build contract for the HDRI-only catalog.

**Migration**: Use the `Site validation and HDRI production build` requirement; the valid-catalog, broken-scene, wasm and smoke expectations are unchanged apart from the scene list and asset count.

### Requirement: Outdoor bake sun is well sampled

**Reason**: The sampling budget previously covered a generated sun disk that no longer exists. The replacement requirement applies the same six-texel H64/H128 budget to the brightest feature of each remaining outdoor HDRI.

**Migration**: Use the `Outdoor HDRI feature sampling` requirement; `hdri-outdoor` keeps its prefiltered budget and `hdri-dusk` uses the same prefilter radius.

### Requirement: Outdoor diffuse weighting

**Reason**: The requirement named the removed procedural scene. The replacement keeps the cosine-weighting contract for both remaining outdoor HDRI scenes.

**Migration**: Use the `Outdoor HDRI diffuse weighting` requirement.

### Requirement: Bake and display environments may differ

**Reason**: The requirement described procedural display and bake variants. With HDRI-only environments the resolver contract narrows to full-resolution display and prefiltered bake copies.

**Migration**: Use the `HDRI bake and display variants` requirement; orientation, intensity and validation behavior are preserved.

### Requirement: Outdoor smoothing and quality presets

**Reason**: The four-pass procedural preset no longer exists. The replacement keeps the twelve-pass HDRI smoothing, H64 standard and H128 high presets for both outdoor HDRI scenes.

**Migration**: Use the `Outdoor HDRI smoothing and quality presets` requirement.

### Requirement: Procedural sky outdoor scenario

**Reason**: The synthetic `sun-sky-outdoor` scene is removed from the catalog so every environment scenario is lit by a photographed Poly Haven HDRI; the gallery keeps seven scenarios by adding `hdri-dusk`.

**Migration**: Use `hdri-dusk` for a low-contrast outdoor environment scene. The former `#/p/sun-sky-outdoor` route now resolves to the not-found page; its thumbnail, preview budget and smoke coverage are removed.

### Requirement: Procedural sky generation

**Reason**: `site/src/environment/sky.ts` existed only for `sun-sky-outdoor`. With the scene removed, the generator, its descriptor validation and its unit test are dead site code.

**Migration**: Use a checked-in HDRI environment descriptor for every scene. The studio's `EnvironmentInput` contract and the site HDRI decoder are unchanged.

### Requirement: Sun disk directional lighting

**Reason**: This requirement described the generated sun disk in the procedural sky. The remaining outdoor scenes take their directional content from a photographed sun, cloud field or dusk horizon in a checked-in HDRI.

**Migration**: Use the HDRI outdoor or dusk scene for environment-driven directional lighting; no analytic light or shadow map is added.
