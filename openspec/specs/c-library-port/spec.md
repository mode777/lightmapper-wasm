# c-library-port Specification

## Purpose

Defines the WebGL2/GLES3 behavior that `lightmapper-wasm` requires from the
upstream `thirdparty/lightmapper` submodule. This is a dependency contract:
upstream owns the implementation, and this package owns the submodule pin and
the verification that consumes it.

## Requirements

### Requirement: GLSL ES 3.00 shader path
The upstream header SHALL provide a GLES3/WebGL2 shader path using
`#version 300 es`, fragment-shader precision declarations and no desktop-only
GLSL constructs.

#### Scenario: ES shaders compile
- **WHEN** the library creates its shaders on a WebGL2 context
- **THEN** both internal programs compile and link without
  `layout(pixel_center_integer)` or other desktop-only qualifiers

### Requirement: Correct hemisphere sampling
The ES first-pass shader SHALL convert `gl_FragCoord.xy` to integer output texel coordinates before scaling by the 6×2 block size, so each output texel reads its exact source block under GLES3 half-integer pixel centers.

#### Scenario: First-pass block origin is exact
- **WHEN** the first-pass shader runs at output texel `(x, y)` for any `x >= 0` and `y >= 0`
- **THEN** the base source coordinate is `(6x, 2y)` and the six horizontal samples are taken from columns `6x..6x+5` of the same two source rows

#### Scenario: Origin texel is not shifted
- **WHEN** the first-pass shader runs at output texel `(0, 0)`
- **THEN** the base source coordinate is `(0, 0)` and the sample block is not shifted right or up

#### Scenario: Downsample remains consistent
- **WHEN** the downsample pass runs at output texel `(x, y)`
- **THEN** it reads the 2×2 block starting at `(2x, 2y)`

### Requirement: No desktop-only GL calls in the ES path
The ES path SHALL NOT call `glGetTexImage` or require desktop-only extensions;
final readback SHALL use an FBO attachment and `glReadPixels`.

#### Scenario: Readback uses a framebuffer
- **WHEN** a WebGL2 context reaches the final lightmap readback
- **THEN** the storage texture is attached to a framebuffer and read with
  `glReadPixels` using a float-capable format

### Requirement: Float render-target capability
The library SHALL require `EXT_color_buffer_float` for RGBA32F render targets
and float readback, and SHALL fail clearly when the capability is absent.

#### Scenario: Capability present
- **WHEN** the WebGL2 context exposes `EXT_color_buffer_float` and supports
  RGBA32F framebuffer readback
- **THEN** `lmCreate` succeeds and rendering proceeds

#### Scenario: Capability missing
- **WHEN** the capability is absent or an RGBA32F framebuffer is incomplete
- **THEN** the integration reports a clear capability error and does not
  continue with an incomplete framebuffer

### Requirement: Readback state preservation
The ES readback SHALL preserve the caller’s read and draw framebuffer bindings
and read-buffer state and restore them after the readback completes.

#### Scenario: Caller framebuffer is restored
- **WHEN** the final readback runs while the caller has a framebuffer bound
- **THEN** the caller’s read and draw framebuffer bindings are restored and the
  read buffer is valid for the restored framebuffer

#### Scenario: Distinct read and draw framebuffers are preserved
- **WHEN** the caller has different framebuffers bound to the read and draw
  targets
- **THEN** both bindings are restored to their original framebuffers after the
  readback

#### Scenario: Read buffer is restored on the read framebuffer
- **WHEN** the caller’s read framebuffer has a non-default read buffer selected
- **THEN** the same read buffer is selected again after the readback

### Requirement: Non-fatal readback failure
The ES readback SHALL check framebuffer completeness explicitly and, when the
framebuffer is incomplete, report a clear error and skip the transfer without
aborting the process or leaving the context unusable.

#### Scenario: Incomplete readback framebuffer
- **WHEN** the readback framebuffer is not complete
- **THEN** no pixel transfer is issued, a clear error is reported, and the bake
  can continue with the remaining work

#### Scenario: Assertion-enabled build does not abort
- **WHEN** the library is built without `NDEBUG` and the readback framebuffer is
  incomplete
- **THEN** the process does not terminate and the error is reported on standard
  error

### Requirement: Reusable readback resources
The upstream header SHALL allocate the readback framebuffer and the CPU
readback buffer once per context, reuse them across passes, and grow the buffer
only when a larger target lightmap requires it.

#### Scenario: Multiple flushes reuse resources
- **WHEN** a bake performs more than one storage flush
- **THEN** no framebuffer is created or deleted per flush and the same readback
  resources are reused

#### Scenario: Larger target lightmap grows once
- **WHEN** a larger target lightmap is set on the same context
- **THEN** the CPU readback buffer grows to the new size and is reused for
  subsequent passes

