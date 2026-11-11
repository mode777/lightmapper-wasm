# Design

## Context

Stage 1 (AD-021) left the studio as a private `studio/` package inside this
repository. The source is package-shaped, but the distribution is not:

- `studio/package.json` declares `lightmapper-wasm: file:..` and is `private`.
- `studio/scripts/headless-test.mjs` allows the parent repository root in the
  Vite `fs.allow` list and serves the local lightmapper package through
  `file:..`.
- `studio/test/consumer/` builds against `../../dist` instead of an installed
  package.
- `studio/README.md` documents a private stage and `file:../studio`.
- `npm view lightmapper-wasm@0.1.2` has no `lmSeed` and its `dist/index.js`
  predates the `_srand` export, although `src/index.js`, `types/index.d.ts`
  and `wasm/CMakeLists.txt` on `Main` contain them. The current local `dist/`
  was built before AD-024 as well.

The studio API is already specified by `lightmap-studio` and `studio-loader`;
this design changes distribution only. See `proposal.md` for motivation and
`specs/studio-package/spec.md` for the behavior contract.

## Goals / Non-Goals

**Goals:**

- Stand up `mode777/lightmap-studio` as the canonical, self-contained package
  repository.
- Publish `lightmap-studio@0.1.0` with the same API and no parent-checkout
  assumptions.
- Prove the published artifact with a packed-tarball consumer and a headless
  WebGL2 bake, with no physical GPU and no Emscripten toolchain.
- Leave this repository's showcase untouched until stage 3.

**Non-Goals:**

- Changing the studio API, lighting, presets, sampling or loader semantics.
- Moving the showcase, three.js display, scenes, thumbnails or HDRI assets.
- Deleting `studio/` or switching `site/` to the registry package.
- Redesigning the root `lightmapper-wasm` publish workflow.

## Decisions

### D1 - Extract with history instead of copying files

Run `git subtree split -P studio -b bootstrap/lightmap-studio` in this
repository and push that branch to the new repository's `Main`. The split
history becomes the package repository's history; a first bootstrap commit on
top removes the private/staging metadata and adds CI.

Alternatives considered:

- **Copy the directory into a fresh repository**: simplest, but loses the
  commit that introduced the pipeline and makes provenance harder to audit.
- **Republish from this repository's subdirectory**: rejected because stage 3
  needs an independently versioned package and independent CI, and because the
  parent workflow would keep coupling the studio to the wasm build.
- **`git filter-repo`**: more control than needed for a single subtree.

The split rewrites commit hashes. That is acceptable: the studio has no
released history and no tags. The parent repository keeps the original
commits.

### D2 - One public, unscoped ESM package

Publish as `lightmap-studio@0.1.0`; remove `private`; keep one root export
(`dist/index.js` with `dist/index.d.ts`), `engines.node >= 18`, the Unlicense
`LICENSE`, and the existing `files` whitelist. Add `repository`, `homepage`,
`bugs`, `keywords` and `publishConfig` metadata pointing at the new repository.
Keep `main`, `module`, `types` and `exports` consistent for bundlers.

Alternatives considered:

- **Scoped `@mode777/lightmap-studio`**: rejected because the sibling packages
  are unscoped and the unscoped name is unclaimed (registry returned `E404` at
  planning time). Availability SHALL be re-checked before repository creation;
  if it is taken, stop and re-plan rather than silently changing the package
  identity.
- **Dual ESM/CJS output**: rejected; the package is browser-first ESM
  (AD-006).
- **Additional entries or a `/three` export**: rejected by AD-021 and D7 of
  the isolate design.

### D3 - Registry dependencies and a required `lightmapper-wasm` release

The studio declares `lightmapper-wasm@^0.2.0` and `xatlas-wasm@^0.2.0` as
direct runtime dependencies, with no `file:`/workspace references. Direct
dependencies rather than peers: the studio owns asset resolution and lazy
loading (AD-023), and must work with a single install.

The bootstrap therefore depends on a `lightmapper-wasm@0.2.0` release that
ships `lmSeed` and the rebuilt wasm with `_srand` (AD-024). `0.2.0` is the
first version whose public wrapper and binary match the current `Main` source.
The root workflow is not changed; it is exercised with a release tag. A
packed-consumer check in the studio asserts that the installed dependency
exposes `lmSeed`, so a lower floor fails loudly instead of silently skipping
the seed reset in `studio.ts`.

Alternatives considered:

