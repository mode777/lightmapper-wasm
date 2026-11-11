# Spec Delta

## MODIFIED Requirements

### Requirement: Package-shaped module

The harness SHALL live in the studio package and remain display-agnostic: no
site imports, no three.js dependency, no xatlas dependency, typed inputs and
outputs, and a disposable context lifecycle.

#### Scenario: Promotion audit
- **WHEN** the harness source is inspected in the studio package
- **THEN** it contains no import from `site/`, `three`, or `xatlas-wasm`

#### Scenario: Disposal
- **WHEN** the harness is disposed
- **THEN** its contexts, textures, buffers and heap allocations are released
