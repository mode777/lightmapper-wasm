# studio-package Specification

## Purpose

Define how the engine-agnostic `lightmap-studio` pipeline is distributed as a
standalone, versioned npm package with reproducible builds, verified
consumers and a staged handoff from the in-repository copy.

## Requirements

### Requirement: Standalone repository and package identity

The studio SHALL be developed and released from the public repository
`mode777/lightmap-studio` and published as the unscoped npm package
`lightmap-studio`. The package SHALL be ESM-only, expose one root export, and
expose declarations through its `exports` map.

#### Scenario: Registry install resolves the package

- **WHEN** a consumer installs `lightmap-studio` from the npm registry
- **THEN** the root import resolves the published ESM entry and its TypeScript declarations

#### Scenario: Repository metadata names the standalone repository

- **WHEN** the package manifest is inspected
- **THEN** its `repository`, `homepage` and `bugs` fields point at `mode777/lightmap-studio`, not `lightmapper-wasm`

#### Scenario: Initial public version

- **WHEN** the first release is published
- **THEN** the package version is `0.1.0`

### Requirement: Published artifact layout

The published tarball SHALL contain the built `dist/` entry with its declarations, the README and the license. It SHALL NOT contain source, tests, scripts, CI configuration, lockfiles or build-only tooling.

#### Scenario: Tarball contents

- **WHEN** `npm pack` runs in the standalone repository
- **THEN** the tarball contains `dist/index.js`, `dist/index.d.ts`, `README.md` and `LICENSE`

#### Scenario: Development files stay out

- **WHEN** the tarball is listed
- **THEN** it contains no `src/`, `test/`, `scripts/`, `.github/`, `tsconfig.json` or lockfile

#### Scenario: Declarations match the build

- **WHEN** the package is built and packed
- **THEN** the published declarations are the ones emitted from the same source revision as the JavaScript entry

### Requirement: Runtime dependency contract

The package SHALL declare `lightmapper-wasm` and `xatlas-wasm` as direct runtime dependencies with normal published version ranges. The declared minimum `lightmapper-wasm` version SHALL provide `lmSeed` and the wasm `_srand` export. The package SHALL NOT depend on three.js or use `file:`, `link:` or workspace dependencies.

#### Scenario: Clean install outside the checkout

- **WHEN** the package is installed in an empty project with this repository absent
- **THEN** both dependencies resolve from the registry and the studio imports without a sibling checkout

#### Scenario: Seeded lightmapper is required

- **WHEN** the installed `lightmapper-wasm` is initialized through the studio
- **THEN** `lmSeed` is available and a bake can reset the rotation seed

#### Scenario: No three.js dependency

- **WHEN** the dependency sections of the manifest are inspected
- **THEN** three.js is absent and no dependency uses a local path

### Requirement: Checkout-independent build and tests

The build and every test command SHALL succeed in a fresh clone of the standalone repository with no parent repository, no sibling checkout and no Emscripten toolchain installed.

#### Scenario: Fresh clone builds

- **WHEN** a clean clone runs dependency installation, the TypeScript build and the unit suites
- **THEN** all commands succeed

#### Scenario: Headless test is self-contained

- **WHEN** the headless bake test starts its server
- **THEN** the served root and allowed paths are confined to the package checkout

#### Scenario: No Emscripten requirement

- **WHEN** the studio build and tests run
- **THEN** they use only the published wasm dependencies and do not invoke `emcc`, `emcmake` or CMake

### Requirement: Packed consumer verification

Verification SHALL install the packed tarball into a scratch application and prove that a bundler emits both wasm assets and that a browser can initialize the studio from that installation.

#### Scenario: Bundler emits both assets

- **WHEN** a scratch Vite application imports the installed tarball and builds
- **THEN** the output contains both `lightmapper.wasm` and `xatlas.wasm`

#### Scenario: Installed package runs

- **WHEN** a headless browser loads the built scratch application
- **THEN** the studio initializes and unwraps or bakes using the installed package assets

#### Scenario: Local paths are not used

- **WHEN** the scratch application is installed and built
- **THEN** its resolution of `lightmap-studio`, `lightmapper-wasm` and `xatlas-wasm` uses the tarball and registry copies, not repository-relative paths

### Requirement: Tag-driven release

A release SHALL publish to npm only from the standalone repository, only after the build, unit, packed-consumer and headless gates pass, and with provenance. The published version SHALL match the release tag.

#### Scenario: Matching tag publishes

- **WHEN** a release tag whose version matches the manifest is published
- **THEN** the workflow publishes that version with npm provenance

#### Scenario: Failing gate blocks publication

- **WHEN** any build, unit, consumer or headless gate fails
- **THEN** no package is published

#### Scenario: Mismatched tag is rejected

- **WHEN** the tag version and the manifest version differ
- **THEN** the release workflow fails before publishing

### Requirement: Documentation matches the package

The README SHALL document installation from the registry and the same public API, lighting model, presets, loader options, wasm asset requirements and three-free display recipe as the studio specification. It SHALL NOT describe the package as private, staged or linked with `file:`.

#### Scenario: Install instructions use the registry

- **WHEN** a reader follows the README install step
- **THEN** it installs `lightmap-studio` from npm without a local link

#### Scenario: Documented exports exist

- **WHEN** the README's quick-start imports are checked against the built entry
- **THEN** every referenced export is present

#### Scenario: Stale staging text is removed

- **WHEN** the README is searched for staging language
- **THEN** it contains no "private stage", `file:../studio` or "not published" claim

### Requirement: Staged handoff from the local copy

The standalone repository SHALL become canonical while `lightmapper-wasm` keeps its `studio/` copy functionally unchanged for the showcase until the consume stage. Studio behavior SHALL NOT be forked between the two copies.

#### Scenario: Showcase keeps its local dependency

- **WHEN** the bootstrap is complete
- **THEN** `site/` still resolves `lightmap-studio` from `file:../studio`

#### Scenario: Local copy is frozen

- **WHEN** documentation or package metadata in the local `studio/` copy is inspected
- **THEN** it only adds the canonical-repository note and does not diverge in behavior from the published package

#### Scenario: Root tarball still excludes the studio

- **WHEN** the `lightmapper-wasm` tarball is packed
- **THEN** it still contains no `studio/` files or studio dependencies
