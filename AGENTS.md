# AGENTS.md — lightmapper-wasm

## Branching rule

**Always work directly on `Main`. Do not create feature branches, do not open pull requests, unless the user explicitly asks for it.**

- Commit to `Main` and push when the change is verified.
- Never leave work on a side branch — if one exists from an earlier session, fast-forward `Main` to it and delete the branch.
- `origin/Main` is the source of truth; fetch before pushing and keep pushes fast-forward.

## Verification before push

The full pipeline must be green before pushing to `Main`:

```bash
npm run verify:remote   # builds WASM with emsdk and runs smoke + golden bake on the verification box
```

Requires `SSH_HOST`, `SSH_USER`, `SSH_PASSWORD` in the environment and
`CHROME_SHELL_PATH` (or the default chrome-headless-shell location). CI runs
the same steps (`npm test`, `npm run test:bake`) on every push to `Main`.

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
