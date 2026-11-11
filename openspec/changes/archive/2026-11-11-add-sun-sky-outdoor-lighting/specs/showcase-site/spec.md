# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
