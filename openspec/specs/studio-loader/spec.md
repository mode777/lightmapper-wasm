# studio-loader Specification

## Purpose

Define how the studio loads the xatlas and lightmapper WebAssembly modules
behind one option surface, lazily and with predictable failures.

## Requirements

### Requirement: Lazy initialization

Creating a studio SHALL NOT load or fetch either WebAssembly module.
Unwrapping SHALL initialize the xatlas module only. Baking SHALL initialize
the lightmapper module and SHALL initialize xatlas only when the bake input
needs unwrapping.

#### Scenario: Creation performs no loading
- **WHEN** a studio is created without unwrapping or baking
- **THEN** neither wasm asset is requested and no module is instantiated

#### Scenario: Unwrap loads only xatlas
- **WHEN** only `unwrap` is called
- **THEN** the xatlas module is initialized and the lightmapper module is not requested

#### Scenario: Bake loads lightmapper
- **WHEN** a bake runs
- **THEN** the lightmapper module is initialized before the first bake pass

### Requirement: Single option surface

The studio SHALL expose one `wasm` option with a `lightmapper` entry and an
`xatlas` entry. Each entry SHALL accept either `binary` bytes or a `url`, and
callers SHALL NOT need to know the low-level packages' different option names.

#### Scenario: URL override
- **WHEN** a caller supplies a URL for one module
- **THEN** that module is fetched from the URL and the other module keeps its default resolution

#### Scenario: Binary override
- **WHEN** a caller supplies bytes for one module
- **THEN** those bytes are instantiated without fetching that module's default asset

#### Scenario: Low-level names are not required
- **WHEN** a caller configures both assets through the studio's `wasm` option
- **THEN** no `locateWasm`, `locateFile` or `wasmBinary` option is required from the caller

### Requirement: Load precedence

For each module the studio SHALL resolve, in order: a supplied pre-initialized
module, supplied `binary` bytes, a supplied `url`, then the dependency's
default asset.

#### Scenario: Binary wins over URL
- **WHEN** both `binary` and `url` are supplied for a module
- **THEN** the bytes are used and the URL is not fetched

#### Scenario: Injected module wins over binary
- **WHEN** both a pre-initialized module and bytes are supplied
- **THEN** the pre-initialized module is used

#### Scenario: Default is used when omitted
- **WHEN** no override is supplied for a module
- **THEN** the studio delegates to that dependency's default asset resolution

### Requirement: Delegated default resolution

When no override is supplied, the studio SHALL use each dependency's own
default resolution beside its published entry and SHALL NOT duplicate that
path logic. A bundler consumer SHALL emit both wasm assets.

#### Scenario: Default lightmapper asset
- **WHEN** the installed default entry is used without a lightmapper override
- **THEN** `lightmapper.wasm` is fetched from the lightmapper dependency's published location

#### Scenario: Default xatlas asset
- **WHEN** the installed default entry is used without an xatlas override
- **THEN** `xatlas.wasm` is fetched from the xatlas dependency's published location

#### Scenario: Bundler emits both assets
- **WHEN** a bundler builds a page that imports the studio
- **THEN** both wasm files are emitted as build assets

### Requirement: Preflight before lightmapper fetch

Baking SHALL resolve the WebGL2 context and probe
`EXT_color_buffer_float` before requesting lightmapper bytes. Unwrapping SHALL
NOT require a context or the float capability.

#### Scenario: Probe failure fetches nothing
- **WHEN** `EXT_color_buffer_float` is unavailable
- **THEN** the bake rejects with the capability error and no request for `lightmapper.wasm` is made

#### Scenario: Unwrap needs no context
- **WHEN** a caller unwraps in an environment with no WebGL2 context
- **THEN** the unwrap proceeds using only the xatlas module

### Requirement: Loader failures

The studio SHALL reject an invalid override type with a validation error
naming the option. A missing or failed asset SHALL reject with an asset error
naming the file and the dependency that owns it.

#### Scenario: Invalid override type
- **WHEN** a `binary` value is not an `ArrayBuffer` or `Uint8Array`
- **THEN** the studio rejects with a validation error naming the `wasm` entry

#### Scenario: Asset fetch failure
- **WHEN** a configured URL cannot be fetched or does not deliver a wasm module
- **THEN** the rejection names the file, the URL and the failed step

#### Scenario: Module initialization failure
- **WHEN** a wasm module cannot be instantiated
- **THEN** the rejection names the dependency whose module failed

### Requirement: Injected module ownership

When a pre-initialized module is supplied, the studio SHALL use it without
fetching or instantiating another. The studio SHALL NOT dispose a
caller-injected module.

#### Scenario: Injected module is reused
- **WHEN** a caller supplies an initialized xatlas module
- **THEN** unwrapping uses that instance and requests no xatlas asset

#### Scenario: Injected modules survive disposal
- **WHEN** the studio is disposed
- **THEN** caller-injected modules remain usable by the caller

### Requirement: Load once per instance

The studio SHALL load each module at most once per instance and SHALL reuse it
for later operations. Repeated unwrap or bake calls SHALL NOT refetch an
already-loaded module.

#### Scenario: Repeated unwrap reuses xatlas
- **WHEN** `unwrap` is called more than once on one studio
- **THEN** the xatlas module is fetched and instantiated only once

#### Scenario: Repeated bake reuses lightmapper
- **WHEN** `bake` is called more than once on one studio
- **THEN** the lightmapper module is fetched and instantiated only once
