# Bootstrap lightmap-studio — release notes

## Repositories

- Canonical package repository: <https://github.com/mode777/lightmap-studio>
- Parent repository: <https://github.com/mode777/lightmapper-wasm>

## Published versions

- `lightmapper-wasm@0.2.0` — published from the existing tag-driven workflow
  with npm provenance. First release containing `lmSeed` and the `_srand` wasm
  export.
- `lightmap-studio@0.1.0` — published from `mode777/lightmap-studio` with
  provenance; `latest` points at `0.1.0`.
- `lightmap-studio@0.0.0-bootstrap.0` — name-ownership placeholder on the
  `bootstrap` tag, superseded by `0.1.0`.

## Artifact sizes

- `lightmapper.wasm`: 44,686 bytes (from 44,136 before AD-024); glue 32,247
  bytes; single-file embedded wasm 44,686 bytes.
- `lightmap-studio@0.1.0` tarball: 67 files, 46.6 kB packed, 213.0 kB unpacked.

## Verification evidence

- Root release run `43001221511`: success, including the golden bake and the
  `Publish to npm` step.
- Root remote verification: golden per-channel mean diff 0.000000, zero pixels
  above the 0.05 threshold, studio headless suite and site suites green.
- Studio CI run `43003327892`: success from a fresh GitHub checkout with no
  parent repository and no Emscripten.
- Studio release run `43003691678` attempt 2: all gates and OIDC publish
  succeeded.
- Registry consumer check: `lightmap-studio@0.1.0` installed in a clean
  scratch Vite app emitted both `lightmapper-*.wasm` and `xatlas-*.wasm`,
  produced atlas `60x60/1`, and repeated bakes reported `uvMaxDelta=0` and
  `lightmapMaxDelta=0` with `statsMax=0.6509`.
- `npx @fission-ai/openspec@latest validate --all --strict`: 13 passed, 0
  failed.

## Handoff

- The local `studio/` copy remains functionally frozen; only `studio/README.md`
  changed (canonical-repository and staging note).
- `site/package.json` still resolves `lightmap-studio` from `file:../studio`.
- Stage 3 (`consume-lightmap-studio`) remains planned: remove the local copy,
  switch the site to `lightmap-studio@^0.1.0`, and delete the local link.
