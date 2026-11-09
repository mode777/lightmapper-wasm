# Spec Delta

## MODIFIED Requirements

### Requirement: Readback state preservation
The ES readback SHALL preserve the caller’s read and draw framebuffer bindings and read-buffer state and restore them after the readback completes.

#### Scenario: Caller framebuffer is restored
- **WHEN** the final readback runs while the caller has a framebuffer bound
- **THEN** the caller’s read and draw framebuffer bindings are restored and the read buffer is valid for the restored framebuffer

#### Scenario: Distinct read and draw framebuffers are preserved
- **WHEN** the caller has different framebuffers bound to the read and draw targets
- **THEN** both bindings are restored to their original framebuffers after the readback

#### Scenario: Read buffer is restored on the read framebuffer
- **WHEN** the caller’s read framebuffer has a non-default read buffer selected
- **THEN** the same read buffer is selected again after the readback

## ADDED Requirements

### Requirement: Non-fatal readback failure
The ES readback SHALL check framebuffer completeness explicitly and, when the framebuffer is incomplete, report a clear error and skip the transfer without aborting the process or leaving the context unusable.

#### Scenario: Incomplete readback framebuffer
- **WHEN** the readback framebuffer is not complete
- **THEN** no pixel transfer is issued, a clear error is reported, and the bake can continue with the remaining work

#### Scenario: Assertion-enabled build does not abort
- **WHEN** the library is built without `NDEBUG` and the readback framebuffer is incomplete
- **THEN** the process does not terminate and the error is reported on standard error

### Requirement: Reusable readback resources
The upstream header SHALL allocate the readback framebuffer and the CPU readback buffer once per context, reuse them across passes, and grow the buffer only when a larger target lightmap requires it.

#### Scenario: Multiple flushes reuse resources
- **WHEN** a bake performs more than one storage flush
- **THEN** no framebuffer is created or deleted per flush and the same readback resources are reused

#### Scenario: Larger target lightmap grows once
- **WHEN** a larger target lightmap is set on the same context
- **THEN** the CPU readback buffer grows to the new size and is reused for subsequent passes

#### Scenario: Teardown releases readback resources
- **WHEN** the context is destroyed
- **THEN** the cached readback framebuffer and buffer are released

### Requirement: Bounded readback transfer
The ES readback SHALL transfer only rows that contain written hemisphere batches and SHALL NOT read pixels or index the position map beyond the target lightmap.

#### Scenario: Only written rows are transferred
- **WHEN** a flush writes a number of rows smaller than the lightmap height
- **THEN** the transfer reads exactly those rows instead of the full lightmap height

#### Scenario: Written rows exceed lightmap height
- **WHEN** the flush's row count would exceed the target lightmap height
- **THEN** the transfer and result loop stop at the lightmap height

#### Scenario: Position map access stays in range
- **WHEN** only the written rows are transferred
- **THEN** the position map is consumed only within those rows

### Requirement: Deterministic readback teardown
`lmDestroy` SHALL release the storage texture exactly once and SHALL release all cached readback resources before freeing the context.

#### Scenario: Storage texture released once
- **WHEN** the context is destroyed
- **THEN** the storage texture is deleted exactly once

#### Scenario: No readback resource leaks
- **WHEN** the context is destroyed after one or more bakes
- **THEN** the cached readback framebuffer and buffer are released
