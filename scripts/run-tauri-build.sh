#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.release.local"

if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

if [ -z "${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" ]; then
  for candidate in \
    "$ROOT_DIR/.local-release/minnote-updater.key" \
    "$HOME/Documents/minnote/minnote-updater.key" \
    "$HOME/Documents/minnote-updater.key"
  do
    if [ -f "$candidate" ]; then
      export TAURI_SIGNING_PRIVATE_KEY_PATH="$candidate"
      break
    fi
  done
fi

if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ] && [ -n "${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" ] && [ -f "${TAURI_SIGNING_PRIVATE_KEY_PATH}" ]; then
  export TAURI_SIGNING_PRIVATE_KEY="$(cat "$TAURI_SIGNING_PRIVATE_KEY_PATH")"
fi

if { [ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ] || [ -n "${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" ]; } && [ -z "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" ]; then
  echo "TAURI_SIGNING_PRIVATE_KEY_PASSWORD is required for local release builds when updater signing is enabled."
  exit 1
fi

tauri build "$@"
