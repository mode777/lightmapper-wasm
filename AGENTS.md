# AGENTS.md — lightmapper-wasm

Browser-facing WebAssembly product around ands/lightmapper, a single-header
C/C++ lightmap-baking library. This repository owns the Emscripten CMake
target, the C shim, the low-level JavaScript API, the WebGL2 context layer,
the browser demo, the public showcase under `site/`, the npm package, the
build-dist step and the release workflow.

The C library is the upstream submodule `thirdparty/lightmapper`
([`mode777/lightmapper`](https://github.com/mode777/lightmapper)). C-side
changes are proposed and implemented there and are marked `[lightmapper]` in
this repository.

## Main-only workflow (non-negotiable)

**Always stay on `Main`.** This repository is developed directly on the `Main`
branch. Feature branches, pull requests and git worktrees are not part of the
workflow unless the user explicitly asks for one.

- Do all work in the repository's primary checkout with `Main` checked out.
  Do not create or use `git worktree` checkouts.
- **Do not use OpenCode's worktree tools for this repository.** Do not call
  `worktree_create`, do not start or continue a session in a worktree, and do
  not create a new worktree through the client. If a session unexpectedly
  starts in one, move the session to the primary checkout before doing any
  work, consolidate any changes onto `Main`, and remove the worktree.
- If work exists on a side branch or in a worktree, consolidate it onto `Main`
  first, then remove the worktree or branch. Never leave important changes
  uncommitted or stranded outside `Main`.
- Commit to `Main` and push when the change is verified. `origin/Main` is the
  source of truth; fetch before pushing and keep pushes fast-forward.

## OpenSpec workflow (non-negotiable)

- All functional work happens as OpenSpec changes under
  `openspec/changes/<name>/` (`proposal.md`, `specs/`, `design.md`,
  `tasks.md`). Do not implement features, loader changes, packaging changes or
  shader fixes ad hoc.
- Workflow: explore → propose → review → apply → archive. OpenCode commands
  live in `.opencode/commands/` (`/opsx-*`) and skills in
  `.opencode/skills/`.
- Validate before finishing any planning change:
  `npx @fission-ai/openspec@latest validate --all --strict`.
- Read `openspec/config.yaml` first: it defines the project context, artifact
  rules, cross-repo ownership and capability paths.

## Planning baseline

- `docs/wasm-improvements.md` — findings F1–F14 and the proposed change
  sequence. Update its status table when a roadmap item lands.
- `docs/decisions.md` — ADR log. New or changed decisions get a new sequential
  ID in the same change; never silently rewrite an accepted ADR.
- `openspec/specs/wasm-build-pipeline/` — Emscripten build and dist assembly.
- `openspec/specs/wasm-loader/` — initialization, context probing, module
  factory and strict binding.
- `openspec/specs/npm-package/` — published entries, files and artifact
  layout.
- `openspec/specs/c-library-port/` — the upstream WebGL2 contract consumed by
  this package.
- `site/README.md` — the showcase consumer, scene/atlas contract, studio and
  display boundaries, thumbnails and deployment.
- `studio/README.md` — the standalone `lightmap-studio` package API, lighting
  model, presets and loader contract; the local `studio/` copy is a frozen
  staging mirror until the consume stage.

## Verification before push

The full pipeline must be green before pushing to `Main`:

```bash
npm run verify:remote   # builds WASM with emsdk and runs the root, studio and site suites on the verification box
```

Requires `SSH_HOST`, `SSH_USER`, `SSH_PASSWORD` in the environment and
`CHROME_SHELL_PATH` (or the default chrome-headless-shell location). CI runs
the root tests, the golden bake, the studio unit/consumer/headless suites and
the site typecheck/tests/harness/smoke on every push to `Main`.

## Repo quick facts

- WASM build needs Emscripten (`emcmake`/`emcc`); there is no local emsdk in
  the container — use `npm run verify:remote` or the build server.
- `thirdparty/lightmapper` is a submodule of the fork
  `mode777/lightmapper`, which carries the `__EMSCRIPTEN__` patches on top of
  upstream `ands/lightmapper`. Upstream master does **not** build for WASM —
  never "sync" the submodule to upstream master.
- Golden bake data lives in `test/golden/`; regenerate with
  `npm run verify:remote -- --update-golden` only when a deliberate behavior
  change alters the bake, and include the stats delta in the commit message.
- The showcase lives in `site/`, consumes the root package with
  `lightmapper-wasm: file:..` and is not part of the npm tarball. Use
  `npm ci --prefix site` once, then the site commands listed below. Scene source
  changes require recapturing the checked-in thumbnails; see `site/README.md`.

## Upstream C rule

- Do not hand-edit `thirdparty/lightmapper`. Changes to `lightmapper.h` are
  upstream `[lightmapper]` tasks.
- A change that needs a C fix includes both the upstream task and the
  submodule bump to the commit that contains it. Re-run the verification suite
  after the bump.
- The current submodule pin is the commit recorded by `git submodule status`.

## Build and test

Current build path (see `WASM_SETUP.md` for details):

```sh
npm ci
source /path/to/emsdk/emsdk_env.sh   # Emscripten 3.1.64, pinned
npm run configure:wasm               # Release build, separate .wasm asset
npm run build:wasm
npm run build:dist
npm run typecheck
```

Tests:

```sh
npm test              # Node smoke test
npm run test:bake     # headless Chrome golden bake against dist/
npm run test:shader   # GLES3 first-pass sampling
npm run test:readback # readback state handling
npm run test:dist     # assembled dist layout
npm run test:loader   # loader asset-resolution scenarios
npm run test:consumer # packaged consumer build (Vite)

# Showcase (site/) — requires CHROME_SHELL_PATH for the browser suites
npm ci --prefix site
npm run check --prefix site
npm test --prefix site
npm run test:harness --prefix site
npm run test:smoke --prefix site
SITE_BASE=/lightmapper-wasm/ npm run build --prefix site
SITE_BASE=/lightmapper-wasm/ npm run build:check --prefix site
```

The default entry ships `dist/index.js` plus a separate
`dist/lightmapper.wasm`; the `lightmapper-wasm/single` entry embeds the wasm
as a base64 payload. Remaining gaps are tracked in
`docs/wasm-improvements.md`; do not silently fix them outside an OpenSpec
change. If a change touches the loader or packaging, verify that the actual
artifact layout matches the docs.

## Project constraints

- WebGL2 / OpenGL ES 3.0 only; no WebGL1 fallback.
- Require `EXT_color_buffer_float` for RGBA32F render targets and float
  readback; fail clearly when it is absent.
- Keep `createLightmapperModule(options)` as the public entry, with the
  capability probe and strict context binding unless a proposal explicitly
  changes them.
- Keep the package ESM-only, browser-first and free of runtime dependencies.
- Keep the showcase a separate consumer: `site/` is not published, its
  dependencies stay in `site/package.json`, and it consumes the tested `dist`
  artifact rather than rebuilding wasm or installing from the registry.
- Do not claim Node rendering support without a real WebGL2 implementation.
- The reference wasm build is single-threaded: no pthreads, shared memory or
  SIMD.
- The current artifact is main-thread browser only; worker support is a
  proposed change, not an existing feature.

## Verification

- Use headless Chrome with ANGLE SwiftShader for WebGL2 work when available.
- A deterministic bake with an asymmetric scene is the reference check for
  shader sampling (the upstream first-pass defect is invisible in a symmetric
  scene).
- Test the packaged entry from `dist/`, not only the source modules.
- Run the OpenSpec validator before reporting a planning change complete.

## Git

- Work directly on `Main`; do not create feature branches, pull requests or
  worktrees unless asked (see the main-only workflow above).
- Concise imperative commit subjects.
- Never commit `build/`, `dist/`, `node_modules/`, secrets or generated caches.
