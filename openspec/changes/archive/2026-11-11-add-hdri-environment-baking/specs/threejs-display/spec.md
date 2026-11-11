# Spec Delta

## MODIFIED Requirements

### Requirement: Scene background

The display layer SHALL support a solid color, a transparent background, or a
linear equirectangular HDRI texture. An HDRI background SHALL use
equirectangular mapping, linear color space, clamp-to-edge wrapping and the
declared background intensity. The background SHALL be disposed with the
display.

#### Scenario: Solid background
- **WHEN** a scene declares a background color
- **THEN** the viewport renders that color behind the baked objects

#### Scenario: Transparent background
- **WHEN** a scene declares no background color
- **THEN** the viewport remains transparent so the page surface shows through

#### Scenario: HDRI background
- **WHEN** a scene supplies a linear equirectangular HDRI texture
- **THEN** the viewport renders it behind the baked objects with equirectangular mapping and linear color space

#### Scenario: HDRI intensity
- **WHEN** the scene declares an HDRI background intensity
- **THEN** the background uses that intensity and the lightmap is unchanged

#### Scenario: HDRI disposal
- **WHEN** the display is disposed
- **THEN** the HDRI background texture is released
