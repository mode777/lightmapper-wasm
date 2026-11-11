# Spec Delta

## MODIFIED Requirements

### Requirement: Gallery lists the scenario catalog

The gallery SHALL list the six scenarios `ao-studio`, `cornell-box`,
`emissive-alcove`, `tabletop-atlas`, `hdri-studio` and `hdri-outdoor`. Each
entry SHALL show a title, a short description, feature labels and technique
sections, and SHALL link to a stable route. The gallery SHALL support filtering
by section, including `environment`.

#### Scenario: Gallery renders
- **WHEN** a visitor opens the site root
- **THEN** all six catalog scenarios appear with their metadata

#### Scenario: Deep link opens a scenario
- **WHEN** a visitor opens a scenario route directly
- **THEN** that scenario's page loads with its 3D view and metadata

#### Scenario: Filter narrows the gallery
- **WHEN** the visitor selects a technique section
- **THEN** only scenarios declaring that section remain visible

#### Scenario: Environment filter
- **WHEN** the visitor selects the environment section
- **THEN** only scenarios declaring the environment section remain visible

#### Scenario: Unknown route shows not found
- **WHEN** a visitor opens a route that is not in the catalog
- **THEN** the site shows a not-found page instead of a blank view

### Requirement: Site validation and production build

The site test suite SHALL validate catalog metadata, scene and atlas geometry,
source coverage and thumbnail coverage. A headless smoke bake SHALL cover the
Cornell box, tabletop, HDRI studio and HDRI outdoor scenes. A production build
SHALL emit and reference the hashed `lightmapper.wasm`, `xatlas.wasm` and both
HDRI assets.

#### Scenario: Valid catalog
- **WHEN** the site validation suite runs
- **THEN** every scenario has unique metadata, valid sections, a source entry and finite geometry

#### Scenario: Broken scene fails CI
- **WHEN** a scenario throws, unwraps to empty geometry or produces a non-finite value
- **THEN** the suite fails and names the scenario

#### Scenario: Smoke bake completes
- **WHEN** the headless smoke test opens the Cornell box, tabletop, HDRI studio and HDRI outdoor preview routes
- **THEN** all four bakes reach the done state with finite, non-zero lightmap statistics

#### Scenario: Wasm assets are emitted and referenced
- **WHEN** the site is built with `SITE_BASE=/lightmapper-wasm/`
- **THEN** the output contains a hashed `lightmapper.wasm` and `xatlas.wasm` and the built JavaScript references both

#### Scenario: HDRI asset is emitted and referenced
- **WHEN** the site is built with `SITE_BASE=/lightmapper-wasm/`
- **THEN** the output contains the HDRI asset and the built JavaScript references it

### Requirement: Capability failures are visible

The site SHALL show a clear error and disable bake controls when WebGL2 or
`EXT_color_buffer_float` is unavailable, or when the wasm or HDRI assets cannot
be loaded.

#### Scenario: No WebGL2
- **WHEN** the browser cannot create a WebGL2 context
- **THEN** the page reports that WebGL2 is unavailable and no bake starts

#### Scenario: Missing float render targets
- **WHEN** `EXT_color_buffer_float` is unavailable
- **THEN** the page reports the missing capability by name and no bake starts

#### Scenario: Asset failure
- **WHEN** the lightmapper or xatlas wasm asset cannot be fetched
- **THEN** the page shows an error naming the failed asset instead of a blank viewport

#### Scenario: HDRI asset failure
- **WHEN** the HDRI asset cannot be fetched or decoded
- **THEN** the page shows an error naming the HDRI asset and no bake starts

## ADDED Requirements

### Requirement: Attribution and neutral navigation

The gallery SHALL display a visible attribution naming `lightmapper.h` and
linking to `https://github.com/ands/lightmapper`. Global navigation and the
gallery hero SHALL NOT link directly to an individual scenario; scenario links
SHALL appear in the catalog cards and scenario pages.

#### Scenario: lightmapper.h attribution
- **WHEN** a visitor opens the gallery
- **THEN** a visible link names `lightmapper.h` and points to `https://github.com/ands/lightmapper`

#### Scenario: No featured scenario link
- **WHEN** the global navigation and gallery hero are inspected
- **THEN** neither links directly to a route for one scenario

#### Scenario: Catalog still links every scenario
- **WHEN** the gallery cards are rendered
- **THEN** every catalog scenario links to its own route

### Requirement: HDRI studio scenario

The showcase SHALL provide an `hdri-studio` scenario whose lit meshes are
illuminated solely by a checked-in linear equirectangular HDRI. The scenario
SHALL declare no analytic lights and no emissive meshes, SHALL use a black
ambient color and SHALL display the same HDRI as its scene background.

#### Scenario: HDRI studio is in the catalog
- **WHEN** the gallery is rendered
- **THEN** `hdri-studio` appears with the environment section and a preview route

#### Scenario: Environment is the only light
- **WHEN** the HDRI studio scene is baked
- **THEN** its lightmap is non-black solely because of the environment, with black ambient and no emissive meshes

#### Scenario: Background shows the environment
- **WHEN** the HDRI studio demo page loads
- **THEN** the 3D viewport uses the same HDRI as its background

### Requirement: Outdoor HDRI scenario

The showcase SHALL provide an `hdri-outdoor` scenario whose lit meshes are
illuminated solely by a checked-in linear equirectangular daytime outdoor HDRI.
The scenario SHALL declare no analytic lights and no emissive meshes, SHALL use
a black ambient color and SHALL display the same daytime HDRI as its background.

#### Scenario: Outdoor HDRI is in the catalog
- **WHEN** the gallery is rendered
- **THEN** `hdri-outdoor` appears with the environment section and a preview route

#### Scenario: Daylight is the only light
- **WHEN** the HDRI outdoor scene is baked
- **THEN** its lightmap is non-black solely because of the daytime environment, with black ambient and no emissive meshes

#### Scenario: Background shows the daytime sky
- **WHEN** the HDRI outdoor demo page loads
- **THEN** the 3D viewport uses the same daytime HDRI as its background

### Requirement: HDRI asset provenance and build

The HDRIs used by the showcase SHALL be checked-in CC0 Poly Haven assets with
their sources, authors and licenses recorded. A developer script SHALL resolve
each asset through the Poly Haven API and verify its expected size or checksum.
The site SHALL NOT fetch Poly Haven or another external host at runtime, and
the production build SHALL emit and reference the checked-in HDRI assets.

#### Scenario: Provenance is recorded
- **WHEN** the environment asset directory is inspected
- **THEN** it contains both HDRIs and a note naming Poly Haven, each asset id, author and CC0

#### Scenario: Runtime is self-contained
- **WHEN** an HDRI demo page loads from the built site
- **THEN** its HDRI is served from the site origin and no request goes to Poly Haven

#### Scenario: Refresh script uses the API
- **WHEN** the developer runs the HDRI refresh script
- **THEN** it resolves each download URL through the Poly Haven API, verifies the asset and writes the checked-in file

#### Scenario: Production build emits the HDRIs
- **WHEN** the site is built with `SITE_BASE=/lightmapper-wasm/`
- **THEN** the output contains both HDRI assets and the built JavaScript references them
