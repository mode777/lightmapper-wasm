# showcase-site Specification

## Purpose
Provide a public, non-published browser showcase for `lightmapper-wasm`: a
gallery of baked scenes with a shared xatlas UV pipeline, demo pages, checked-in
thumbnails and a Pages deployment built from the tested wasm artifact.

## Requirements

### Requirement: Separate, non-published consumer

The showcase SHALL live under `site/` as a private Vite + TypeScript
application. It SHALL consume `lightmapper-wasm` from the local checkout
(`file:..`) and SHALL NOT be included in the published npm tarball or add a
runtime dependency to the root package.

#### Scenario: Local package dependency
- **WHEN** the site dependencies are installed
- **THEN** `lightmapper-wasm` resolves from the local checkout and no registry copy is fetched

#### Scenario: Tarball excludes the site
- **WHEN** the package tarball is inspected
- **THEN** it contains no `site/` files and no showcase-only dependency

#### Scenario: Root package stays dependency-free
- **WHEN** the root `package.json` is inspected
- **THEN** it has no runtime dependencies and the site's dependencies are confined to `site/package.json`

### Requirement: Deployment from the tested artifact

The Pages deployment SHALL publish the showcase from the `dist` artifact
produced by a successful `Main` build. It SHALL build the site with
`SITE_BASE=/lightmapper-wasm/` and SHALL NOT rebuild the wasm or install
`lightmapper-wasm` from the npm registry.

#### Scenario: Successful main build deploys
- **WHEN** the build workflow completes successfully on `Main`
- **THEN** the site job downloads that run's `dist` artifact, builds the showcase and the deploy job publishes it to Pages

#### Scenario: Pull request does not deploy
- **WHEN** the build workflow runs for a pull request
- **THEN** the site is typechecked, tested and built but no Pages deployment occurs

#### Scenario: Failed build does not deploy
- **WHEN** the build workflow fails
- **THEN** no new showcase deployment is published

#### Scenario: Registry is not required
- **WHEN** the site is installed and built in CI
- **THEN** `lightmapper-wasm` resolves from the downloaded local artifact and no registry fetch occurs

### Requirement: Gallery lists the scenario catalog

The gallery SHALL list the seven scenarios `ao-studio`, `cornell-box`,
`emissive-alcove`, `tabletop-atlas`, `hdri-studio`, `hdri-outdoor` and
`sun-sky-outdoor`. Each entry SHALL show a title, a short description, feature
labels and technique sections, and SHALL link to a stable route. The gallery
SHALL support filtering by section, including `environment` for checked-in HDRI
and procedural-sky scenes.

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
- **THEN** the checked-in HDRI and procedural-sky scenarios remain visible

#### Scenario: Unknown route shows not found
- **WHEN** a visitor opens a route that is not in the catalog
- **THEN** the site shows a not-found page instead of a blank view

### Requirement: Scenario page provides 3D, Atlas and Code views

Each scenario page SHALL provide 3D, Atlas and Code views. The 3D view SHALL be
the default and SHALL support orbit, zoom and resizing. The Atlas view SHALL
show the baked lightmap and its UV chart layout. The Code view SHALL show the
exact scene module source read-only.

#### Scenario: Default view
- **WHEN** a scenario page loads
- **THEN** the 3D view is selected and the baked scene is displayed

#### Scenario: Atlas view
- **WHEN** the visitor selects the Atlas view
- **THEN** the lightmap and the chart-colored UV layout for the current run are displayed

#### Scenario: Code view matches execution
- **WHEN** the visitor selects the Code view
- **THEN** the displayed source is the scene module that produced the current bake

#### Scenario: Switching views does not re-bake
- **WHEN** the visitor switches between 3D, Atlas and Code
- **THEN** the current lightmap and statistics remain unchanged

### Requirement: Bake controls and statistics

Each scenario page SHALL provide quality and bounce controls, a bake action, a
cancel action, progress feedback and statistics for the current bake. The page
SHALL offer a lightmap PNG download whose dimensions match the atlas.

#### Scenario: Bake starts
- **WHEN** the visitor presses Bake
- **THEN** the page shows the current stage and progress until the bake completes

#### Scenario: Cancel stops the bake
- **WHEN** the visitor cancels a running bake
- **THEN** the bake stops, temporary resources are released and the previous result remains visible

#### Scenario: Statistics match the bake
- **WHEN** a bake completes
- **THEN** the displayed atlas size, object count, chart count, triangle count, bounce count, duration and luminance statistics match the result

#### Scenario: PNG matches the atlas
- **WHEN** the visitor downloads the lightmap PNG
- **THEN** the image dimensions equal the current atlas dimensions

### Requirement: Every lit mesh uses the xatlas pipeline

