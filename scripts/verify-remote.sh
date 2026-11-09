#!/usr/bin/env bash
# Build and verify lightmapper-wasm on the remote Linux verification box.
#
#   SSH_HOST=... SSH_USER=... SSH_PASSWORD=... npm run verify:remote
#   SSH_HOST=... SSH_USER=... SSH_PASSWORD=... npm run verify:remote -- --update-golden
#
# Credentials are read from the environment only and are never echoed. The
# askpass helper lives under $HOME/.cache because /tmp is mounted noexec in the
# toolbox container (ssh cannot execute an askpass script from there).
set -euo pipefail

UPDATE_GOLDEN=0
for arg in "$@"; do
  case "$arg" in
    --update-golden) UPDATE_GOLDEN=1 ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: SSH_HOST=... SSH_USER=... SSH_PASSWORD=... $0 [--update-golden]" >&2
      exit 2
      ;;
  esac
done

: "${SSH_HOST:?SSH_HOST must be set in the environment}"
: "${SSH_USER:?SSH_USER must be set in the environment}"
: "${SSH_PASSWORD:?SSH_PASSWORD must be set in the environment}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_DIR="lmverify"
REMOTE="${SSH_USER}@${SSH_HOST}"
REMOTE_CHROME='$HOME/browsers/chrome-headless-shell/linux-131.0.6778.264/chrome-headless-shell-linux64/chrome-headless-shell'

# --- askpass helper (no secret is written to disk) ---------------------------
ASKPASS="$HOME/.cache/lm-askpass.sh"
mkdir -p "$HOME/.cache"
(
  umask 077
  cat > "$ASKPASS" <<'ASKPASS_EOF'
#!/bin/sh
printf '%s\n' "${SSH_PASSWORD:?SSH_PASSWORD not set}"
ASKPASS_EOF
)
chmod 700 "$ASKPASS"

export SSH_ASKPASS="$ASKPASS"
export SSH_ASKPASS_REQUIRE=force
export DISPLAY="${DISPLAY:-:0}"

SSH_OPTS=(-o StrictHostKeyChecking=accept-new)

echo "==> Syncing repository to ${REMOTE}:${REMOTE_DIR}"
if command -v rsync >/dev/null 2>&1; then
  rsync -az --delete \
    --exclude node_modules \
    --exclude build \
    --exclude dist \
    --exclude .git \
    -e "ssh ${SSH_OPTS[*]}" \
    "${REPO_ROOT}/" "${REMOTE}:${REMOTE_DIR}/"
else
  # The toolbox image does not always ship rsync; tar over ssh is equivalent
  # for this one-shot sync (no incremental/delete semantics needed remotely).
  echo "==> rsync not found; falling back to tar over ssh"
  tar -czf - -C "$REPO_ROOT" \
    --exclude=node_modules --exclude=build --exclude=dist --exclude=.git . \
    | ssh "${SSH_OPTS[@]}" "$REMOTE" "mkdir -p \"\$HOME/${REMOTE_DIR}\" && tar -xzf - -C \"\$HOME/${REMOTE_DIR}\" --strip-components=1"
fi

echo "==> Running remote build and tests (update-golden=${UPDATE_GOLDEN})"
ssh "${SSH_OPTS[@]}" "$REMOTE" "UPDATE_GOLDEN=${UPDATE_GOLDEN} bash -s" <<REMOTE_SCRIPT
set -euo pipefail
cd "\$HOME/${REMOTE_DIR}"

# shellcheck disable=SC1090
source "\$HOME/emsdk/emsdk_env.sh"
echo "==> node \$(node --version), emcc: \$(emcc --version | head -n 1)"

# The local worktree may not have the submodule checked out (and .git is not
# synced), so fetch it here if the directory is empty.
if [ ! -f thirdparty/lightmapper/lightmapper.h ]; then
  echo "==> thirdparty/lightmapper is empty; cloning from .gitmodules"
  SUBMODULE_URL="\$(git config -f .gitmodules submodule.thirdparty/lightmapper.url)"
  git clone --depth 1 "\$SUBMODULE_URL" thirdparty/lightmapper
fi

if ! npm ci; then
  echo "npm ci failed (likely out-of-sync lockfile); falling back to npm install" >&2
  npm install
fi

npm run configure:wasm
# build:wasm is \`cmake --build build/wasm --config Release\`; npm forwards the
# trailing args, so this caps the build at 3 jobs on the small remote box.
npm run build:wasm -- -j3
# build:dist needs both flavours: the default separate-asset build and the
# opt-in single-file build behind lightmapper-wasm/single.
npm run configure:wasm:single
npm run build:wasm:single -- -j3
npm run build:dist
npm test
npm run test:dist

export CHROME_SHELL_PATH="\${CHROME_SHELL_PATH:-${REMOTE_CHROME}}"
if [ "\${UPDATE_GOLDEN:-0}" = "1" ]; then
  npm run test:update-golden
else
  npm run test:bake
fi

echo "==> Showcase: install and verify site/"
if ! npm ci --prefix site; then
  echo "site npm ci failed (likely out-of-sync lockfile); falling back to npm install" >&2
  npm install --prefix site
fi
npm run check --prefix site
npm test --prefix site
npm run test:harness --prefix site
npm run test:smoke --prefix site
SITE_BASE=/lightmapper-wasm/ npm run build --prefix site
SITE_BASE=/lightmapper-wasm/ npm run build:check --prefix site
REMOTE_SCRIPT

if [ "$UPDATE_GOLDEN" = "1" ]; then
  echo "==> Pulling updated golden files back into the working tree"
  mkdir -p "$REPO_ROOT/test/golden"
  if command -v rsync >/dev/null 2>&1; then
    rsync -az -e "ssh ${SSH_OPTS[*]}" "${REMOTE}:${REMOTE_DIR}/test/golden/" "$REPO_ROOT/test/golden/"
  else
    ssh "${SSH_OPTS[@]}" "$REMOTE" "tar -czf - -C \"\$HOME/${REMOTE_DIR}\" test/golden" \
      | tar -xzf - -C "$REPO_ROOT"
  fi
fi

echo "==> Remote verification complete"
