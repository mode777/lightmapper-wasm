# Spec Delta

## ADDED Requirements

### Requirement: Equirectangular environment lighting

The harness SHALL accept an optional linear equirectangular HDR environment in
the bake scene, described by width, height, RGBA float data and an intensity
multiplier. When present, the harness SHALL draw the environment as a skybox for
every lightmapper hemisphere side before scene geometry and SHALL include its
radiance in the bake. When absent, the existing ambient and emissive behavior
SHALL be unchanged.

#### Scenario: Environment-only illumination
- **WHEN** a scene has black ambient, no emissive objects and a non-black equirectangular environment
- **THEN** the lightmap contains finite, non-zero light contributed by the environment

#### Scenario: Black environment
- **WHEN** the scene has black ambient, no emissive objects and a black environment
- **THEN** the lightmap remains black

#### Scenario: Environment is behind geometry
- **WHEN** a bake draws geometry over the environment
- **THEN** the environment is rendered behind the geometry and does not overwrite lit surfaces

#### Scenario: Environment intensity
- **WHEN** the same environment is baked with a higher intensity
- **THEN** the resulting lightmap radiance is higher

#### Scenario: Background orientation matches the bake
- **WHEN** the same environment is displayed as the scene background
- **THEN** the skybox orientation in the bake matches the visible background orientation

#### Scenario: Invalid environment
- **WHEN** the environment dimensions and data length do not match, or a value is non-finite or negative
- **THEN** the bake rejects with an error naming the environment and the invalid value

#### Scenario: Environment texture lifecycle
- **WHEN** a bake with an environment completes, fails or is cancelled
- **THEN** its environment texture and buffers are released and a later bake starts cleanly