Every scenario SHALL unwrap its lit meshes through one `xatlas-wasm` atlas.
Positions and normals SHALL be copied through each output vertex's `xref`, and
normalized UVs SHALL stay in the range `[0, 1)`. Emissive-only meshes SHALL be
drawn during the bake but SHALL NOT be added to the atlas.

#### Scenario: Every scenario unwraps
- **WHEN** any catalog scenario is prepared
- **THEN** it produces a non-empty atlas with finite per-object positions, normals, UVs and indices

#### Scenario: UV bounds are safe
- **WHEN** the unwrap helper normalizes xatlas texel coordinates
- **THEN** every normalized UV is greater than or equal to 0 and strictly less than 1

#### Scenario: Multi-object scene packs separate meshes
- **WHEN** the `tabletop-atlas` scene is unwrapped
- **THEN** xatlas reports one output mesh per lit input mesh and every output mesh contributes triangles to the shared atlas

#### Scenario: Emitters are not in the atlas
- **WHEN** a scene contains emissive-only meshes
- **THEN** those meshes are drawn during the bake but do not occupy atlas charts

### Requirement: Preview mode and thumbnails

The site SHALL provide a `?preview=1` route mode that hides page chrome, uses a
fixed 16:10 stage and bakes at draft quality. Gallery cards SHALL use checked-in
WebP thumbnails described by a manifest with a source hash per scenario.

#### Scenario: Preview route captures the stage
- **WHEN** a demo route is opened with `?preview=1`
- **THEN** the header, tabs, aside, meta bar and footer are hidden and only the fixed 3D stage is shown

#### Scenario: Manifest covers the catalog
- **WHEN** the thumbnail manifest is inspected
- **THEN** every catalog scenario has a non-empty WebP entry with matching dimensions and source hash

#### Scenario: Stale thumbnail fails validation
- **WHEN** a scene module changes without recapturing its thumbnail
- **THEN** the thumbnail validation fails naming the stale scenario

#### Scenario: Missing thumbnail falls back
- **WHEN** a gallery card has no preview image
- **THEN** the card renders the CSS fallback instead of a broken image

### Requirement: Site validation and production build

The site test suite SHALL validate catalog metadata, scene and atlas geometry,
source coverage and thumbnail coverage. A headless smoke bake SHALL cover the
Cornell box, tabletop, HDRI studio, HDRI outdoor and sun-and-sky outdoor scenes.
A production build SHALL emit and reference the hashed `lightmapper.wasm`,
`xatlas.wasm` and both checked-in HDRI assets.

#### Scenario: Valid catalog
- **WHEN** the site validation suite runs
- **THEN** every scenario has unique metadata, valid sections, a source entry and finite geometry

#### Scenario: Broken scene fails CI
- **WHEN** a scenario throws, unwraps to empty geometry or produces a non-finite value
- **THEN** the suite fails and names the scenario

#### Scenario: Smoke bake completes
- **WHEN** the headless smoke test opens the Cornell box, tabletop, HDRI studio, HDRI outdoor and sun-and-sky outdoor preview routes
- **THEN** all five bakes reach the done state with finite, non-zero lightmap statistics

#### Scenario: Wasm assets are emitted and referenced
- **WHEN** the site is built with `SITE_BASE=/lightmapper-wasm/`
- **THEN** the output contains a hashed `lightmapper.wasm` and `xatlas.wasm` and the built JavaScript references both

#### Scenario: HDRI assets are emitted and referenced
- **WHEN** the site is built with `SITE_BASE=/lightmapper-wasm/`
- **THEN** the output contains both checked-in HDRI assets and the built JavaScript references them

#### Scenario: Procedural sky needs no file asset
- **WHEN** the sun-and-sky scene is built and loaded
- **THEN** no HDRI or other environment file is emitted or requested for it

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

### Requirement: Published studio consumer boundary

The showcase SHALL consume the published `lightmap-studio@^0.1.0` package from the npm registry and SHALL NOT contain its own unwrap or bake implementation. It SHALL keep exactly one `lightmapper-wasm` copy, resolved to the repository's tested local `dist` artifact. Demo scenes, the three.js display, the gallery and thumbnails SHALL remain site-local. The studio and xatlas dependencies SHALL stay out of the root package.

#### Scenario: Registry studio dependency
- **WHEN** the site dependencies are installed
- **THEN** `lightmap-studio` resolves from the npm registry tarball at a version satisfying `^0.1.0` and no local `studio/` link is installed

#### Scenario: Single wrapper copy
- **WHEN** the installed site dependency tree is inspected
- **THEN** exactly one `lightmapper-wasm` entry exists and it resolves to the repository's local `file:..` link rather than a registry copy

#### Scenario: Pipeline is not duplicated
- **WHEN** the site source is inspected
- **THEN** it contains no xatlas unwrap or lightmapper bake harness of its own

