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

The gallery SHALL list the four scenarios `ao-studio`, `cornell-box`,
`emissive-alcove` and `tabletop-atlas`. Each entry SHALL show a title, a short
description, feature labels and technique sections, and SHALL link to a stable
route. The gallery SHALL support filtering by section.

#### Scenario: Gallery renders
- **WHEN** a visitor opens the site root
- **THEN** all four catalog scenarios appear with their metadata

#### Scenario: Deep link opens a scenario
- **WHEN** a visitor opens a scenario route directly
- **THEN** that scenario's page loads with its 3D view and metadata

#### Scenario: Filter narrows the gallery
- **WHEN** the visitor selects a technique section
- **THEN** only scenarios declaring that section remain visible

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
Cornell box and tabletop scenes. A production build SHALL emit and reference
both the hashed `lightmapper.wasm` and `xatlas.wasm` assets.

#### Scenario: Valid catalog
- **WHEN** the site validation suite runs
- **THEN** every scenario has unique metadata, valid sections, a source entry and finite geometry

#### Scenario: Broken scene fails CI
- **WHEN** a scenario throws, unwraps to empty geometry or produces a non-finite value
- **THEN** the suite fails and names the scenario

#### Scenario: Smoke bake completes
- **WHEN** the headless smoke test opens the Cornell box and tabletop preview routes
- **THEN** both bakes reach the done state with finite, non-zero lightmap statistics

#### Scenario: Wasm assets are emitted and referenced
- **WHEN** the site is built with `SITE_BASE=/lightmapper-wasm/`
- **THEN** the output contains a hashed `lightmapper.wasm` and `xatlas.wasm` and the built JavaScript references both

### Requirement: Capability failures are visible

The site SHALL show a clear error and disable bake controls when WebGL2 or
`EXT_color_buffer_float` is unavailable, or when the wasm assets cannot be
loaded.

#### Scenario: No WebGL2
- **WHEN** the browser cannot create a WebGL2 context
- **THEN** the page reports that WebGL2 is unavailable and no bake starts

#### Scenario: Missing float render targets
- **WHEN** `EXT_color_buffer_float` is unavailable
- **THEN** the page reports the missing capability by name and no bake starts

#### Scenario: Asset failure
- **WHEN** the lightmapper or xatlas wasm asset cannot be fetched
- **THEN** the page shows an error naming the failed asset instead of a blank viewport

### Requirement: Studio consumer boundary

The showcase SHALL consume the private `lightmap-studio` package from the
local checkout (`file:../studio`) and SHALL NOT contain its own unwrap or bake
implementation. Demo scenes, the three.js display, the gallery and thumbnails
SHALL remain site-local. The studio and xatlas dependencies SHALL stay out of
the root package.

#### Scenario: Local studio dependency
- **WHEN** the site dependencies are installed
- **THEN** `lightmap-studio` resolves from `studio/` and no registry copy is fetched

#### Scenario: Pipeline is not duplicated
- **WHEN** the site source is inspected
- **THEN** it contains no xatlas unwrap or lightmapper bake harness of its own

#### Scenario: Root package stays dependency-free
- **WHEN** the root `package.json` and npm tarball are inspected
- **THEN** neither the studio package nor xatlas appears as a runtime dependency or published file

#### Scenario: CI build order
- **WHEN** the site job runs
- **THEN** it builds the root `dist`, installs the linked studio, installs the site and then runs the site checks
