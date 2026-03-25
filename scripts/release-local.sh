#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.release.local"

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <version>"
  exit 1
fi

VERSION="$1"
TAG="v$VERSION"
RELEASE_DIR="/tmp/minnote-release-$VERSION"

if [ ! -f "$ENV_FILE" ]; then
  echo ".env.release.local 파일이 필요합니다."
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

required_vars=(
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD
  TAURI_SIGNING_PRIVATE_KEY_PATH
  APPLE_ID
  APPLE_PASSWORD
  APPLE_TEAM_ID
  APPLE_SIGNING_IDENTITY
)

for var_name in "${required_vars[@]}"; do
  if [ -z "${(P)var_name:-}" ]; then
    echo "$var_name 값이 필요합니다."
    exit 1
  fi
done

cd "$ROOT_DIR"

echo "[1/7] 검증"
pnpm exec tsc -b --pretty false
pnpm test:run
cargo check --manifest-path src-tauri/Cargo.toml --no-default-features

echo "[2/7] 앱 빌드"
pnpm tauri:build

APP_PATH="$ROOT_DIR/src-tauri/target/release/bundle/macos/MinNote.app"

echo "[3/7] 앱 검증"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"
xcrun stapler validate "$APP_PATH"
spctl -a -vv -t exec "$APP_PATH"

echo "[4/7] 릴리스 산출물 준비"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR/dist"
cp -R "$APP_PATH" "$RELEASE_DIR/dist/MinNote.app"
tar -czf "$RELEASE_DIR/MinNote_aarch64.app.tar.gz" -C "$RELEASE_DIR/dist" MinNote.app
pnpm exec tauri signer sign "$RELEASE_DIR/MinNote_aarch64.app.tar.gz" \
  -f "$TAURI_SIGNING_PRIVATE_KEY_PATH" \
  -p "$TAURI_SIGNING_PRIVATE_KEY_PASSWORD"

echo "[5/7] DMG 생성 및 공증"
DMG_PATH="$(./scripts/create-dmg.sh "$RELEASE_DIR/dist/MinNote.app" "$RELEASE_DIR" "$VERSION")"
codesign --force --sign "$APPLE_SIGNING_IDENTITY" "$DMG_PATH"
xcrun notarytool submit "$DMG_PATH" \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait
xcrun stapler staple "$DMG_PATH"
xcrun stapler validate "$DMG_PATH"
syspolicy_check distribution "$DMG_PATH"

echo "[6/7] latest.json 생성"
SIGNATURE="$(cat "$RELEASE_DIR/MinNote_aarch64.app.tar.gz.sig")"
PUB_DATE="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
DOWNLOAD_URL="https://github.com/ChoSeongmin1128/MinNote/releases/download/$TAG/MinNote_aarch64.app.tar.gz"
jq -n \
  --arg version "$VERSION" \
  --arg notes "MinNote $TAG 업데이트" \
  --arg pub_date "$PUB_DATE" \
  --arg sig "$SIGNATURE" \
  --arg url "$DOWNLOAD_URL" \
  '{
    version: $version,
    notes: $notes,
    pub_date: $pub_date,
    platforms: {
      "darwin-aarch64": {
        signature: $sig,
        url: $url
      }
    }
  }' > "$RELEASE_DIR/latest.json"

echo "[7/7] GitHub release 업로드"
git diff --quiet
git diff --cached --quiet
git push origin main
git tag -f "$TAG"
git push origin "$TAG" --force
gh release edit "$TAG" --title "MinNote $TAG" --notes "MinNote $TAG 업데이트"
gh release upload "$TAG" \
  "$RELEASE_DIR/MinNote_${VERSION}_aarch64.dmg#MinNote_${VERSION}_aarch64.dmg" \
  "$RELEASE_DIR/MinNote_aarch64.app.tar.gz#MinNote_aarch64.app.tar.gz" \
  "$RELEASE_DIR/MinNote_aarch64.app.tar.gz.sig#MinNote_aarch64.app.tar.gz.sig" \
  "$RELEASE_DIR/latest.json#latest.json" \
  --clobber

echo "완료: $TAG"
echo "산출물: $RELEASE_DIR"