#### Scenario: Root package stays dependency-free
- **WHEN** the root `package.json` and npm tarball are inspected
- **THEN** neither the studio package nor xatlas appears as a runtime dependency or published file

#### Scenario: CI build order
- **WHEN** the site job runs
- **THEN** it builds the root `dist`, installs the site with the registry studio package and the local wrapper link, and runs the site checks without building a studio package

### Requirement: Studio dependency drift is rejected

The site verification SHALL fail with a clear message when the showcase stops consuming the published studio package or starts resolving more than one wrapper copy.

#### Scenario: Local link reintroduced
- **WHEN** the site lockfile resolves `lightmap-studio` from a filesystem link instead of a registry tarball
- **THEN** the site dependency check fails and names the local resolution

#### Scenario: Version leaves the supported range
- **WHEN** the installed `lightmap-studio` version does not satisfy `^0.1.0`
- **THEN** the site dependency check fails and reports the installed version

#### Scenario: Second wrapper copy appears
- **WHEN** the site lockfile contains a nested `lightmapper-wasm` entry beside the local link
- **THEN** the site dependency check fails and names both resolutions

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

### Requirement: Procedural sky outdoor scenario

The showcase SHALL provide a `sun-sky-outdoor` scenario whose lit meshes are
illuminated by a generated linear equirectangular sky and a sun disk in that
sky. The scenario SHALL use black ambient, SHALL contain no emissive meshes and
SHALL NOT reference a checked-in HDRI. It SHALL appear in the catalog with the
`environment` section and a preview route.

#### Scenario: Sun-and-sky scene is in the catalog
- **WHEN** the gallery is rendered
- **THEN** `sun-sky-outdoor` appears with the environment section and a preview route

#### Scenario: The generated environment is the only light
- **WHEN** the sun-and-sky scene is baked
- **THEN** its lightmap is non-black with black ambient and no emissive meshes, and no `.hdr` request is made

#### Scenario: Background shows the same sky
- **WHEN** the sun-and-sky demo page loads
- **THEN** the 3D viewport uses the generated sky as its background and the visible sun matches the bake's sun direction

### Requirement: Procedural sky generation

The site SHALL generate the scene environment as bottom-up linear RGBA float
equirectangular data from a zenith/horizon/ground gradient and a sun disk with
direction, color, angular radius and intensity. The generator SHALL validate its
inputs, SHALL be deterministic and SHALL NOT fetch an external asset.

#### Scenario: Deterministic gradient and sun
- **WHEN** the same procedural-sky descriptor is generated twice
- **THEN** both images have identical dimensions and data, with the zenith at the top row, the ground at the bottom row and a bright disk at the sun direction

#### Scenario: Invalid descriptor
- **WHEN** a dimension, color, intensity, direction or angular radius is invalid
- **THEN** generation rejects with an error naming the invalid field

#### Scenario: No external asset
- **WHEN** the procedural-sky scene is built and loaded
- **THEN** it emits and requests no HDRI or other external environment file

### Requirement: Sun disk directional lighting

The generated sun disk SHALL act as the environment's directional light: its
direction SHALL control which surfaces receive direct light and its angular
radius and intensity SHALL control the direct-light sharpness and magnitude.

#### Scenario: Sun direction changes the lit side
- **WHEN** the same scene is baked with the sun above the horizon pointing from opposite sides
- **THEN** the surfaces facing the sun receive more radiance than the surfaces facing away

#### Scenario: Sun intensity scales direct light
- **WHEN** the sun disk intensity is increased while the sky gradient is unchanged
- **THEN** the direct-light contribution increases

#### Scenario: Geometry occludes the sun
- **WHEN** a wall or other lit geometry lies between a surface and the sun direction
- **THEN** that surface receives sky fill but no direct sun disk contribution

### Requirement: Outdoor bake sun is well sampled

The `sun-sky-outdoor` and `hdri-outdoor` bake environments SHALL present their
sun or bright cloud feature at no fewer than six hemicube texels at the
standard H64 and high H128 presets. `sun-sky-outdoor` SHALL use a larger and
softer sun lobe for the bake than for the display. `hdri-outdoor` MAY use a
wider prefiltered bake copy. `hdri-studio` and the non-outdoor scenarios SHALL
keep their current lighting.

#### Scenario: Procedural sun meets the sampling budget
- **WHEN** `sun-sky-outdoor` is baked at H64
- **THEN** its bake sun's angular diameter covers at least six hemicube texels

#### Scenario: High quality meets the budget
- **WHEN** `sun-sky-outdoor` is baked at H128
- **THEN** its bake sun covers at least six texels and the shadow direction and softness remain consistent with H64