#### Scenario: Teardown releases readback resources
- **WHEN** the context is destroyed
- **THEN** the cached readback framebuffer and buffer are released

### Requirement: Bounded readback transfer
The ES readback SHALL transfer only rows that contain written hemisphere
batches and SHALL NOT read pixels or index the position map beyond the target
lightmap.

#### Scenario: Only written rows are transferred
- **WHEN** a flush writes a number of rows smaller than the lightmap height
- **THEN** the transfer reads exactly those rows instead of the full lightmap
  height

#### Scenario: Written rows exceed lightmap height
- **WHEN** the flush's row count would exceed the target lightmap height
- **THEN** the transfer and result loop stop at the lightmap height

#### Scenario: Position map access stays in range
- **WHEN** only the written rows are transferred
- **THEN** the position map is consumed only within those rows

### Requirement: Deterministic readback teardown
`lmDestroy` SHALL release the storage texture exactly once and SHALL release
all cached readback resources before freeing the context.

#### Scenario: Storage texture released once
- **WHEN** the context is destroyed
- **THEN** the storage texture is deleted exactly once

#### Scenario: No readback resource leaks
- **WHEN** the context is destroyed after one or more bakes
- **THEN** the cached readback framebuffer and buffer are released

### Requirement: Portable GLES3 detection
The GLES3 shader and readback path SHALL be selected from a single capability macro that auto-detects `GL_ES_VERSION_3_0` and accepts an explicit `LM_GLES3` 0/1 override; no GLSL or readback path SHALL be selected from `__EMSCRIPTEN__`.

#### Scenario: Native GLES3 build
- **WHEN** the header is compiled against GLES3 headers without Emscripten
- **THEN** the ES shader and FBO readback path are selected

#### Scenario: Desktop build
- **WHEN** the header is compiled against desktop OpenGL 3.2 core headers
- **THEN** the desktop shader and `glGetTexImage` path are selected

#### Scenario: Emscripten build still selects ES
- **WHEN** the header is compiled by Emscripten against GLES3 headers
- **THEN** the ES shader and FBO readback path are selected through
  `GL_ES_VERSION_3_0`, without consulting `__EMSCRIPTEN__`

#### Scenario: Explicit ES override
- **WHEN** a consumer defines `LM_GLES3` as 1
- **THEN** the ES shader and FBO readback path are selected regardless of the
  included GL headers

#### Scenario: Explicit desktop override
- **WHEN** a consumer defines `LM_GLES3` as 0
- **THEN** the desktop shader and `glGetTexImage` path are selected

#### Scenario: No compiler-identity path selection
- **WHEN** the header is compiled by any toolchain
- **THEN** no shader or readback branch is chosen solely because
  `__EMSCRIPTEN__` is defined

### Requirement: Single-threaded reference build
The upstream header SHALL support a single-threaded WebAssembly build without
pthreads, shared memory or SIMD.

#### Scenario: Portable artifact
- **WHEN** the reference wasm artifact is instantiated
- **THEN** it starts without a pthread worker pool and does not require
  `SharedArrayBuffer`

### Requirement: Cosine hemisphere weight export

The wasm shim SHALL expose a built-in cosine hemisphere weight that calls the
upstream `lmSetHemisphereWeights` API with a static `cos(theta)` function. The
JavaScript module SHALL expose that operation and document that it changes the
context's material weighting. This SHALL NOT require a `lightmapper.h` change
or a submodule bump.

#### Scenario: Cosine weight is exported
- **WHEN** the wasm module and JavaScript wrapper are inspected
- **THEN** the cosine-weight operation is present in the wasm exports, the module return value and the TypeScript declarations

#### Scenario: Cosine weight is applied
- **WHEN** the caller invokes the operation on a valid context with a bound WebGL2 context
- **THEN** `lmSetHemisphereWeights` is called with a cosine function and the call completes without a GL error

#### Scenario: Repeated calls replace the weight
- **WHEN** the operation is called more than once on the same context
- **THEN** the latest weight table is used for subsequent hemisphere passes and the context remains valid

#### Scenario: Invalid context is rejected
- **WHEN** the operation is called with a null or invalid context
- **THEN** the wrapper throws a clear validation error

#### Scenario: Unbound context is rejected
- **WHEN** the operation is called without a bound WebGL2 context
- **THEN** the wrapper throws the existing context-binding error before calling wasm

#### Scenario: Context teardown releases the weight data
- **WHEN** the context is destroyed
- **THEN** the upstream weight texture is released with the rest of the lightmapper context

#### Scenario: No upstream header change
- **WHEN** the change is reviewed
- **THEN** `thirdparty/lightmapper/lightmapper.h` and the submodule pointer are unchanged
