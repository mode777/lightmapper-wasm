# npm-package Specification

## Purpose

Defines the published `lightmapper-wasm` package shape: the ESM entry, the
current single-file JavaScript artifact, the TypeScript declarations, the
files list and the runtime dependency policy.

## Requirements

### Requirement: ESM package entry
The package SHALL be ESM-only and expose `dist/index.js` as the default entry
with `dist/index.d.ts` as its types.

#### Scenario: Package import
- **WHEN** a consumer imports `lightmapper-wasm`
- **THEN** the package resolves `./dist/index.js`, and `createLightmapperModule`
  is available as a named export

#### Scenario: TypeScript consumer
- **WHEN** a TypeScript consumer imports the package with `moduleResolution`
  compatible with the `exports` map
- **THEN** the declarations from `dist/index.d.ts` are used

### Requirement: Published files
The package SHALL publish `dist/` — containing the default entry, the
`lightmapper.wasm` asset, the single-file entry and the declarations — plus
`LIGHTMAPPER.md`, `WASM_SETUP.md` and `LICENSE`, and SHALL NOT require files
from the repository build tree or examples.

#### Scenario: Tarball contents
- **WHEN** `npm pack` runs
- **THEN** the tarball contains `dist/index.js`, `dist/lightmapper.wasm`, the
  single-file entry, `dist/index.d.ts`, `README.md`, `LIGHTMAPPER.md`,
  `WASM_SETUP.md` and `LICENSE`, and does not depend on `build/`, `src/`,
  `wasm/` or `examples/`

### Requirement: No runtime dependencies
The package SHALL have no runtime dependencies; build-only tooling SHALL stay
in `devDependencies`.

#### Scenario: Dependency audit
- **WHEN** `package.json` is inspected
- **THEN** it has no `dependencies` field with runtime packages and the
  published entry does not import a third-party module

### Requirement: Handwritten declarations are the current source
The package SHALL ship the handwritten `types/index.d.ts` as
`dist/index.d.ts` until the generated/ABI-checked surface lands.

#### Scenario: Declaration copy
- **WHEN** `build:dist` runs
- **THEN** `dist/index.d.ts` is byte-identical to `types/index.d.ts`

### Requirement: Separate wasm asset in the published package
The package SHALL publish `dist/lightmapper.wasm` beside `dist/index.js`, and
the default entry SHALL resolve that asset relative to its own module URL so
npm, tarball and bundler consumers load it without extra configuration.

#### Scenario: Tarball contains the asset
- **WHEN** `npm pack` output is inspected
- **THEN** `dist/lightmapper.wasm` is present beside `dist/index.js` and
  `dist/index.d.ts`

#### Scenario: Installed package loads the asset
- **WHEN** the installed package entry is imported in a browser and
  `createLightmapperModule` initializes
- **THEN** the wasm is fetched from the installed `dist/lightmapper.wasm`

#### Scenario: Bundler emits the asset
- **WHEN** a bundler consumer builds a page with the package
- **THEN** the `.wasm` is emitted as a build asset and the built page loads it

### Requirement: Optional single-file entry
The package SHALL publish an additional ESM entry under `dist/` that inlines
the Emscripten glue with the wasm embedded, for consumers that cannot serve a
separate asset, and its documentation SHALL NOT claim a `.wasm` asset for it.

#### Scenario: Single-file entry import
- **WHEN** a consumer imports the single-file entry in a browser
- **THEN** `createLightmapperModule` initializes without fetching a `.wasm`

#### Scenario: Flavour documentation is honest
- **WHEN** the README or `WASM_SETUP.md` describes the published entries
- **THEN** each entry's artifact layout is described accurately
