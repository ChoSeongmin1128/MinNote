#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.release.local"
APP_ENTITLEMENTS_PATH="$ROOT_DIR/src-tauri/Entitlements.plist"
HELPER_ENTITLEMENTS_PATH="$ROOT_DIR/src-tauri/Entitlements.Helper.plist"

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <version>"
  exit 1
fi

VERSION="$1"
TAG="v$VERSION"
RELEASE_DIR="/tmp/minnote-release-$VERSION"
TARGETS=(
  "aarch64-apple-darwin"
  "x86_64-apple-darwin"
)

arch_label() {
  case "$1" in
    aarch64-apple-darwin) echo "aarch64" ;;
    x86_64-apple-darwin) echo "x86_64" ;;
    *)
      echo "unsupported target: $1" >&2
      exit 1
      ;;
  esac
}

platform_key() {
  case "$1" in
    aarch64) echo "darwin-aarch64" ;;
    x86_64) echo "darwin-x86_64" ;;
    *)
      echo "unsupported arch label: $1" >&2
      exit 1
      ;;
  esac
}

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

resolve_signing_identity_ref() {
  local requested_identity="$1"
  local matches
  matches="$(security find-identity -v -p codesigning | grep "\"$requested_identity\"" || true)"

  if [ -z "$matches" ]; then
    echo "$requested_identity"
    return
  fi

  echo "$matches" | awk 'NR == 1 { print $2 }'
}

APPLE_SIGNING_IDENTITY_REF="$(resolve_signing_identity_ref "$APPLE_SIGNING_IDENTITY")"

resolve_provisioning_profile_path() {
  if [ -n "${APPLE_PROVISIONING_PROFILE_PATH:-}" ] && [ -f "${APPLE_PROVISIONING_PROFILE_PATH}" ]; then
    echo "$APPLE_PROVISIONING_PROFILE_PATH"
    return
  fi

  for candidate in \
    "$ROOT_DIR/.local-release/MinNote_Developer_ID_CloudKit.provisionprofile" \
    "$ROOT_DIR/.local-release/minnote-cloudkit.provisionprofile"
  do
    if [ -f "$candidate" ]; then
      echo "$candidate"
      return
    fi
  done
}

APPLE_PROVISIONING_PROFILE_RESOLVED="$(resolve_provisioning_profile_path || true)"

sign_helper_app() {
  local app_path="$1"
  local helper_app_path="$app_path/Contents/Resources/minnote-cloudkit-bridge.app"
  local helper_exec_path="$helper_app_path/Contents/MacOS/minnote-cloudkit-bridge"

  if [ ! -f "$helper_exec_path" ]; then
    return
  fi

  if [ -n "$APPLE_PROVISIONING_PROFILE_RESOLVED" ]; then
    cp "$APPLE_PROVISIONING_PROFILE_RESOLVED" "$helper_app_path/Contents/embedded.provisionprofile"
  fi

  codesign --force --sign "$APPLE_SIGNING_IDENTITY_REF" --options runtime --entitlements "$HELPER_ENTITLEMENTS_PATH" "$helper_exec_path"
  codesign --force --sign "$APPLE_SIGNING_IDENTITY_REF" --options runtime --entitlements "$HELPER_ENTITLEMENTS_PATH" "$helper_app_path"
}

cd "$ROOT_DIR"

echo "[1/7] 검증"
pnpm exec tsc -b --pretty false
pnpm test:run
cargo check --manifest-path src-tauri/Cargo.toml --no-default-features

echo "[2/7] 앱 빌드 및 검증"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

for TARGET in "${TARGETS[@]}"; do
  ARCH_LABEL="$(arch_label "$TARGET")"
  echo "  - $TARGET"

  ./scripts/run-tauri-build.sh --bundles app --target "$TARGET"

  APP_PATH="$ROOT_DIR/src-tauri/target/$TARGET/release/bundle/macos/MinNote.app"
  DIST_DIR="$RELEASE_DIR/dist/$ARCH_LABEL"

  if [ -n "$APPLE_PROVISIONING_PROFILE_RESOLVED" ]; then
    cp "$APPLE_PROVISIONING_PROFILE_RESOLVED" "$APP_PATH/Contents/embedded.provisionprofile"
  fi
  sign_helper_app "$APP_PATH"
  codesign --force --sign "$APPLE_SIGNING_IDENTITY_REF" --options runtime --entitlements "$APP_ENTITLEMENTS_PATH" "$APP_PATH/Contents/MacOS/minnote"
  codesign --force --sign "$APPLE_SIGNING_IDENTITY_REF" --options runtime --entitlements "$APP_ENTITLEMENTS_PATH" "$APP_PATH"
  codesign --verify --deep --strict --verbose=2 "$APP_PATH"
  xcrun stapler validate "$APP_PATH"
  spctl -a -vv -t exec "$APP_PATH"

  mkdir -p "$DIST_DIR"
  cp -R "$APP_PATH" "$DIST_DIR/MinNote.app"

  tar -czf "$RELEASE_DIR/MinNote_${ARCH_LABEL}.app.tar.gz" -C "$DIST_DIR" MinNote.app
  pnpm exec tauri signer sign "$RELEASE_DIR/MinNote_${ARCH_LABEL}.app.tar.gz" \
    -f "$TAURI_SIGNING_PRIVATE_KEY_PATH" \
    -p "$TAURI_SIGNING_PRIVATE_KEY_PASSWORD"
