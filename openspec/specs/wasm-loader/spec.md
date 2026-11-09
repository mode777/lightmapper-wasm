# wasm-loader Specification

## Purpose

Defines `createLightmapperModule(options)`: resolving a WebGL2 context,
probing the float-render-target capability, loading the Emscripten factory,
registering the context and enforcing strict context binding before returning
the low-level `LightmapperModule`.

## Requirements

### Requirement: Asynchronous module entry point
The package SHALL export `createLightmapperModule(options?)` returning a
Promise that resolves to a module with the constants, heap helpers and `lm*`
wrappers.

#### Scenario: Initialization resolves
- **WHEN** `createLightmapperModule` is awaited with a valid WebGL2 context
- **THEN** the returned object exposes `lmCreate`, `lmDestroy`,
  `lmSetTargetLightmap`, `lmSetGeometry`, `lmBegin`, `lmEnd`, `lmProgress`, the
  image helpers, the allocators/views and the constant getters

#### Scenario: Initialization rejects
- **WHEN** no WebGL2 context is available or the factory cannot load
- **THEN** the returned Promise rejects with an error naming the failed step
  and no partial module is returned

### Requirement: WebGL2 context resolution
The loader SHALL use `options.webglContext` when provided, otherwise obtain a
`webgl2` context from `options.canvas`, otherwise create a hidden canvas and
obtain a context from it.

#### Scenario: Explicit context wins
- **WHEN** `webglContext` and `canvas` are both supplied
- **THEN** the explicit `webglContext` is used

#### Scenario: No context available
- **WHEN** neither a context nor a canvas is available and the environment
  cannot create one
- **THEN** initialization fails with an error stating that WebGL2 is
  unavailable

### Requirement: Float render-target capability probe
Unless `skipCapabilityCheck` is true, initialization SHALL require
`EXT_color_buffer_float`, SHALL verify that an RGBA32F framebuffer is complete,
and SHALL verify `readPixels` with `RGBA`/`FLOAT` succeeds.

#### Scenario: Capability present
- **WHEN** the extension and RGBA32F readback work
- **THEN** initialization proceeds

#### Scenario: Extension missing
- **WHEN** `EXT_color_buffer_float` is not available
- **THEN** initialization throws an error naming `EXT_color_buffer_float` and
  does not load the module

#### Scenario: Framebuffer or readback failure
- **WHEN** the RGBA32F framebuffer is incomplete or `readPixels` reports a GL
  error
- **THEN** initialization throws an error describing the failed capability and
  restores the previous framebuffer/texture bindings

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

### Requirement: Emscripten context registration
The loader SHALL register the resolved WebGL2 context with Emscripten when
needed, make the resulting handle current, and expose the handle and the
current-handle query.

#### Scenario: Context is registered
- **WHEN** no `emscriptenContextHandle` is supplied and
  `autoRegisterEmscriptenContext` is not false
- **THEN** the loader calls `GL.registerContext` with the resolved attributes
  and calls `makeContextCurrent`

#### Scenario: Existing handle
- **WHEN** `emscriptenContextHandle` is supplied
- **THEN** it is used instead of scanning or registering a new context

### Requirement: Strict context binding
With `strictContextBinding` enabled (the default), GL-dependent API calls SHALL
fail if the bound Emscripten context is not current.

#### Scenario: Wrong context
- **WHEN** the caller switches the current Emscripten context and then calls a
  GL-dependent lightmapper function
- **THEN** the wrapper throws an error telling the caller to call
  `makeBoundContextCurrent()` first

#### Scenario: Binding disabled
- **WHEN** `strictContextBinding` is false
- **THEN** the current-context check is skipped and the call proceeds

### Requirement: Forwarded module options
The loader SHALL forward `wasmModuleOptions` to the Emscripten factory.

#### Scenario: Module option passthrough
- **WHEN** `wasmModuleOptions` contains a supported Emscripten module option
- **THEN** the option is visible to the factory during initialization

### Requirement: Current browser-only environment
The current artifact SHALL be built for the browser web environment only, and
the package SHALL NOT claim Node rendering support without a real WebGL2
implementation.

#### Scenario: Worker or Node import
- **WHEN** the current artifact is loaded outside a browser main thread
- **THEN** the limitation is documented rather than silently claiming support

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
