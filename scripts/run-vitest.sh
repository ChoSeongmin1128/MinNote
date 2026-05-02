#!/bin/zsh

set -euo pipefail

if node --help 2>/dev/null | grep -q -- "--localstorage-file"; then
  STORAGE_FILE="${TMPDIR:-/tmp}/madi-vitest-localstorage-${USER:-user}"
  if [ -n "${NODE_OPTIONS:-}" ]; then
    export NODE_OPTIONS="$NODE_OPTIONS --localstorage-file=$STORAGE_FILE"
  else
    export NODE_OPTIONS="--localstorage-file=$STORAGE_FILE"
  fi
fi

exec pnpm exec vitest "$@"
