# Spec Delta

## REMOVED Requirements

### Requirement: Studio consumer boundary

**Reason**: The showcase no longer consumes a local checkout of the studio; it installs the published package, so the local-link boundary is replaced by a registry-consumption boundary.

**Migration**: Keep the showcase's `lightmapper-wasm: file:..` link and install `lightmap-studio@^0.1.0` from the npm registry; the added requirement covers resolution, the single wrapper copy and the CI build order.

## ADDED Requirements

### Requirement: Published studio consumer boundary

The showcase SHALL consume the published `lightmap-studio@^0.1.0` package from the npm registry and SHALL NOT contain its own unwrap or bake implementation. It SHALL keep exactly one `lightmapper-wasm` copy, resolved to the repository's tested local `dist` artifact. Demo scenes, the three.js display, the gallery and thumbnails SHALL remain site-local. The studio and xatlas dependencies SHALL stay out of the root package.

#### Scenario: Registry studio dependency

- **WHEN** the site dependencies are installed
- **THEN** `lightmap-studio` resolves from the npm registry tarball at a version satisfying `^0.1.0` and no local `studio/` link is installed

#### Scenario: Single wrapper copy

- **WHEN** the installed site dependency tree is inspected
- **THEN** exactly one `lightmapper-wasm` entry exists and it resolves to the repository's local `file:..` link rather than a registry copy

#### Scenario: Pipeline is not duplicated

- **WHEN** the site source is inspected
- **THEN** it contains no xatlas unwrap or lightmapper bake harness of its own

#### Scenario: Root package stays dependency-free

- **WHEN** the root `package.json` and npm tarball are inspected
- **THEN** neither the studio package nor xatlas appears as a runtime dependency or published file

#### Scenario: CI build order

- **WHEN** the site job runs
- **THEN** it builds the root `dist`, installs the site with the registry studio package and the local wrapper link, and runs the site checks without building a studio package

### Requirement: Studio dependency drift is rejected

The site verification SHALL fail with a clear message when the showcase stops consuming the published studio package or starts resolving more than one wrapper copy.

#### Scenario: Local link reintroduced

- **WHEN** the site lockfile resolves `lightmap-studio` from a filesystem link instead of a registry tarball
- **THEN** the site dependency check fails and names the local resolution

#### Scenario: Version leaves the supported range

- **WHEN** the installed `lightmap-studio` version does not satisfy `^0.1.0`
- **THEN** the site dependency check fails and reports the installed version

#### Scenario: Second wrapper copy appears

- **WHEN** the site lockfile contains a nested `lightmapper-wasm` entry beside the local link
- **THEN** the site dependency check fails and names both resolutions
