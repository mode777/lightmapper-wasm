# Spec Delta

## Purpose

Provide an engine-agnostic mesh-to-lightmap pipeline: one shared xatlas atlas,
a WebGL2 lightmap bake, and a plain-data result that any renderer can consume.

## ADDED Requirements

### Requirement: Engine-agnostic input contract

The studio SHALL accept lit and emissive meshes as plain typed arrays and
plain values only. A lit mesh SHALL provide positions, normals and indices
plus an optional albedo; an emissive mesh SHALL provide positions, normals,
indices and an emissive color. The studio SHALL NOT require three.js, a
renderer scene or any engine-specific object.

#### Scenario: Lit scene accepted
- **WHEN** a caller supplies one or more lit meshes with positions, normals, indices and albedo
- **THEN** the studio accepts the scene without requiring a renderer object

#### Scenario: Input is engine-neutral
- **WHEN** the studio's public input types are inspected
- **THEN** they contain only typed arrays, numbers, strings and plain objects, with no three.js or renderer type

#### Scenario: Missing normals rejected
- **WHEN** a lit mesh omits normals
- **THEN** the studio rejects with a validation error naming the mesh and the missing field

### Requirement: Shared atlas unwrap

The studio SHALL unwrap every lit mesh into one shared atlas. Normalized UVs
SHALL be clamped to `[0, 1 - 1e-6]`; a UV outside the atlas range or a
degenerate UV triangle SHALL be rejected. Emissive meshes SHALL NOT occupy
atlas space.

#### Scenario: Multiple meshes share one atlas
- **WHEN** several lit meshes are unwrapped together
- **THEN** each mesh receives a non-overlapping region of one atlas

#### Scenario: Atlas edge is clamped
- **WHEN** xatlas returns a texel coordinate exactly on the atlas edge
- **THEN** the normalized UV is clamped below `1.0`

#### Scenario: Invalid UV rejected
- **WHEN** an unwrapped UV falls outside the atlas range or a UV triangle has zero area
- **THEN** the studio rejects with an error naming the mesh and the invalid triangle

#### Scenario: Emissive meshes stay out of the atlas
- **WHEN** a scene contains emissive meshes
- **THEN** they are baked as light sources but do not receive atlas charts

### Requirement: Environment lighting

The studio SHALL accept one optional linear equirectangular environment as the
only sky light source, with an optional intensity, and SHALL prefilter it
before baking by default. The studio SHALL NOT expose a directional-light
input.

#### Scenario: Environment-only bake
- **WHEN** a scene supplies an environment and no emissive or point sources
- **THEN** the bake is lit by the environment and the ambient term

#### Scenario: Intensity scales the environment
- **WHEN** the same environment is baked with a higher intensity
- **THEN** the resulting lightmap radiance increases proportionally

#### Scenario: No directional-light input
- **WHEN** the studio's public input types are inspected
- **THEN** no directional or sun light type is present and sky lighting is supplied only as environment data

### Requirement: Emissive area lighting

The studio SHALL accept emissive meshes as area lights. Each emissive mesh
SHALL be drawn during every bake pass and SHALL be returned unchanged in the
result.

#### Scenario: Emissive geometry contributes light
- **WHEN** an emissive mesh is placed near a lit mesh
- **THEN** the lit mesh receives radiance from the emissive surface

#### Scenario: Emitter returned for display
- **WHEN** a bake completes with emissive meshes
- **THEN** the result contains their geometry and emissive colors

### Requirement: Point-light proxies

The studio SHALL accept point lights with position, color, total radiant power
and an optional radius. Each point light SHALL be modelled as an emissive
sphere proxy with uniform radiance `power / (4 * pi^2 * radius^2)`. The proxy
SHALL be returned in the result and SHALL NOT occupy atlas space.

#### Scenario: Point light is returned as a proxy
- **WHEN** a scene supplies a point light
- **THEN** the result contains an emissive sphere at the light position with the derived radiance

#### Scenario: Falloff with distance
- **WHEN** a surface is baked at twice the distance from the same point light
- **THEN** its received radiance is substantially lower and follows the proxy's inverse-square falloff

#### Scenario: Default proxy radius
- **WHEN** a point light omits the radius
- **THEN** the studio uses its documented default radius and reports it in the result

### Requirement: Quality presets

The studio SHALL provide `draft`, `preview` and `final` presets that set atlas
size, hemisphere size, bounce count and smoothing defaults. Explicit per-bake
options SHALL override the preset values.

#### Scenario: Preset applies defaults
- **WHEN** a caller selects a preset without overrides
- **THEN** the bake uses that preset's atlas size, hemisphere size, bounce count and smoothing

