# Spec Delta

## ADDED Requirements

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

The outdoor scene presets SHALL reduce smoothing from the current four and
twelve passes and SHALL NOT rely on smoothing to hide hemicube sampling. The
standard preset SHALL remain H64 and the high preset SHALL use H128.

#### Scenario: Procedural smoothing is reduced
- **WHEN** `sun-sky-outdoor` is baked
- **THEN** it uses fewer smoothing passes than the current four and still passes the one-soft-shadow check

#### Scenario: HDRI smoothing is reduced
- **WHEN** `hdri-outdoor` is baked
- **THEN** it uses fewer smoothing passes than the current twelve and still passes the one-soft-shadow check

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
