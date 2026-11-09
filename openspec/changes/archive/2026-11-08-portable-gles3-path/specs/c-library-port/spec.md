# Spec Delta

## MODIFIED Requirements

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
