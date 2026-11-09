# Design

## Context

See `proposal.md` for motivation. The current build path is a single-config
CMake build under Emscripten: `configure:wasm` runs `emcmake cmake` with no
`CMAKE_BUILD_TYPE`, and `build:wasm` passes `--config Release`, which the
single-config generator ignores. The measured release artifact is a
230,583-byte `lightmapper_wasm.mjs` containing a 98,112-byte base64-embedded
wasm; the source has a measured `-O3 -flto` size of 44,279 bytes. CI installs
Emscripten `latest` via `setup-emsdk@v14`, and `.gitmodules` records a
userinfo URL. AD-004 keeps this work in `lightmapper-wasm`; AD-008 is the
proposed toolchain-pin decision this change accepts. AD-009 (separate asset)
and AD-010 (headless verification) remain Proposed and are not implemented
here.

## Goals / Non-Goals

**Goals:**

- Make the default build a reproducible, optimised release artifact without
  changing the single-file layout, the dist assembly or the public API.
- Make the toolchain pin enforceable locally and in CI.
- Give maintainers a debug build and a one-command artifact size/digest
  report.
- Bring the build documentation and ADR/roadmap status in line with the
  implemented state.

**Non-Goals:**

- Emitting a separate `.wasm` or changing the loader (AD-009, change 5).
- Adding the smoke/golden/package-consumer suite (AD-010, change 7).
- Changing the C shim, the exported surface or any upstream header behavior.
- Changing npm publishing mechanics, Node support or worker support.

## Decisions

### 1. Select Release at the package-script layer

`configure:wasm` passes `-DCMAKE_BUILD_TYPE=Release` to `build/wasm` rather
than making Release a hard default inside `CMakeLists.txt`. The scripts are
the supported entry point, and keeping the top-level project neutral lets a
consumer or a native verification configure the same source with its own
build type. `build:wasm` keeps `--config Release` (harmless on single-config
generators and correct for multi-config ones).

Alternative considered: default `CMAKE_BUILD_TYPE` in `CMakeLists.txt`.
Rejected because it silently overrides a toolchain's own default and makes the
debug path depend on remembering to pass `-DCMAKE_BUILD_TYPE=Debug`.

### 2. Release flags: `-O3`, `NDEBUG`, and conditional LTO

CMake's Release configuration supplies `-O3 -DNDEBUG` to the C compile and
link lines. Add `-flto` through an explicit `LM_WASM_LTO` option (default ON)
so the release link is reproducible and the fallback is a single configure
flag. F4 already measured `-O3 -flto` at 44,279 bytes; the implementation
must still verify that the LTO artifact instantiates, runs the probes and
loads in the browser. If it does not, the option defaults to OFF and the
measured reason and size are recorded.

Alternative considered: `-Os`. Rejected because the measured target is a
small binary and `-O3` already reaches ~44 KB; `-Os` would trade runtime for
little additional gain without evidence.

### 3. Debug flavour in a separate build directory

Add `configure:wasm:debug` (`build/wasm-debug`, `CMAKE_BUILD_TYPE=Debug`) and
`build:wasm:debug`, plus a `rebuild:wasm:debug` convenience script. Debug
keeps assertions enabled and never touches `build/wasm`, so a release build
used by `build-dist` cannot be clobbered by a debug rebuild. The existing
readback probe already has a `-DNDEBUG` flavour; the debug build is the
complement and is documented rather than shipped.

Alternative considered: switching the build type in the same directory.
Rejected because it forces a full reconfigure/recompile and makes it easy to
assemble `dist/` from the wrong flavour.

### 4. Enforce the exact Emscripten version before CMake runs

Add `scripts/check-emsdk.mjs`: run `emcc --version`, parse the version from
the first line, compare it to `3.1.64` exactly, print expected/actual and exit
non-zero on mismatch. Wire it as `check:emsdk` and as `preconfigure:wasm` /
`prebuild:wasm` lifecycle hooks so every local and CI invocation of the
supported scripts is covered before a build directory is written. CI changes
`setup-emsdk` from `latest` to `3.1.64`.

This is deliberately stricter than AD-008's current "major/minor" wording:
the pin is an exact release, and a patch difference can change generated
glue or wasm bytes. The ADR is updated from Proposed to Accepted in this
change with the exact-check wording; a future toolchain upgrade is still an
explicit OpenSpec change.

Alternative considered: check inside CMake. Rejected because parsing
`emcc --version` in Node is simpler, testable with a stub, and fails before
CMake creates a partial build directory.

