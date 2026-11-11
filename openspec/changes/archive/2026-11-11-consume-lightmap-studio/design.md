# Design

## Context

See `proposal.md` for motivation and `specs/` for the behavior contract.

Current state that shapes the approach:

- `site/package.json` declares `lightmap-studio: file:../studio` and
  `lightmapper-wasm: file:..`; the site lockfile marks the studio as a link and
  installs `xatlas-wasm` from the registry (AD-015, AD-021).
- The local `studio/` package is a frozen staging mirror with private version
  `0.0.0`, its own lockfile and `lightmapper-wasm: file:..` (AD-025).
- `lightmap-studio@0.1.0` is published with `lightmapper-wasm: ^0.2.0` and
  `xatlas-wasm: ^0.2.0`. Its `dist/index.js` (SHA-256
  `5c8ae4f48001496cdc70a64a4db1f252d19843e2b7adf7daf5b0555aa6d93331`) and
  `dist/index.d.ts` (SHA-256
  `febbbb4f778e820467300974981313657774d879ffbb782da1e3603f55ca6b21`) are
  byte-identical to the current local `studio/dist/` build, and every export
  the site imports exists in the published declarations.
- npm deduplicates the studio's `lightmapper-wasm@^0.2.0` requirement against
  the site's `file:..` link while the local root version is `0.2.0`. A
  `package-lock.json`-only probe with a stubbed `lightmapper-wasm@0.3.0` shows
  that npm instead installs a nested registry `lightmapper-wasm@0.2.0` once the
  local version leaves the range.
- CI builds the root `dist`, builds and tests the studio, then the site job
  builds the studio again and installs the site. `scripts/verify-remote.sh`
  does the same on the verification box.

## Goals / Non-Goals

**Goals:**

- One canonical home for studio code: `mode777/lightmap-studio`.
- The showcase still proves the published package works with the tested local
  `dist` artifact, in CI and headless.
- Deterministic dependency resolution: one studio package from the registry,
  exactly one `lightmapper-wasm` copy.
- No user-visible behavior, scene output or thumbnail change.

**Non-Goals:**

- Any change inside `mode777/lightmap-studio` or a new studio release.
- Publishing a new `lightmapper-wasm` version.
- Reworking the site build, the loader, the bake harness or the display.
- Moving the site-local scene, gallery or three.js code into the studio.
- Replacing the handwritten types or adding worker support (see
  `docs/wasm-improvements.md`, still open).

## Decisions

### D1 — Delete `studio/` instead of keeping a reference copy

AD-021 defines stage 3 as removing the local copy; AD-025 already made the
standalone repository canonical. A retained copy would need its own lockfile,
build and test wiring and would drift from `0.1.0`. History is preserved by the
subtree split in the standalone repository, so deleting the directory loses no
code. Alternative: keep `studio/` as documentation — rejected, because a second
package in the tree is exactly the drift this change removes.

### D2 — Pin the studio range to `^0.1.0` and override its wrapper dependency

`site/package.json` gains `"lightmap-studio": "^0.1.0"` and keeps
`"lightmapper-wasm": "file:.."`. It also gains:

```json
"overrides": { "lightmap-studio": { "lightmapper-wasm": "$lightmapper-wasm" } }
```

