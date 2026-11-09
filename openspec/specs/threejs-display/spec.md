# threejs-display Specification

## Purpose
Provide a three.js consumption layer for baked lightmaps: textures, lit and
emissive materials, display modes and an orbit viewport that never performs a
bake.

## Requirements

### Requirement: Lightmap texture from the bake result

The display layer SHALL create a three.js data texture from a bake result with
the result's width, height and float data. The texture SHALL use linear color
space, clamp-to-edge wrapping and a filter supported by the display context.

#### Scenario: Texture dimensions and data
- **WHEN** a bake result is applied
- **THEN** the created texture has the result's width and height and references the result's float data

#### Scenario: Progressive update
- **WHEN** a later bounce result is applied
- **THEN** the existing texture data is updated without recreating the texture

#### Scenario: Linear filtering fallback
- **WHEN** the display context cannot filter float textures linearly
- **THEN** the layer uses nearest filtering and the scene still renders

### Requirement: Lit and emissive materials

The display layer SHALL render lit objects with their albedo multiplied by the
baked lightmap and emissive objects with their emissive color. It SHALL NOT
apply a second gamma correction to the linear lightmap.

#### Scenario: Lit object
- **WHEN** a lit object is displayed
- **THEN** its visible color is the product of its albedo and the sampled lightmap

#### Scenario: Emissive object
- **WHEN** an emissive object is displayed
- **THEN** it shows its emissive color and does not sample the lightmap

#### Scenario: Linear lightmap
- **WHEN** the lightmap is uploaded to three.js
- **THEN** it is treated as linear data and the renderer performs the output color conversion

### Requirement: Display modes

The display layer SHALL support lit, unlit and wireframe modes. Changing a mode
SHALL NOT re-bake or modify the current lightmap.

#### Scenario: Unlit mode
- **WHEN** the visitor selects unlit mode
- **THEN** lit objects show their albedo without the lightmap

#### Scenario: Wireframe mode
- **WHEN** the visitor enables wireframe
- **THEN** triangle edges are shown on the current geometry

#### Scenario: Mode change preserves the bake
- **WHEN** the visitor changes a display mode
- **THEN** the current lightmap, statistics and geometry remain unchanged

### Requirement: Orbit viewport

The viewport SHALL support orbit, zoom, resize and automatic framing of the
current scene. It SHALL pause or update predictably while a bake is running.

#### Scenario: Orbit and zoom
- **WHEN** the visitor drags or scrolls in the viewport
- **THEN** the camera orbits or zooms without changing the scene data

#### Scenario: Resize
- **WHEN** the viewport container changes size
- **THEN** the renderer and camera aspect update without distorting the scene

#### Scenario: Scene framing
- **WHEN** a new scene is displayed
- **THEN** the camera frames the scene bounds or uses the scene's declared camera

### Requirement: Scene background

The display layer SHALL support a solid or transparent scene background. HDRI
backgrounds are added by a follow-up change and SHALL NOT be required by this
capability.

#### Scenario: Solid background
- **WHEN** a scene declares a background color
- **THEN** the viewport renders that color behind the baked objects

#### Scenario: Transparent background
- **WHEN** a scene declares no background color
- **THEN** the viewport remains transparent so the page surface shows through

### Requirement: No baking in the display layer

The display layer SHALL consume a completed bake result and SHALL NOT create a
lightmapper context, call lightmapper bake functions, or import the bake
harness.

#### Scenario: Import boundary
- **WHEN** the display module is inspected
- **THEN** it does not import the bake harness or call `lmCreate`, `lmBegin` or `lmEnd`

#### Scenario: Bake result input
- **WHEN** a scene is displayed
- **THEN** the display layer uses only the provided geometry and bake result

### Requirement: Resource lifecycle

The display layer SHALL dispose its renderer, textures, materials, geometries,
controls and event listeners when the page is left.

#### Scenario: Dispose
- **WHEN** the demo page is disposed
- **THEN** the renderer, lightmap texture, materials, geometries and orbit controls are released

#### Scenario: Repeated navigation
- **WHEN** the visitor navigates between demo pages
- **THEN** no previous viewport continues rendering or retains GPU resources

### Requirement: Display capability errors

The display layer SHALL report a clear error when a three.js renderer or a
required texture capability cannot be created.

#### Scenario: Renderer creation failure
- **WHEN** a three.js WebGL2 renderer cannot be created
- **THEN** the page shows an error naming the display failure and no blank canvas

#### Scenario: Texture upload failure
- **WHEN** the lightmap texture cannot be uploaded
- **THEN** the page reports the failure and keeps the previous scene visible or shows the error state
