# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Current single-file artifact
**Reason**: The default published artifact now resolves a separate
`dist/lightmapper.wasm` so the binary can stream and cache (AD-009).
**Migration**: Consumers who need embedded bytes import the single-file entry;
the default entry no longer contains the base64 payload.