This makes the transitive `lightmapper-wasm` requirement resolve to the site's
local link regardless of the root version, so the showcase keeps exercising the
tested `dist` artifact (AD-015) and never bundles a second wrapper. Probes
confirm the override resolves to the single local link even when the stub local
version (`0.3.0`) is outside the published `^0.2.0` range. Alternatives:
relying on npm deduplication (works today, silently nests a registry copy on a
root version bump), adding a second explicit `lightmapper-wasm` dependency
(does not change the studio's range), and passing wasm URLs from the site
(avoids the asset but not the duplicate glue copy). The `$name` override syntax
requires npm ≥ 8.3; CI uses Node 24 and the toolbox ships npm 11.

### D3 — Guard the dependency shape with a site test

Add `site/test/studio-dependency.test.ts`, picked up by the existing vitest
include (`test/**/*.test.ts`) and therefore by `npm test --prefix site`. It
reads `site/package.json` and `site/package-lock.json` and asserts: the studio
spec is a `^0.1.0` range, the resolved studio entry is a registry tarball (not a
link), exactly one `node_modules/lightmapper-wasm` entry exists and it links to
`..`, and no nested `lightmap-studio/node_modules/lightmapper-wasm` entry
exists. It fails with the offending path or version. Alternative: a shell check
in CI — rejected because it would not run locally and would need duplication in
`verify:remote.sh`.

### D4 — Keep the site's local wrapper link

Only the studio moves to the registry. `lightmapper-wasm: file:..` is the
packaged-consumer check required by AD-015: the site must build against the
tested `dist`, not the published wrapper. The studio's registry dependency and
the local link are reconciled by D2.

### D5 — Keep the Vite configuration, update its rationale

`site/vite.config.ts` keeps `optimizeDeps.exclude` for all three packages (their
entries use `new URL(..., import.meta.url)` and must stay unoptimized so Vite
emits the wasm assets) and keeps `server.fs.allow: [".", ".."]` for the local
wrapper link. Only the comment changes: the studio is now an ordinary registry
dependency, while the wrapper remains a link. `site/scripts/check-build.mjs`
needs no change and remains the proof that exactly one hashed
`lightmapper.wasm` and `xatlas.wasm` are emitted and referenced.

### D6 — Move studio gates to the standalone repository, keep site coverage

CI (`build-and-publish`, `site`) and `scripts/verify-remote.sh` lose the studio
install/build/typecheck/unit/consumer/headless steps. The studio's own CI and
tag gate own those paths (AD-026). The site's harness, smoke and production
build suites still exercise the installed package end to end, so this
repository keeps integration coverage of the consumed artifact.

TypeScript no longer typechecks the studio source here; the site's `tsc
--noEmit` uses the published declarations, which is a stronger check of what
consumers actually see.

### D7 — Repurpose the root pack test

`test/studio-pack.test.mjs` becomes `test/pack-boundary.test.mjs` (script
`test:pack`). It keeps the root export and zero-runtime-dependency assertions,
asserts the tarball excludes both `studio/` and `site/`, and drops the
`studio/`-specific existence checks that are now vacuous. Alternative: delete
the test — rejected, because the root tarball boundary is still worth guarding.

### D8 — Keep the consumed studio capabilities

`openspec/specs/lightmap-studio/` and `openspec/specs/studio-loader/` describe
the API and loader contract the site consumes and its suites exercise. They stay
as the consumed contract; `studio-package` and `showcase-site` carry the
dependency and consumption deltas. No requirement in those two specs changes.

### D9 — Document the consume state and add AD-027

AD-027 records that the showcase consumes the published studio and that the
local copy is removed; AD-021's stage 3 and AD-025's handoff are marked
complete rather than superseded. `AGENTS.md`, `README.md`, `WASM_SETUP.md`,
`site/README.md`, `openspec/config.yaml` and `docs/wasm-improvements.md`
(row 16) are updated in the same change so no document describes
`file:../studio`, `build:studio` or a frozen local copy.

## Risks / Trade-offs

- [Root version bump silently nests a registry wrapper] → the override in D2
  forces the local link, and the D3 test fails on any second copy.
- [The override is dropped during a lockfile regeneration] → the committed
  lockfile plus the D3 test make the shape explicit; CI runs the test before
  the site build.
- [Registry availability in CI and on the verification box] → the site already
  installs `three`, `xatlas-wasm` and tooling from the registry, and the
  lockfile pins the tarball integrity; no new network dependency pattern.
- [Loss of local ability to patch the studio ad hoc] → intended by AD-021;
  studio changes go through the standalone repository and arrive as a version
  bump, which also forces a fresh verification run.
- [Deleting `studio/` breaks an untracked local workflow] → documented in the
  commit and `WASM_SETUP.md`; the code is recoverable from git history and the
  standalone repository.
- [Silent visual drift between local and published builds] → verified
  byte-identical entries before switching, and the harness/smoke suites plus
  the production build check run unchanged after the switch.

## Migration Plan

1. Land the site dependency change, lockfile and dependency test together with
   the `studio/` deletion and the script/CI cleanup, so no commit has a
   half-migrated tree.
2. Update docs and the ADR log in the same change.
3. Rollback: restore `studio/` and `file:../studio` from the previous commit;
   no published artifact or consumer contract changes, so rollback is a plain
   revert.

## Verification

No physical GPU is required: headless Chrome with ANGLE SwiftShader
(`CHROME_SHELL_PATH`) covers everything.

- `npm ci --prefix site`, `npm test --prefix site` (includes the new
  dependency test), `npm run check --prefix site`, `npm run test:harness
  --prefix site`, `npm run test:smoke --prefix site`,
  `SITE_BASE=/lightmapper-wasm/ npm run build --prefix site` and
  `npm run build:check --prefix site`.
- `npm test`, `npm run test:dist`, `npm run test:loader`,
  `npm run test:consumer`, `npm run test:pack` and `npm run typecheck` at the
  root.
- `npm run verify:remote`, which now installs the registry studio and skips
  every `--prefix studio` command.
- Confirm the checked-in thumbnails and `PREVIEW_VERSION` are unchanged (no
  scene source changes) and the build check still finds exactly one hashed
  `lightmapper.wasm` and `xatlas.wasm`.