#### Scenario: Explicit options win
- **WHEN** a caller selects a preset and also supplies an explicit option
- **THEN** the explicit option is used instead of the preset value

#### Scenario: Unknown preset rejected
- **WHEN** a caller supplies a preset name that is not defined
- **THEN** the studio rejects with a validation error naming the preset

### Requirement: Unwrap-only operation

The studio SHALL allow unwrapping without creating a WebGL2 context or loading
the lightmapper module. Baking SHALL require WebGL2 and
`EXT_color_buffer_float` and SHALL fail with a clear error when either is
unavailable.

#### Scenario: Unwrap without WebGL
- **WHEN** a caller unwraps meshes in an environment without a WebGL2 context
- **THEN** the unwrap succeeds and returns atlas UVs

#### Scenario: Bake without WebGL
- **WHEN** a caller bakes without a WebGL2 context and none can be created
- **THEN** the bake rejects with an error naming WebGL2

#### Scenario: Missing float render targets
- **WHEN** `EXT_color_buffer_float` is unavailable
- **THEN** the bake rejects with an error naming the extension before loading the lightmapper asset

### Requirement: Plain-data result

The studio SHALL return one result containing shared atlas metadata, one
unwrapped mesh per input lit mesh, the final RGBA float lightmap, the emissive
and point-proxy geometry, statistics and duration. Returned arrays SHALL match
the returned dimensions and SHALL be finite.

#### Scenario: Result dimensions
- **WHEN** a bake completes
- **THEN** the lightmap length equals width times height times four and the atlas dimensions match the result metadata

#### Scenario: Per-mesh mapping
- **WHEN** a scene contains several lit meshes
- **THEN** the result contains one unwrapped mesh per input mesh in input order, with positions, normals, UVs, indices and chart indices

#### Scenario: Finite values
- **WHEN** a bake of a lit scene completes
- **THEN** every returned lightmap value is finite and at least one RGB value is non-zero

### Requirement: Deterministic outputs

For the same input, preset and toolchain, the studio SHALL reset the
lightmapper's rotation jitter before each bake and SHALL produce the same
atlas layout and the same lightmap values.

#### Scenario: Repeated bake matches
- **WHEN** the same scene is baked twice with the same options on the same toolchain
- **THEN** both results have the same atlas metadata and identical lightmap values

#### Scenario: Rotation seed is reset
- **WHEN** a bake starts
- **THEN** the studio resets the lightmapper rotation seed before the first hemisphere pass

### Requirement: Progress, cancellation and lifetime

The studio SHALL report progress by stage and fraction, SHALL accept an
`AbortSignal`, SHALL allow one bake at a time per instance, and SHALL make
`dispose()` idempotent. A cancelled or failed operation SHALL release its bake
resources.

#### Scenario: Progress is monotonic
- **WHEN** a bake runs
- **THEN** progress stages and fractions are reported in non-decreasing order

#### Scenario: Abort stops the bake
- **WHEN** the signal aborts during a bake
- **THEN** the bake rejects with an abort error and releases its contexts and heap buffers

#### Scenario: Concurrent bake rejected
- **WHEN** a second bake starts before the first finishes
- **THEN** the second bake rejects with a busy error and does not corrupt the first

#### Scenario: Disposal is idempotent
- **WHEN** `dispose()` is called more than once
- **THEN** the later calls succeed without throwing

### Requirement: Error contract

The studio SHALL reject with a typed error carrying a code for WebGL2, float
capability, asset loading, validation, atlas generation, abort, disposal,
busy and bake failures. Messages SHALL name the failing asset, mesh or light
and SHALL preserve the original error as the cause.

#### Scenario: Validation error names the mesh
- **WHEN** a mesh contains a non-finite position
- **THEN** the rejection names the mesh and the offending value

#### Scenario: Asset error names the file
- **WHEN** a wasm asset cannot be fetched
- **THEN** the rejection names the asset file and the failed step

#### Scenario: Cause is preserved
- **WHEN** an underlying lightmapper or xatlas call fails
- **THEN** the studio error exposes the original error as its cause

### Requirement: Engine boundary

The studio package SHALL NOT import three.js or depend on a renderer. Its
result SHALL be consumable by any renderer, and three.js SHALL remain a
sample-only dependency.

#### Scenario: Import audit
- **WHEN** the published studio entry and its source are inspected
- **THEN** neither imports three.js or any sample module

#### Scenario: Result is renderer-neutral
- **WHEN** a caller consumes a bake result
- **THEN** the result consists of typed arrays and plain metadata with no three.js object
