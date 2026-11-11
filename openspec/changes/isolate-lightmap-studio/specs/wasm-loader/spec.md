# Spec Delta

## ADDED Requirements

### Requirement: Deterministic rotation seed

The module SHALL expose an `lmSeed(seed)` method that resets the lightmapper's
randomized hemisphere rotation jitter. The method SHALL accept a non-negative
integer and SHALL NOT require a WebGL context. A non-integer or negative seed
SHALL be rejected.

#### Scenario: Seed resets the jitter sequence
- **WHEN** `lmSeed(0)` is called before each of two bakes of the same scene
- **THEN** both bakes use the same rotation jitter sequence

#### Scenario: Seeding needs no context
- **WHEN** `lmSeed(0)` is called before any WebGL context is bound
- **THEN** the call succeeds

#### Scenario: Invalid seed rejected
- **WHEN** `lmSeed` receives a negative or non-integer value
- **THEN** it throws an error naming the invalid seed
