# Spec Delta

## ADDED Requirements

### Requirement: Configurable hemisphere weighting

The harness SHALL accept an optional `hemisphereWeight` setting with the values
`uniform` (the default) and `cosine`. When `cosine` is selected, the harness
SHALL apply lightmapper's built-in cosine hemisphere weight to each lightmapper
context before its first hemisphere pass. Invalid values SHALL be rejected.

#### Scenario: Uniform remains the default
- **WHEN** a scene does not select a hemisphere weight
- **THEN** the bake uses lightmapper's existing all-ones weighting and the result matches the previous behavior

#### Scenario: Cosine weight is applied
- **WHEN** a scene selects cosine weighting
- **THEN** the relevant lightmapper context is configured with a cosine weight before any hemisphere pass

#### Scenario: Cosine applies to every object context
- **WHEN** a multi-object scene selects cosine weighting
- **THEN** every object's lightmapper context uses the cosine weight

#### Scenario: Cosine changes the low-angle response
- **WHEN** a scene is baked with a low sun and a bright horizon environment
- **THEN** the cosine-weighted result reduces the contribution of grazing directions relative to the uniform result

#### Scenario: Invalid weight is rejected
- **WHEN** a caller selects a hemisphere weight other than `uniform` or `cosine`
- **THEN** the bake rejects with a validation error naming the weight option

#### Scenario: Context lifecycle remains valid
- **WHEN** a cosine-weighted context is destroyed or a bake is cancelled
- **THEN** the context and its weight resources are released without affecting later bakes

### Requirement: Hemicube-only lighting path

The harness SHALL derive lighting only from the caller-drawn scene, the ambient
clear color and the optional environment through lightmapper's hemisphere
passes. It SHALL NOT add a separate direct-light, shadow-map or analytic-light
contribution.

#### Scenario: No hidden light source
- **WHEN** a scene has a black environment, black ambient and no emissive objects
- **THEN** the returned lightmap remains black

#### Scenario: Environment-only scene
- **WHEN** a scene contains only a lit floor and an environment
- **THEN** the returned lighting comes from the environment through the hemisphere passes

#### Scenario: No shadow-map resources are required
- **WHEN** a bake runs
- **THEN** it does not require a shadow-map, depth-map or direct-light framebuffer beyond lightmapper's own hemisphere resources

#### Scenario: Display remains bake-free
- **WHEN** the harness returns a result
- **THEN** the display layer is not required to perform any lighting or shadow pass