- **Depend on `lightmapper-wasm@^0.1.2`**: rejected; published `0.1.2` has no
  `lmSeed` and its binary has no `_srand`, which would break deterministic
  bakes (AD-024) in exactly the published configuration.
- **Bundle the wasm in `lightmap-studio`**: rejected; it duplicates the
  artifact, breaks the delegated default resolution and the two-binary loader
  contract (AD-023), and bloats the package.
- **Peer dependencies**: rejected; consumers would have to install two wasm
  packages before the studio works, which is the composition burden AD-021
  removed.
- **Exact pins**: rejected; patch fixes in the dependencies should flow to the
  studio without a republish.

three.js stays a showcase-only dependency (AD-021).

### D4 - Self-contained, artifact-based verification

The standalone pipeline is:

- `npm run build`: `tsc` into `dist/`.
- `npm test`: the existing `node:test` suites against `dist/`.
- `npm run test:consumer`: `npm pack`, install the tarball plus Vite into a
  scratch directory, build a consumer that imports `lightmap-studio`, assert
  both `lightmapper.wasm` and `xatlas.wasm` are emitted, and load the built
  page in headless Chrome.
- `npm run test:headless`: the existing SwiftShader bake page, served with the
  package root as Vite's only root. Remove `REPO_ROOT` and the parent
  `fs.allow` entry.
- `npm run test:pack`: list the tarball and assert the published layout.

CI runs on `ubuntu-latest` with Node 24 and pinned
`chrome-headless-shell@131.0.6778.264`. No Emscripten, CMake, submodule or
parent checkout is needed; a fresh-clone CI run is the proof that no path
escapes the package. Headless verification follows AD-010.

Alternatives considered:

- **Test the TypeScript sources with a loader**: rejected; the published
  `dist` artifact is the contract, and the existing suites already import it.
- **Keep the local `file:..` consumer**: rejected; it cannot detect broken
  registry resolution or a missing declared dependency.
- **Skip the headless suite until stage 3**: rejected; the published package
  is exactly where the wasm asset resolution and the seeded bake must be
  proven.

### D5 - Tag-gated release with provenance

Add `.github/workflows/ci.yml` and `.github/workflows/release.yml` to the new
repository. A release tag `v<version>` triggers the publish job only after the
same gates as CI. The job parses the tag, compares it with `package.json`, and
fails on a mismatch before running
`npm publish --provenance --access public`. Publish only from `Main`. Prefer
npm trusted publishing through GitHub OIDC (`id-token: write`), matching the
root repository's provenance setup; if the registry account still requires a
token, use the repository's `NPM_TOKEN` secret and keep the same gates.

The first release is `v0.1.0`. The root `lightmapper-wasm` release is `v0.2.0`
through its existing workflow, with the existing pinned Emscripten build.

Alternatives considered:

- **Publish on every `Main` push**: rejected; version churn and no reviewable
  release boundary.
- **Manual local `npm publish`**: rejected; no provenance and no reproducible
  gate.
- **Release automation framework**: deferred; a tag and a version check are
  enough for one package.

### D6 - Staged handoff and documentation

The new repository becomes canonical at bootstrap. This repository keeps
`studio/` as a frozen staging copy so the showcase keeps working until stage 3:

- `studio/README.md` gets a short canonical-repository note and keeps the API
  documentation as a mirror.
- No studio behavior changes during the staging window. If an urgent fix is
  needed, it lands in the standalone repository and the same change is mirrored
  mechanically into `studio/`; the copies never diverge in behavior.
- `site/package.json` keeps `lightmap-studio: file:../studio`. Stage 3 replaces
  it with the registry range.
- This repository's docs move from "stage 2 planned" to "stage 2 implemented;
  stage 3 planned".

`docs/decisions.md` gains:

- **AD-025 - The studio is published from its own repository.** Records the
  repository split, `lightmap-studio@0.1.0`, the frozen local copy and the
  stage-3 handoff. Implements AD-021; does not supersede it.
- **AD-026 - Studio releases are tag-gated and declare a dependency floor.**
  Records the version/tag guard, the CI gate and provenance, and the minimum
  `lightmapper-wasm` release that carries `lmSeed`/`_srand`.

`docs/wasm-improvements.md` marks row 15 implemented, keeps row 16 planned,
updates the repository split table to describe the published package, and
records the `lightmap-studio@0.1.0` release and the `lightmapper-wasm@0.2.0`
prerequisite. The OpenSpec project context is updated at archive time so it
describes the published package rather than a planned extraction.

### D7 - Rollback

