# Spec Delta

## ADDED Requirements

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
