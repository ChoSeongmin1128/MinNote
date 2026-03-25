#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SIDECAR_DIR="$ROOT_DIR/sync-sidecar"
BIN_DIR="$ROOT_DIR/src-tauri/binaries"

mkdir -p "$BIN_DIR"

cd "$SIDECAR_DIR"

swift build -c release --arch arm64
cp .build/arm64-apple-macosx/release/MNSyncDaemon "$BIN_DIR/minnote-sync-aarch64-apple-darwin"

swift build -c release --arch x86_64
cp .build/x86_64-apple-macosx/release/MNSyncDaemon "$BIN_DIR/minnote-sync-x86_64-apple-darwin"
