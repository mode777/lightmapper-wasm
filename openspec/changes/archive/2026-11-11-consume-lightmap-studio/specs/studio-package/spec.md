# Spec Delta

## REMOVED Requirements

### Requirement: Staged handoff from the local copy

**Reason**: Stage 3 removes the local `studio/` copy, so there is no second copy to freeze or keep in sync. The showcase consumes the published package directly.

**Migration**: Install `lightmap-studio@^0.1.0` from the registry in `site/` and keep the showcase's `lightmapper-wasm` dependency as the local `file:..` link. Behavior is identical because the published `0.1.0` entry is byte-identical to the removed local build.

## ADDED Requirements

### Requirement: Showcase consumes the published package

The showcase SHALL install `lightmap-studio` from the npm registry at a version satisfying `^0.1.0` and SHALL NOT depend on a repository-relative studio path. The standalone repository remains the only source of studio code, tests and releases.

#### Scenario: Registry resolution

- **WHEN** `site/package.json` and the site lockfile are inspected
- **THEN** `lightmap-studio` is a registry dependency with a version range and no `file:` studio spec remains

#### Scenario: No local studio checkout

- **WHEN** the repository tree is inspected
- **THEN** it contains no `studio/` package, studio lockfile or studio build scripts

#### Scenario: Published build is unchanged

- **WHEN** the installed `lightmap-studio@0.1.0` entry is compared with the removed local build
- **THEN** the JavaScript entry and its declarations are identical and the showcase bakes the same scene results

#### Scenario: Studio gates stay with the studio repository

- **WHEN** continuous integration or remote verification runs in this repository
- **THEN** it does not build or unit-test a studio package, and the showcase suites exercise the installed registry package instead
