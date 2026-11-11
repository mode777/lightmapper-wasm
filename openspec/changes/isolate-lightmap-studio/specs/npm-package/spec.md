# Spec Delta

## ADDED Requirements

### Requirement: Private studio package is not published

The repository SHALL keep the private `studio/` package out of the
`lightmapper-wasm` tarball, exports and runtime dependency graph. The root
`files` list and `exports` map SHALL NOT expose studio source or entries.

#### Scenario: Tarball excludes studio
- **WHEN** `npm pack` runs
- **THEN** the tarball contains no `studio/` files, studio dependencies or studio entry points

#### Scenario: Root exports unchanged
- **WHEN** the root `package.json` exports map is inspected
- **THEN** it still exposes only the existing default and single-file entries

#### Scenario: Dependency graph unchanged
- **WHEN** the root package is installed by a consumer
- **THEN** no xatlas or studio package is installed as a runtime dependency