No consumer depends on the registry package during bootstrap. Rollback before
the first publish is deleting the repository and the split branch. After
`0.1.0` is published, rollback is deprecating the version and repointing the
new repository; `site/` still uses the local copy, so the showcase is
unaffected. The root `0.2.0` release is additive and can be superseded by a
later patch if needed.

## Risks / Trade-offs

- **The root release is a hard prerequisite** -> Release `lightmapper-wasm@0.2.0`
  first and verify `lmSeed` and the rebuilt wasm in the published tarball
  before creating the studio repository or declaring its dependency range.
- **The unscoped npm name could be taken before publish** -> Re-check
  availability before repository creation; stop and re-plan instead of
  silently switching to a scope.
- **A test or Vite path still reaches the parent checkout** -> The standalone
  CI job has no parent; run the suites in a fresh clone and remove
  `REPO_ROOT`/parent `fs.allow` entries as part of the extraction.
- **Registry asset resolution behaves differently from the local link** -> The
  packed-consumer test installs the tarball, builds with Vite and loads the
  page headlessly; the documented `wasm` overrides (AD-023) remain the escape
  hatch.
- **Provenance or trusted-publisher setup fails at release time** -> Run the
  publish job with the tag and version guard first; a failed publish leaves no
  package, and the tag can be recreated after the OIDC/token setup is fixed.
- **The two studio copies drift** -> Freeze the local copy, mirror rather than
  fork urgent fixes, and keep stage 3 small; the next change removes the
  duplicate.
- **Pre-1.0 API churn** -> `0.1.0` is explicitly pre-1.0; the README and
  `README` versioning note say so, and changes follow the existing studio
  specification.
- **The root `0.2.0` artifact changes size but not behavior** -> Record the
  wasm/glue delta from the isolate change (44,136 -> 44,686 bytes wasm) and
  keep the golden bake as the regression gate.

## Migration Plan

1. **`[lightmapper-wasm]`** Verify `lmSeed`/`_srand` on `Main`, rebuild `dist/`
   with Emscripten 3.1.64, bump to `0.2.0`, run the full verification suite and
   the golden bake, then publish `v0.2.0` and confirm the registry artifact.
2. **`[lightmap-studio]`** Split `studio/` into a `bootstrap/lightmap-studio`
   branch, create the public repository and push `Main`.
3. **`[lightmap-studio]`** Remove private/staging metadata, set
   `lightmap-studio@0.1.0` with registry dependency ranges, regenerate the
   lockfile and build.
4. **`[lightmap-studio]`** Remove parent-checkout paths from the headless and
   consumer tests, add the packed-tarball consumer and layout tests, and add
   CI.
5. **`[lightmap-studio]`** Rewrite the README for a published package and
   verify every documented export.
6. **`[lightmap-studio]`** Tag `v0.1.0`; verify the published tarball,
   install it in a clean scratch project and run the headless bake.
7. **`[lightmapper-wasm]`** Add AD-025/AD-026, mark roadmap row 15 implemented,
   add the `studio/` freeze note, and confirm the site still builds and tests
   against `file:../studio`.
8. **Rollback**: before publish, delete the repository and split branch; after
   publish, deprecate the version and repoint the repository; the showcase is
   unaffected either way.

## Verification

- **`[lightmap-studio]` local**: `npm ci`, `npm run build`, `npm run typecheck`,
  `npm test`, `npm run test:consumer`, `npm run test:headless` (with
  `CHROME_SHELL_PATH`), `npm run test:pack`.
- **`[lightmap-studio]` CI**: the same commands from a fresh clone on
  `ubuntu-latest` with no parent checkout.
- **`[lightmap-studio]` registry**: install `lightmap-studio@0.1.0` in a
  scratch Vite project, confirm both wasm assets are emitted, and run the
  headless page against the installed package.
- **`[lightmapper-wasm]` root**: `npm run verify:remote`, the golden bake and
  `npm run test:pack`; confirm the tarball contains `dist/index.js` with
  `lmSeed`, the rebuilt wasm, and no studio files.
- **`[lightmapper-wasm]` showcase**: `npm run check --prefix site`,
  `npm test --prefix site`, `npm run test:harness --prefix site`,
  `npm run test:smoke --prefix site`,
  `SITE_BASE=/lightmapper-wasm/ npm run build --prefix site` and
  `npm run build:check --prefix site`, with the local studio still linked.
- **Planning**: `npx @fission-ai/openspec@latest validate --all --strict`.
