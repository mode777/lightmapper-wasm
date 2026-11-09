# Tasks

## 1. Release configuration (this repository)

- [x] 1.1 Pass `-DCMAKE_BUILD_TYPE=Release` from `configure:wasm` and keep `build:wasm` building `build/wasm`. Verify: the configure log reports a Release configuration and the build compiles with `-O3 -DNDEBUG`.
- [x] 1.2 Add an `LM_WASM_LTO` CMake option (default ON) and apply `-flto` to the release compile and link. Verify: the LTO artifact builds, instantiates and passes the shader/readback probes; if it does not, set the default OFF and record the measured reason.
- [x] 1.3 Remove the deprecated `-sUSE_WEBGL2=1` link flag and keep `MIN_WEBGL_VERSION=2`/`MAX_WEBGL_VERSION=2` as the only selector. Verify: the link line contains no `USE_WEBGL2` and the module still requests a WebGL2 context.
- [x] 1.4 Add `configure:wasm:debug`, `build:wasm:debug` and `rebuild:wasm:debug` using `build/wasm-debug` with `CMAKE_BUILD_TYPE=Debug`. Verify: `build/wasm-debug` is created without `NDEBUG`, and the release `build/wasm/wasm/lightmapper_wasm.mjs` hash is unchanged after a debug build.
- [x] 1.5 Measure the optimised artifact against the 98,112-byte embedded-wasm baseline and record the result in the change notes. Verify: the reported wasm size is smaller and the `.mjs`/`dist/index.js` sizes are recorded too.
- [x] 1.6 Update `README.md` and `WASM_SETUP.md` build sections: release is the default, the debug commands and directories are documented, and the manual `-DCMAKE_BUILD_TYPE=Release` workaround is removed. Verify: the documented commands run as written and no text still calls the default artifact unoptimised.

## 2. Toolchain pin (this repository)

- [x] 2.1 Add `scripts/check-emsdk.mjs` (parse `emcc --version`, require exactly 3.1.64, print expected/actual) and wire it as `check:emsdk` plus `preconfigure:wasm`/`prebuild:wasm`. Verify: 3.1.64 proceeds, and a stub `emcc` reporting another version exits non-zero before CMake writes a build directory.
- [x] 2.2 Pin `setup-emsdk` in `.github/workflows/publish.yml` to 3.1.64 and run the check in the workflow. Verify: the workflow no longer uses `latest` and the same check runs locally and in CI.
- [x] 2.3 Update the toolchain notes in `README.md` and `WASM_SETUP.md` that currently say CI installs `latest`. Verify: no documentation claims an unpinned CI toolchain.

## 3. Artifact report (this repository)

- [x] 3.1 Add `scripts/report-artifact.mjs` that extracts the base64 wasm from the single-file `.mjs`, decodes it and prints wasm byte size, wasm SHA-256, `.mjs` size and `dist/index.js` size when present. Verify: the report prints the expected values for the current artifact and fails loudly when no data-URI payload is found.
- [x] 3.2 Wire the report as `report:artifact` and `postbuild:wasm`, and add it to the CI build log. Verify: `npm run build:wasm` prints the report automatically and CI records the same output.
- [x] 3.3 Rebuild twice with 3.1.64 and compare the reported wasm digest; record the baseline and release measurements in the change notes. Verify: both rebuilds report the same SHA-256 and the notes contain the before/after sizes.
- [x] 3.4 Document the report command and its output in `WASM_SETUP.md`. Verify: the documented command runs and the sample output matches the actual format.

## 4. Submodule source (this repository)

- [x] 4.1 Change `.gitmodules` to `https://github.com/mode777/lightmapper.git` (remove the userinfo), run `git submodule sync` and confirm the pinned commit does not move. Verify: `git submodule status` reports the same commit and a fresh `git submodule update --init --recursive` works over HTTPS.

## 5. Decisions and roadmap (this repository)

- [x] 5.1 Update `docs/decisions.md`: move AD-008 from Proposed to Accepted and record the exact 3.1.64 enforcement and the toolchain-upgrade consequence. Verify: the index row and section agree, and no other ADR is rewritten or superseded.
- [x] 5.2 Update `docs/wasm-improvements.md`: mark F4 fixed, mark F13 partially fixed (CI pin and submodule URL done; upstream tag/changelog open), set roadmap row 4 to Implemented with the measured sizes and report command, and refresh the current-state bullets. Verify: no F4 or F13 text still describes the build as unoptimised or CI as unpinned.
- [x] 5.3 Run `npx @fission-ai/openspec@latest validate --all --strict`. Verify: zero errors and zero warnings.

## 6. Integration verification (headless)

- [x] 6.1 Build with Emscripten 3.1.64 and run `npm run test:shader` and `npm run test:readback` with `CHROME_SHELL_PATH` and ANGLE SwiftShader. Verify: the shader probe passes 64/64 texels and every readback scenario passes on the release artifact.
- [x] 6.2 Run `npm run build:dist` and `npm run typecheck`, import the built `dist/index.js` in a headless Chrome scratch page, create the module and run a tiny bake. Verify: the packaged entry loads, the capability probe passes and the bake produces finite output.
- [x] 6.3 Run the browser demo's asymmetric-scene bake in headless Chrome/ANGLE SwiftShader. Verify: the bake completes without WebGL errors, output is finite and non-uniform, and a capture is attached to the change notes.
- [x] 6.4 Run `npm pack --dry-run` and inspect the file list. Verify: the `dist/` payload is the same as the current release line and contains no separate `.wasm`.
- [x] 6.5 From a clean checkout with the submodule initialized, run `npm ci`, the release configure/build, `build:dist`, `typecheck`, both probes, the debug build and the headless demo bake. Verify: every command exits 0 and the debug build leaves the release artifact unchanged.
- [x] 6.6 Re-run `npx @fission-ai/openspec@latest validate --all --strict` after the final documentation updates. Verify: zero errors and zero warnings.

## Workflow follow-up

- Review the completed implementation and evidence with the maintainer.
- Archive the change after approval and verify the archived `wasm-build-pipeline` requirements.
