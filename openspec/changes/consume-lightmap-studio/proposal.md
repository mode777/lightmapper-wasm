# Proposal

## Why

Stage 2 published the engine-agnostic pipeline as `lightmap-studio@0.1.0` from
`mode777/lightmap-studio`, but this repository still carries a frozen `studio/`
copy and links it into the showcase with `file:../studio`. Two copies of the
same package must be kept in sync by hand, the root checkout grows a second
package with its own lockfile, and CI still builds and tests the staging copy
instead of the artifact consumers actually install. Stage 3 was explicitly
deferred by AD-021 and AD-025; this change completes it.

## What Changes

- **`[lightmapper-wasm]`** Delete the local `studio/` staging package (source,
  tests, scripts, lockfile and build output) and remove the root scripts that
  build or test it (`build:studio`, `test:studio`).
- **`[lightmapper-wasm]`** Switch the showcase to the registry package:
  `site/package.json` depends on `lightmap-studio: ^0.1.0` instead of
  `file:../studio`, and the site lockfile is regenerated against the npm
  tarball.
- **`[lightmapper-wasm]`** Keep the showcase a consumer of the tested local
  `lightmapper-wasm` artifact. The published studio depends on
  `lightmapper-wasm@^0.2.0`; the site pins that transitive dependency to its own
  `file:..` link with an npm override so the site never bundles a second
  registry copy of the wrapper, and a site test asserts exactly one copy.
- **`[lightmapper-wasm]`** Add a site dependency test that fails when
  `lightmap-studio` resolves from a local link, when the version leaves
  `^0.1.0`, or when more than one `lightmapper-wasm` copy appears in the site
  lockfile.
- **`[lightmapper-wasm]`** Remove the studio steps from CI
  (`.github/workflows/publish.yml`) and `scripts/verify-remote.sh`; the site
  installs the published package and the standalone repository owns its own
  build, unit, consumer and headless gates.
- **`[lightmapper-wasm]`** Repurpose the root pack boundary test for the
  post-removal layout: the root tarball has no runtime dependencies and no
  studio or site files.
- **`[lightmapper-wasm]`** Update `AGENTS.md`, `README.md`, `WASM_SETUP.md`,
  `site/README.md`, `openspec/config.yaml`, `docs/decisions.md` (new AD-027)
  and `docs/wasm-improvements.md` (row 16 implemented) so no document describes
  a local studio copy or a `file:../studio` link.

No behavior of the studio, the lightmapper wasm artifact, the loader or the
seven showcase scenarios changes. The published `lightmap-studio@0.1.0`
`dist/index.js` and `dist/index.d.ts` are byte-identical to the frozen local
build, so the showcase output and its captured thumbnails must not change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `showcase-site`: the studio consumer boundary changes from a local
  `file:../studio` checkout to the published `lightmap-studio@^0.1.0` package
  plus a single local `lightmapper-wasm` copy; the CI build order drops the
  studio build steps.
- `studio-package`: the staged-handoff requirement is replaced — the local
  copy is removed and the showcase consumes the registry package, so the two
  copies can no longer diverge.
- `npm-package`: the "private studio package is not published" requirement is
  restated for a repository without a studio package: the root tarball, exports
  and dependency graph still expose no studio or xatlas code.

## Impact

- **Affected code:** `site/package.json`, `site/package-lock.json`,
  `site/vite.config.ts` (comment only, if at all), new
  `site/test/studio-dependency.test.ts`; deletion of `studio/`; root
  `package.json` scripts; `test/studio-pack.test.mjs` rename/content;
  `.gitignore`.
- **CI and verification:** `.github/workflows/publish.yml`,
  `scripts/verify-remote.sh`. CI still builds the root `dist` artifact first;
  the site job installs `lightmap-studio` from npm and must not rebuild the
  studio.
- **Dependencies:** adds `lightmap-studio@^0.1.0` (registry) and an npm
  `overrides` entry to the site package only. The root `lightmapper-wasm`
  package keeps zero runtime dependencies and its existing entries.
- **Docs and planning:** `AGENTS.md`, `README.md`, `WASM_SETUP.md`,
  `site/README.md`, `openspec/config.yaml`, `docs/decisions.md` (AD-027),
  `docs/wasm-improvements.md`.
- **Out of scope:** changing anything in `mode777/lightmap-studio`, publishing
  a new `lightmap-studio` or `lightmapper-wasm` version, the lightmapper C
  header or submodule, WebGL2 capability probing or loader behavior, worker
  support, generated TypeScript declarations, the three.js display, scene
  sources and thumbnail recapture, and Node rendering support.
- **ADR footprint:** adds AD-027 (showcase consumes the published studio; the
  local copy is removed) and marks the stage-3 handoff in AD-021/AD-025
  complete. No accepted ADR is superseded or contradicted.
