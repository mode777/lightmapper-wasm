# Spec Delta

## REMOVED Requirements

### Requirement: Private studio package is not published

**Reason**: The repository no longer contains a `studio/` package, so the requirement is restated as the published-package boundary it actually guarantees.

**Migration**: Keep the root `files` list and `exports` map unchanged; the added requirement covers the tarball and dependency boundary after the studio removal.

## ADDED Requirements

### Requirement: Published package contains no studio or site files

The `lightmapper-wasm` tarball, exports and runtime dependency graph SHALL contain no studio code, showcase files or studio dependencies. The root `files` list and `exports` map SHALL expose only the published entries.

#### Scenario: Tarball excludes studio and site

- **WHEN** `npm pack` runs
- **THEN** the tarball contains no `studio/` or `site/` files, studio dependencies or studio entry points

#### Scenario: Root exports unchanged

- **WHEN** the root `package.json` exports map is inspected
- **THEN** it still exposes only the existing default and single-file entries

#### Scenario: Dependency graph unchanged

- **WHEN** the root package is installed by a consumer
- **THEN** no xatlas or studio package is installed as a runtime dependency
