#!/bin/zsh

set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "usage: $0 <app-path> <output-dir> <version>"
  exit 1
fi

APP_PATH="$1"
OUTPUT_DIR="$2"
VERSION="$3"
STAGING_DIR="$OUTPUT_DIR/dmg-staging"

mkdir -p "$OUTPUT_DIR"
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"

cp -R "$APP_PATH" "$STAGING_DIR/MinNote.app"
ln -s /Applications "$STAGING_DIR/Applications"

FINAL_DMG="$OUTPUT_DIR/MinNote_${VERSION}_aarch64.dmg"
rm -f "$FINAL_DMG"

hdiutil create \
  -volname "MinNote" \
  -srcfolder "$STAGING_DIR" \
  -ov \
  -format UDZO \
  "$FINAL_DMG" >/dev/null

echo "$FINAL_DMG"
