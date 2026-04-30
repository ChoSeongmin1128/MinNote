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
RELEASE_DIR="/tmp/madi-release-$VERSION"
TARGET="aarch64-apple-darwin"
ARCH_LABEL="aarch64"

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

resolve_provisioning_profile_path() {
  if [ -n "${APPLE_PROVISIONING_PROFILE_PATH:-}" ] && [ -f "${APPLE_PROVISIONING_PROFILE_PATH}" ]; then
    echo "$APPLE_PROVISIONING_PROFILE_PATH"
    return
  fi

  for candidate in \
    "$ROOT_DIR/.local-release/Madi_Developer_ID_CloudKit.provisionprofile" \
    "$ROOT_DIR/.local-release/madi-cloudkit.provisionprofile"
  do
    if [ -f "$candidate" ]; then
      echo "$candidate"
      return
    fi
  done
}

plist_array_contains() {
  local plist_path="$1"
  local key_path="$2"
  local expected_value="$3"

  /usr/libexec/PlistBuddy -c "Print $key_path" "$plist_path" 2>/dev/null | grep -Fq "$expected_value"
}

require_profile_entitlement() {
  local plist_path="$1"
  local key_path="$2"
  local expected_value="$3"
  local failure_message="$4"

  if ! plist_array_contains "$plist_path" "$key_path" "$expected_value"; then
    echo "$failure_message"
    exit 1
  fi
}

APPLE_SIGNING_IDENTITY_REF="$(resolve_signing_identity_ref "$APPLE_SIGNING_IDENTITY")"
APPLE_PROVISIONING_PROFILE_RESOLVED="$(resolve_provisioning_profile_path || true)"

cd "$ROOT_DIR"

echo "[1/8] 검증"
pnpm exec tsc -b --pretty false
pnpm test:run
cargo check --manifest-path src-tauri/Cargo.toml --no-default-features

echo "[2/8] 릴리즈 preflight"
if [ -z "$APPLE_PROVISIONING_PROFILE_RESOLVED" ] || [ ! -f "$APPLE_PROVISIONING_PROFILE_RESOLVED" ]; then
  echo "CloudKit 및 Push 권한이 포함된 provisioning profile이 필요합니다."
  exit 1
fi
PROFILE_PLIST="$(mktemp)"
trap 'rm -f "${PROFILE_PLIST:-}"' EXIT
security cms -D -i "$APPLE_PROVISIONING_PROFILE_RESOLVED" > "$PROFILE_PLIST"
/usr/libexec/PlistBuddy -c "Print :Entitlements:com.apple.developer.aps-environment" "$PROFILE_PLIST" >/dev/null
/usr/libexec/PlistBuddy -c "Print :Entitlements:com.apple.developer.icloud-services" "$PROFILE_PLIST" >/dev/null
require_profile_entitlement \
  "$PROFILE_PLIST" \
  ":Entitlements:com.apple.developer.icloud-container-identifiers" \
  "iCloud.com.seongmin.madi" \
  "Madi iCloud container가 포함된 provisioning profile이 필요합니다."
require_profile_entitlement \
  "$PROFILE_PLIST" \
  ":Entitlements:com.apple.developer.icloud-container-identifiers" \
  "iCloud.com.seongmin.minnote" \
  "Phase 2 read-only import에는 legacy iCloud container가 포함된 provisioning profile이 필요합니다."
rm -f "$PROFILE_PLIST"
if [ -z "$APPLE_SIGNING_IDENTITY_REF" ]; then
  echo "codesign identity fingerprint를 해석할 수 없습니다."
  exit 1
fi

echo "[3/8] 앱 빌드 및 공증"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

echo "  - $TARGET"

