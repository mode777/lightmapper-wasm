# Tasks

All tasks are owned by this repository. There are no `[lightmapper]` tasks and
no submodule bump: the C shim, the upstream header and the exported `lm*`
surface are untouched.

## 1. Separate-asset build flavour

- [x] 1.1 Add the `LM_WASM_SINGLE_FILE` CMake option (default OFF) to
  `wasm/CMakeLists.txt`, dropping `-sSINGLE_FILE=1` from the default link
  flags, and verify `npm run rebuild:wasm` emits both
  `build/wasm/wasm/lightmapper_wasm.mjs` and
  `build/wasm/wasm/lightmapper_wasm.wasm` with no base64 data URI in the glue
- [x] 1.2 Add `configure:wasm:single`/`build:wasm:single` scripts (with the
  `check:emsdk` pre-hooks) configuring `build/wasm-single` with
  `-DLM_WASM_SINGLE_FILE=ON`, and verify the flavour build emits exactly one
  `.mjs` with the wasm embedded and no `.wasm`
- [x] 1.3 Update `scripts/report-artifact.mjs` to digest the emitted
  `lightmapper_wasm.wasm` directly (size, SHA-256, glue `.mjs` size) and
  report the single flavour's embedded size when `build/wasm-single` exists,
  and verify two clean rebuilds report the same digest

## 2. Loader asset resolution and dist assembly

- [x] 2.1 Implement asset resolution in `src/index.js`: the
  `WASM_ASSET_PATH` constant, the precedence chain (explicit
  `wasmModuleOptions.wasmBinary` → `options.wasmBinary` → `options.locateWasm`
  → `new URL(WASM_ASSET_PATH, import.meta.url)`), `fetch` +
  `WebAssembly.instantiateStreaming` with an ArrayBuffer fallback, non-OK/fetch
  failures rejecting with the URL named, resolution skipped for
  `moduleFactory` users and for the single-file marker, all after the
  capability probe; verify `npm run typecheck` passes
- [x] 2.2 Extend `types/index.d.ts` with `wasmBinary` and `locateWasm` options
  and JSDoc stating the precedence, and verify `npm run typecheck` passes with
  the new options exercised
- [x] 2.3 Rewrite `scripts/build-dist.mjs` with an `assertReplace` helper
  (fails on zero or multiple matches): assemble `dist/index.js` (inlined glue,
  `WASM_ASSET_PATH` rewritten to `./lightmapper.wasm`), copy the asset to
  `dist/lightmapper.wasm`, assemble `dist/single.js` + `dist/single.d.ts` with
  the `_singleFileFactory` marker, copy `dist/index.d.ts`, and verify
  `npm run build:dist` fails with a named replacement when fed a mismatched
  input
- [x] 2.4 Add `test/dist-layout.mjs` wired as `npm run test:dist`, asserting
  the assembled layout: entry references `./lightmapper.wasm` and embeds no
  base64 payload, `dist/lightmapper.wasm` is byte-identical to the emitted
  asset, `dist/single.js` embeds the payload, declarations present; verify the
  script passes after `build:wasm`, `build:wasm:single` and `build:dist`

## 3. Loader behavior verification (headless, no GPU)

- [x] 3.1 Add `test/loader-asset.mjs` wired as `npm run test:loader` using the
  `CHROME_SHELL_PATH` + ANGLE SwiftShader pattern over HTTP-served `dist/`:
  initialize the packaged entry with a real WebGL2 context and assert exactly
  one request fetches `lightmapper.wasm`, initialization with pre-fetched
  `wasmBinary` performs zero asset requests, and a `locateWasm` pointing at a
  missing path rejects with that location named
- [x] 3.2 Verify the single-file entry end-to-end in the same harness:
  importing `dist/single.js` initializes and bakes without any `.wasm` request

## 4. Package surface and consumer

- [x] 4.1 Add the `./single` export subpath (`dist/single.js` +
  `dist/single.d.ts`) to `package.json` while keeping the default entry,
  ESM-only shape and zero runtime dependencies, and verify `npm run pack`
  produces a tarball containing both entries, the asset and the declarations
- [x] 4.2 Add `test/consumer-vite.mjs` wired as `npm run test:consumer`: pack
  the tarball, install it into a scratch Vite project (dev-only dependency),
  build, and assert the `.wasm` is emitted into the build output beside the
  bundled entry; verify the script passes from a clean cache

## 5. Documentation and planning records

- [x] 5.1 Update `README.md`, `WASM_SETUP.md` and the `LIGHTMAPPER.md` loading
  section to describe both flavours accurately (default entry +
  `lightmapper.wasm`, `./single` entry, `wasmBinary`/`locateWasm` precedence,
  HTTP-serving note for the default entry), and verify every documented
  command runs as written against the built artifacts
- [x] 5.2 Move AD-009 to Accepted in `docs/decisions.md` with the `./single`
  entry added to its consequences, and update `docs/wasm-improvements.md`:
  roadmap row 5 status, findings F5 and the packaging half of F12, and the
  §5.2/§5.3 loader description; verify both files describe the implemented
  state with no stale artifact claims

## 6. Integration verification

- [x] 6.1 Run the full local sequence from clean build directories —
  `rebuild:wasm`, `build:wasm:single`, `build:dist`, `typecheck`,
  `test:dist`, `test:loader`, `test:consumer`, `test:shader`, `test:readback`
  — and verify every step exits zero with the artifact sizes and digest
  recorded in the change notes
- [x] 6.2 Verify the browser demo still initializes and bakes against the new
  default entry over `npm run serve:demo` (asset fetched from
  `dist/lightmapper.wasm`), confirming no demo changes were required or noting
  the ones made

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result (main specs absorb the three capability deltas).