### 5. Report the embedded wasm, not a non-existent file

Add `scripts/report-artifact.mjs`. It reads the generated single-file `.mjs`,
extracts the `data:application/octet-stream;base64,...` payload, decodes it,
and prints the wasm byte count, wasm SHA-256, `.mjs` byte count and (when
present) `dist/index.js` byte count. It never writes a `.wasm`. Wire it as
`report:artifact` and as `postbuild:wasm`, so the release build always reports
its digest and the CI log records it. The pre-change 98,112-byte baseline and
the post-change measurement go into the change notes and the roadmap.

Alternative considered: report the `.mjs` hash only. Rejected because the
embedded binary is the meaningful artifact and the digest must be comparable
to a future separate-asset build.

### 6. Drop the redundant WebGL2 flag and canonicalise the submodule URL

Remove `-sUSE_WEBGL2=1`: Emscripten 3.1.64 treats it as deprecated and it only
sets `MAX_WEBGL_VERSION=2`, which is already explicit. Keep
`MIN_WEBGL_VERSION=2`/`MAX_WEBGL_VERSION=2` as the single selector. Change
`.gitmodules` to `https://github.com/mode777/lightmapper.git` (no userinfo)
and run `git submodule sync`; the pinned commit does not move.

Alternative considered: leave the URL alone. Rejected because it is part of
F13 and the canonical HTTPS URL is what a fresh clone and CI should use.

### 7. Documentation and ADR footprint

Update `docs/decisions.md`: AD-008 Proposed → Accepted with the exact-version
enforcement and the "toolchain upgrade is a new change" consequence; no new
ADR and no superseded decision. Update `docs/wasm-improvements.md`: mark F4
fixed, mark F13 partially fixed (CI pin and URL done; upstream tag/changelog
remains open), set roadmap row 4 to Implemented with the measured sizes, and
update the current-state bullets. Update `README.md` and `WASM_SETUP.md` to
make release the documented default, describe the debug flavour and the
report command, and remove the manual Release workaround. AD-002, AD-003,
AD-005 and AD-006 are preserved.

## Risks / Trade-offs

- **LTO may fail to build or load under 3.1.64** → keep `LM_WASM_LTO` as an
  option, run the shader/readback probes and a browser load before adopting,
  and fall back to `-O3` without LTO with the measured reason recorded.
- **`-O3` could change floating-point results** → wasm float semantics are
  deterministic; the existing shader/readback probes and the demo bake run on
  the release artifact, and the later golden suite (AD-010) will pin hashes.
- **Exact-version enforcement blocks newer emsdk users** → the failure message
  names the expected version and points at AD-008; upgrading is an explicit
  change that updates the ADR and goldens.
- **The report extraction depends on Emscripten's data-URI format** → the
  script fails loudly if no payload is found, runs in CI on every build, and
  the format is pinned by the toolchain version.
- **Debug and release builds can be confused** → separate directories and
  distinct npm scripts; `build-dist` continues to read `build/wasm`.
- **Removing `-sUSE_WEBGL2=1` could change context selection** → the flag is
  redundant with `MAX_WEBGL_VERSION=2`; verify the artifact still requests
  WebGL2 in the headless smoke bake.
- **Submodule URL change may surprise SSH-based contributors** → HTTPS is the
  canonical public URL and still supports credential-based push.

## Verification Strategy

All rendering, packaging and loading checks run headlessly; no physical GPU is
required.

1. With Emscripten 3.1.64, run `npm run configure:wasm`, `npm run build:wasm`
   and capture the `report:artifact` output. Rebuild once and confirm the wasm
   SHA-256 is identical.
2. Run `npm run test:shader` and `npm run test:readback` against the release
   artifact using `chrome-headless-shell` with ANGLE SwiftShader.
3. Run `npm run build:dist` and `npm run typecheck`; import `dist/index.js` in
   a headless Chrome scratch page, create the module and run a tiny bake.
4. Run the asymmetric browser demo bake in headless Chrome/ANGLE SwiftShader
   and confirm finite, non-uniform output.
5. Build the debug flavour, confirm `build/wasm-debug` exists and the release
   `.mjs` hash is unchanged.
6. Exercise the version check with a stub `emcc` that reports a different
   version and confirm the build fails before compiling.
7. Inspect the CI workflow for the 3.1.64 pin and run the same commands
   locally; run `npm pack --dry-run` to confirm the `dist/` payload is
   unchanged.
8. Run `npx @fission-ai/openspec@latest validate --all --strict`.
