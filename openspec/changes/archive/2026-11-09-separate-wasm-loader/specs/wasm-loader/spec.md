# Spec Delta

## MODIFIED Requirements

### Requirement: Factory selection
The loader SHALL use `options.moduleFactory` when supplied, otherwise load the
default factory: a dynamic import of the build output in the source layout, or
the Emscripten glue inlined in the published `dist/` bundle. The factory SHALL
be instantiated with the module options, including the wasm bytes resolved by
the explicit asset-control requirement.

#### Scenario: Custom factory
- **WHEN** `moduleFactory` is a function
- **THEN** it is called with `wasmModuleOptions` — including the resolved wasm
  bytes — and its module is used

#### Scenario: Default factory in the package
- **WHEN** the installed `dist/index.js` is imported and no factory is supplied
- **THEN** the inlined glue is instantiated without resolving a build-tree
  path, using the asset resolved beside the entry

#### Scenario: Default factory in the source layout
- **WHEN** the package source is used in the repository and no factory is
  supplied
- **THEN** the build output under `build/wasm/wasm/` is dynamically imported

## ADDED Requirements

### Requirement: Explicit wasm asset control
Initialization of the default factory SHALL obtain the wasm bytes from
`options.wasmBinary` when supplied, else from the location returned by
`options.locateWasm` when supplied, else from the default asset URL resolved
beside the loaded module; supplied bytes SHALL take precedence over any URL
resolution.

#### Scenario: Supplied bytes win
- **WHEN** `wasmBinary` holds wasm bytes
- **THEN** no asset URL is fetched and the factory instantiates from those
  bytes

#### Scenario: locateWasm overrides the default URL
- **WHEN** `locateWasm` returns a URL or filename for the asset
- **THEN** the loader fetches that location instead of the default
  `lightmapper.wasm` beside the module

#### Scenario: Default asset URL
- **WHEN** neither option is supplied and the published entry is used
- **THEN** the loader resolves `lightmapper.wasm` relative to the entry
  module's URL

#### Scenario: Asset fetch failure
- **WHEN** the resolved asset location cannot be fetched or does not deliver
  wasm bytes
- **THEN** initialization rejects with an error naming the asset location and
  the failed step

### Requirement: Streaming instantiation with fallback
On the browser load path the loader SHALL prefer
`WebAssembly.instantiateStreaming` over the fetched asset response and SHALL
fall back to `WebAssembly.instantiate` on an ArrayBuffer when streaming is
unavailable or the response is not usable for streaming.

#### Scenario: Streaming path
- **WHEN** the browser supports `instantiateStreaming` and the response can be
  streamed
- **THEN** the module is instantiated from the streamed response

#### Scenario: Streaming unavailable falls back
- **WHEN** `instantiateStreaming` is unavailable or the response content type
  is not `application/wasm`
- **THEN** initialization still succeeds through the ArrayBuffer fallback

### Requirement: Capability probe precedes asset fetch
Unless `skipCapabilityCheck` is true, the loader SHALL complete WebGL2 context
resolution and the float-readback capability probe before requesting any wasm
bytes, so a failed probe performs no asset fetch.

#### Scenario: Probe failure makes no asset request
- **WHEN** `EXT_color_buffer_float` is unavailable
- **THEN** initialization rejects with the capability error and no request for
  `lightmapper.wasm` is made

#### Scenario: Skip flag keeps its escape-hatch meaning
- **WHEN** `skipCapabilityCheck` is true
- **THEN** initialization proceeds to asset resolution without running the
  probe
