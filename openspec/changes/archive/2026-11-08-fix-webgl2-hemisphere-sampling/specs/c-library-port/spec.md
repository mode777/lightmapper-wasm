# Spec Delta

## MODIFIED Requirements

### Requirement: Correct hemisphere sampling
The ES first-pass shader SHALL convert `gl_FragCoord.xy` to integer output texel coordinates before scaling by the 6×2 block size, so each output texel reads its exact source block under GLES3 half-integer pixel centers.

#### Scenario: First-pass block origin is exact
- **WHEN** the first-pass shader runs at output texel `(x, y)` for any `x >= 0` and `y >= 0`
- **THEN** the base source coordinate is `(6x, 2y)` and the six horizontal samples are taken from columns `6x..6x+5` of the same two source rows

#### Scenario: Origin texel is not shifted
- **WHEN** the first-pass shader runs at output texel `(0, 0)`
- **THEN** the base source coordinate is `(0, 0)` and the sample block is not shifted right or up

#### Scenario: Downsample remains consistent
- **WHEN** the downsample pass runs at output texel `(x, y)`
- **THEN** it reads the 2×2 block starting at `(2x, 2y)`