done

echo "[3/7] DMG 생성 및 공증"
for TARGET in "${TARGETS[@]}"; do
  ARCH_LABEL="$(arch_label "$TARGET")"
  DIST_DIR="$RELEASE_DIR/dist/$ARCH_LABEL"
  DMG_PATH="$(./scripts/create-dmg.sh "$DIST_DIR/MinNote.app" "$RELEASE_DIR" "$VERSION" "$ARCH_LABEL")"

  codesign --force --sign "$APPLE_SIGNING_IDENTITY_REF" "$DMG_PATH"
  xcrun notarytool submit "$DMG_PATH" \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" \
    --wait
  xcrun stapler staple "$DMG_PATH"
  xcrun stapler validate "$DMG_PATH"
  syspolicy_check distribution "$DMG_PATH"
done

echo "[4/7] latest.json 생성"
PUB_DATE="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
SIG_AARCH64="$(cat "$RELEASE_DIR/MinNote_aarch64.app.tar.gz.sig")"
SIG_X86_64="$(cat "$RELEASE_DIR/MinNote_x86_64.app.tar.gz.sig")"
URL_AARCH64="https://github.com/ChoSeongmin1128/MinNote/releases/download/$TAG/MinNote_aarch64.app.tar.gz"
URL_X86_64="https://github.com/ChoSeongmin1128/MinNote/releases/download/$TAG/MinNote_x86_64.app.tar.gz"

jq -n \
  --arg version "$VERSION" \
  --arg notes "MinNote $TAG 업데이트" \
  --arg pub_date "$PUB_DATE" \
  --arg sig_arm "$SIG_AARCH64" \
  --arg url_arm "$URL_AARCH64" \
  --arg sig_x64 "$SIG_X86_64" \
  --arg url_x64 "$URL_X86_64" \
  '{
    version: $version,
    notes: $notes,
    pub_date: $pub_date,
    platforms: {
      "darwin-aarch64": {
        signature: $sig_arm,
        url: $url_arm
      },
      "darwin-x86_64": {
        signature: $sig_x64,
        url: $url_x64
      }
    }
  }' > "$RELEASE_DIR/latest.json"

echo "[5/7] 작업 트리 확인"
git diff --quiet
git diff --cached --quiet

echo "[6/7] 태그 및 릴리스 준비"
git push origin main
git tag -f "$TAG"
git push origin "$TAG" --force
if gh release view "$TAG" >/dev/null 2>&1; then
  gh release edit "$TAG" --title "MinNote $TAG" --notes "MinNote $TAG 업데이트"
else
  gh release create "$TAG" --title "MinNote $TAG" --notes "MinNote $TAG 업데이트"
fi

echo "[7/7] GitHub release 업로드"
gh release upload "$TAG" \
  "$RELEASE_DIR/MinNote_${VERSION}_aarch64.dmg#MinNote_${VERSION}_aarch64.dmg" \
  "$RELEASE_DIR/MinNote_${VERSION}_x86_64.dmg#MinNote_${VERSION}_x86_64.dmg" \
  "$RELEASE_DIR/MinNote_aarch64.app.tar.gz#MinNote_aarch64.app.tar.gz" \
  "$RELEASE_DIR/MinNote_aarch64.app.tar.gz.sig#MinNote_aarch64.app.tar.gz.sig" \
  "$RELEASE_DIR/MinNote_x86_64.app.tar.gz#MinNote_x86_64.app.tar.gz" \
  "$RELEASE_DIR/MinNote_x86_64.app.tar.gz.sig#MinNote_x86_64.app.tar.gz.sig" \
  "$RELEASE_DIR/latest.json#latest.json" \
  --clobber

echo "완료: $TAG"
echo "산출물: $RELEASE_DIR"
