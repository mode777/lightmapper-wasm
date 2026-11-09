# Spec Delta

## Purpose

Provide a display-agnostic raw-WebGL bake harness that turns lit and emissive
scene meshes into a lightmap without depending on three.js, xatlas or any
particular UI.

## ADDED Requirements

### Requirement: Display-agnostic harness

The harness SHALL bake into a WebGL2 context it owns or receives, and SHALL
return CPU lightmap data plus metadata. It SHALL NOT import three.js, xatlas,
or any site-specific module.

#### Scenario: Own context
- **WHEN** the harness is created without a canvas or context
- **THEN** it creates a hidden WebGL2 context, initializes the lightmapper and is ready to bake

#### Scenario: Caller-provided context
- **WHEN** the caller provides a canvas or WebGL2 context
- **THEN** the harness uses it and does not create a second bake context

#### Scenario: Import boundary
- **WHEN** the harness module is inspected
- **THEN** it imports only `lightmapper-wasm` and standard browser/typed-array APIs

### Requirement: Scene input contract

The harness SHALL accept a scene containing a shared atlas size, an ambient
clear color and a list of objects. A lit object SHALL provide positions,
normals, lightmap UVs, indices and an albedo color. An emissive object SHALL
provide positions, normals, indices and an emissive color.

#### Scenario: Lit-only scene
- **WHEN** the scene contains only lit objects
- **THEN** every object is baked into its atlas region using the ambient clear color

#### Scenario: Mixed scene
- **WHEN** the scene contains lit and emissive objects
- **THEN** lit objects receive lightmap UVs and emissive objects contribute light without occupying atlas charts

#### Scenario: Ambient-only AO
- **WHEN** the scene has no emissive objects and a white ambient color
- **THEN** the result contains ambient occlusion from scene visibility

#### Scenario: Invalid UV
- **WHEN** a lit object provides a UV outside `[0, 1)` or a non-finite value
- **THEN** the bake rejects with an error naming the object and the invalid value

### Requirement: Shared-atlas multi-object bake

The harness SHALL bake every lit object of a shared atlas into one target
lightmap. For each bounce it SHALL draw the full scene for every object's bake,
SHALL NOT upload the CPU atlas to the GPU between objects, and SHALL upload it
once after all objects finish the bounce.

#### Scenario: Single object
- **WHEN** one lit object is baked
- **THEN** its atlas region contains the baked result and the rest of the atlas remains empty

#### Scenario: Multiple objects share one atlas
- **WHEN** several lit objects are baked into one atlas
- **THEN** each object writes its own non-overlapping region and the combined atlas contains all results

#### Scenario: Full scene is visible during each object bake
- **WHEN** object A is being baked in a multi-object scene
- **THEN** the hemisphere cameras see all other objects, including their shadows and emissive contributions

#### Scenario: Upload happens once per bounce
- **WHEN** a bounce completes for all objects
- **THEN** the CPU atlas is uploaded to the GPU exactly once before the next bounce starts

### Requirement: Bounce loop and post-processing

The harness SHALL support one or more bounces. After each bounce it SHALL apply
the configured dilation and smoothing, and the final result SHALL be the last
bounce rather than a sum of bounces.

#### Scenario: Multi-bounce result
- **WHEN** the requested bounce count is greater than one
- **THEN** each bounce sees the previous bounce's lightmap on the GPU and the returned result is the final bounce

#### Scenario: Post-processing runs per bounce
- **WHEN** a bounce completes
- **THEN** dilation and smoothing are applied to the shared atlas before the next bounce

#### Scenario: Single bounce
- **WHEN** the requested bounce count is one
- **THEN** only direct light and the ambient or emissive sources are baked

### Requirement: Progress, yielding and cancellation

The harness SHALL report progress by stage and overall fraction, SHALL yield to
the event loop while baking, and SHALL support cancellation through an
`AbortSignal`. Cancellation SHALL release contexts and heap allocations.

#### Scenario: Progress is reported
- **WHEN** a bake runs
- **THEN** progress reports the current bounce, object and stage with a monotonically increasing fraction

#### Scenario: Page remains responsive
- **WHEN** a bake runs on the main thread
- **THEN** the harness yields periodically so the page can render and handle input

#### Scenario: Cancellation stops the bake
- **WHEN** the signal aborts during a bake
- **THEN** the bake rejects with an abort error, destroys its contexts and frees its heap buffers

#### Scenario: No leak after failure
- **WHEN** a bake fails or is cancelled
- **THEN** the next bake starts without reusing a corrupted context or leaked allocation

### Requirement: Result and statistics

The harness SHALL return the final lightmap as a `Float32Array` with its width,
height and channel count, plus statistics and duration. The returned values
SHALL be finite and SHALL match the requested atlas dimensions.

#### Scenario: Result dimensions
- **WHEN** a bake completes
- **THEN** the lightmap length equals width times height times channels and the dimensions match the scene atlas

#### Scenario: Finite result
- **WHEN** a bake completes
- **THEN** every lightmap value is finite and at least one RGB value is non-zero for a scene with light

#### Scenario: Statistics match the data
- **WHEN** statistics are returned
- **THEN** their mean, maximum and non-black ratio are computed from the returned lightmap

### Requirement: Capability and error handling

The harness SHALL fail with a clear error when WebGL2 or
`EXT_color_buffer_float` is unavailable, when the lightmapper module cannot be
loaded, or when a bake context cannot be created.

#### Scenario: Missing WebGL2
- **WHEN** no WebGL2 context can be created
- **THEN** harness creation rejects with an error naming WebGL2

#### Scenario: Missing float render targets
- **WHEN** `EXT_color_buffer_float` is unavailable
- **THEN** harness creation rejects with an error naming the extension

#### Scenario: Asset failure
- **WHEN** the lightmapper wasm asset cannot be fetched
- **THEN** harness creation rejects with an error naming the asset location and the failed step

### Requirement: Package-shaped module

The harness SHALL be written so it can be promoted to the package without
changing its behavior: no site imports, no xatlas dependency, typed inputs and
outputs, and a disposable context lifecycle.

#### Scenario: Promotion audit
- **WHEN** the harness source is inspected before promotion
- **THEN** it contains no import from `site/`, `three`, or `xatlas-wasm`

#### Scenario: Disposal
- **WHEN** the harness is disposed
- **THEN** its contexts, textures, buffers and heap allocations are released