APPLE_SIGNING_IDENTITY_REF="$APPLE_SIGNING_IDENTITY_REF" \
APPLE_ID="$APPLE_ID" \
APPLE_PASSWORD="$APPLE_PASSWORD" \
APPLE_TEAM_ID="$APPLE_TEAM_ID" \
TAURI_SIGNING_PRIVATE_KEY_PATH="$TAURI_SIGNING_PRIVATE_KEY_PATH" \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$TAURI_SIGNING_PRIVATE_KEY_PASSWORD" \
./scripts/package-notarized-app.sh full "$TARGET" "$ARCH_LABEL" "$APPLE_PROVISIONING_PROFILE_RESOLVED" "$RELEASE_DIR"

echo "[4/8] DMG 생성 및 공증"
APP_PATH="$ROOT_DIR/src-tauri/target/$TARGET/release/bundle/macos/Madi.app"

APPLE_SIGNING_IDENTITY_REF="$APPLE_SIGNING_IDENTITY_REF" \
APPLE_ID="$APPLE_ID" \
APPLE_PASSWORD="$APPLE_PASSWORD" \
APPLE_TEAM_ID="$APPLE_TEAM_ID" \
./scripts/package-notarized-dmg.sh full "$APP_PATH" "$RELEASE_DIR" "$VERSION"

echo "[5/8] latest.json 생성"
PUB_DATE="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
SIG_AARCH64="$(cat "$RELEASE_DIR/Madi_aarch64.app.tar.gz.sig")"
URL_AARCH64="https://github.com/ChoSeongmin1128/Madi/releases/download/$TAG/Madi_aarch64.app.tar.gz"

jq -n \
  --arg version "$VERSION" \
  --arg notes "Madi $TAG 업데이트" \
  --arg pub_date "$PUB_DATE" \
  --arg sig_arm "$SIG_AARCH64" \
  --arg url_arm "$URL_AARCH64" \
  '{
    version: $version,
    notes: $notes,
    pub_date: $pub_date,
    platforms: {
      "darwin-aarch64": {
        signature: $sig_arm,
        url: $url_arm
      }
    }
  }' > "$RELEASE_DIR/latest.json"

jq -e '.version and .pub_date and .platforms["darwin-aarch64"]' "$RELEASE_DIR/latest.json" >/dev/null
[ -s "$RELEASE_DIR/Madi_aarch64.app.tar.gz.sig" ]

python3 - "$RELEASE_DIR" <<'PY'
import pathlib
import sys
import tarfile

release_dir = pathlib.Path(sys.argv[1])
for archive_path in (
    release_dir / "Madi_aarch64.app.tar.gz",
):
    with tarfile.open(archive_path, "r:gz") as archive:
        invalid = [
            member.name
            for member in archive.getmembers()
            if member.name.startswith("._")
            or "/._" in member.name
            or member.name.endswith("/.DS_Store")
            or member.name.endswith(".DS_Store")
        ]
        if invalid:
            raise SystemExit(f"{archive_path.name} contains unsupported Apple metadata entries: {invalid}")
PY

echo "[6/8] 작업 트리 확인"
git diff --quiet
git diff --cached --quiet

echo "[7/8] 태그 및 릴리스 준비"
git push origin main
git tag -f "$TAG"
git push origin "$TAG" --force
if gh release view "$TAG" >/dev/null 2>&1; then
  gh release edit "$TAG" --title "Madi $TAG" --notes "Madi $TAG 업데이트"
else
  gh release create "$TAG" --title "Madi $TAG" --notes "Madi $TAG 업데이트"
fi

echo "[8/8] GitHub release 업로드"
gh release upload "$TAG" \
  "$RELEASE_DIR/Madi_${VERSION}.dmg#Madi_${VERSION}.dmg" \
  "$RELEASE_DIR/Madi_aarch64.app.tar.gz#Madi_aarch64.app.tar.gz" \
  "$RELEASE_DIR/Madi_aarch64.app.tar.gz.sig#Madi_aarch64.app.tar.gz.sig" \
  "$RELEASE_DIR/latest.json#latest.json" \
  --clobber

echo "완료: $TAG"
echo "산출물: $RELEASE_DIR"