#### Scenario: Display keeps the current sun disk
- **WHEN** `sun-sky-outdoor` is displayed
- **THEN** the generated sky keeps the current `0.06 rad` visible sun disk

#### Scenario: HDRI bake is broad enough
- **WHEN** `hdri-outdoor` is baked
- **THEN** its prefiltered sun/cloud feature covers at least six hemicube texels and the full-resolution HDRI remains the display background

#### Scenario: Studio scene is unchanged
- **WHEN** `hdri-studio` is baked
- **THEN** it keeps its existing environment-only lighting and smoothing

#### Scenario: Sampling budget is enforced
- **WHEN** a scene declares a sun below the six-texel budget
- **THEN** the scene test fails and names the computed texel coverage

#### Scenario: One soft shadow per isolated object
- **WHEN** an isolated object is baked in an outdoor scene
- **THEN** it produces one soft directional shadow rather than multiple hemicube-shaped lobes

### Requirement: Outdoor diffuse weighting

The outdoor environment scenes SHALL use cosine hemisphere weighting. The
non-outdoor scenes SHALL keep the uniform default unless they opt in. Outdoor
sun/sky exposure SHALL be recalibrated for the cosine response.

#### Scenario: Procedural outdoor scene uses cosine
- **WHEN** `sun-sky-outdoor` is baked
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

### Requirement: Bake and display environments may differ

The showcase environment resolver SHALL produce a display environment or
texture and a bake environment. The display SHALL use the full source or the
current visible sun disk; the bake SHALL use a softened sun or prefiltered
diffuse copy. Both SHALL preserve the source orientation and intensity
contract, and invalid data SHALL be rejected before GPU resources are created.

#### Scenario: Procedural display and bake variants
- **WHEN** the procedural sky is resolved
- **THEN** the display variant keeps the `0.06 rad` disk and the bake variant uses the larger soft lobe

#### Scenario: HDRI display and bake variants
- **WHEN** the HDRI outdoor environment is resolved
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

### Requirement: Outdoor smoothing and quality presets

The `sun-sky-outdoor` preset SHALL use four smoothing passes. The
`hdri-outdoor` preset SHALL use twelve smoothing passes because its dense
prefiltered cloud field exposes line artifacts at lower smoothing. Neither
preset SHALL rely on smoothing alone to hide hemicube sampling. The standard
preset SHALL remain H64 and the high preset SHALL use H128.

#### Scenario: Procedural smoothing stays bounded
- **WHEN** `sun-sky-outdoor` is baked
- **THEN** it uses four smoothing passes and still passes the one-soft-shadow check

#### Scenario: HDRI lines are suppressed
- **WHEN** `hdri-outdoor` is baked
- **THEN** it uses twelve smoothing passes and its close-up render has no lightmap line artifacts

#### Scenario: Standard and high presets
- **WHEN** the quality selector is changed
- **THEN** standard uses H64 and high uses H128 while the bake sun remains within the sampling budget

#### Scenario: Other scenes keep their presets
- **WHEN** a non-outdoor scene is baked
- **THEN** its existing hemisphere size and smoothing preset remain unchanged

### Requirement: HDRI cloudy policy

The `hdri-outdoor` scene SHALL remain an environment-only partly cloudy scene.
Its clouds SHALL remain real soft area lights; a clear-sky HDRI or a direct sun
path is out of scope for this change.

#### Scenario: Cloud fill remains
- **WHEN** `hdri-outdoor` is baked
- **THEN** the cloudy sky contributes soft fill around the dominant sun

#### Scenario: Policy is documented
- **WHEN** the showcase documentation describes `hdri-outdoor`
- **THEN** it states that a partly cloudy HDRI is intentionally multi-source and that a clear-sky single-sun variant is a separate asset choice

### Requirement: Outdoor sampling evidence

The site SHALL verify the sampling budget, cosine weighting, environment
variants and reduced smoothing in the headless harness, scene and smoke suites,
and SHALL recapture thumbnails for every scene whose lighting changed.

#### Scenario: Harness verifies weighting and a single soft shadow
- **WHEN** the headless harness test bakes an outdoor scene
- **THEN** it asserts cosine weighting, a single soft shadow and the sampling budget

#### Scenario: Outdoor preview routes complete
- **WHEN** the smoke test opens the `sun-sky-outdoor` and `hdri-outdoor` preview routes
- **THEN** both reach the done state with finite statistics and no failed asset request

#### Scenario: Changed thumbnails are refreshed
- **WHEN** the outdoor scene sources or shared preview settings change
- **THEN** the affected thumbnails are recaptured and their manifest hashes match the current sources

#### Scenario: Display remains bake-free
- **WHEN** the display layer renders the outdoor scenes
- **THEN** it consumes the final lightmap and full background without importing the bake harness or performing a bake
