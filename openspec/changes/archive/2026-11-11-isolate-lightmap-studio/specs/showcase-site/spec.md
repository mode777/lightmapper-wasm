# Spec Delta

## ADDED Requirements

### Requirement: Studio consumer boundary

The showcase SHALL consume the private `lightmap-studio` package from the
local checkout (`file:../studio`) and SHALL NOT contain its own unwrap or bake
implementation. Demo scenes, the three.js display, the gallery and thumbnails
SHALL remain site-local. The studio and xatlas dependencies SHALL stay out of
the root package.

#### Scenario: Local studio dependency
- **WHEN** the site dependencies are installed
- **THEN** `lightmap-studio` resolves from `studio/` and no registry copy is fetched

#### Scenario: Pipeline is not duplicated
- **WHEN** the site source is inspected
- **THEN** it contains no xatlas unwrap or lightmapper bake harness of its own

#### Scenario: Root package stays dependency-free
- **WHEN** the root `package.json` and npm tarball are inspected
- **THEN** neither the studio package nor xatlas appears as a runtime dependency or published file

#### Scenario: CI build order
- **WHEN** the site job runs
- **THEN** it builds the root `dist`, installs the linked studio, installs the site and then runs the site checks
