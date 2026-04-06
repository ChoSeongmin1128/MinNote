#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.release.local"
APP_ENTITLEMENTS_PATH="$ROOT_DIR/src-tauri/Entitlements.plist"
HELPER_ENTITLEMENTS_PATH="$ROOT_DIR/src-tauri/Entitlements.Helper.plist"

usage() {
  cat <<'EOF'
usage: ./scripts/run-signed-dev-app.sh [--release] [--target <triple>] [--no-open] [--strict-gatekeeper]

Build a signed MinNote.app bundle for local verification and optionally open it.

Options:
  --release         Build the release app bundle instead of debug
  --target <triple> Build for a specific target triple
  --no-open         Skip launching the built app bundle
  --strict-gatekeeper Fail if spctl rejects the app
EOF
}

BUILD_MODE="debug"
OPEN_APP="yes"
STRICT_GATEKEEPER="no"
TARGET_ARGS=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --release)
      BUILD_MODE="release"
      shift
      ;;
    --target)
      if [ "$#" -lt 2 ]; then
        echo "--target requires a value"
        exit 1
      fi
      TARGET_ARGS=(--target "$2")
      shift 2
      ;;
    --no-open)
      OPEN_APP="no"
      shift
      ;;
    --strict-gatekeeper)
      STRICT_GATEKEEPER="yes"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

required_vars=(
  APPLE_SIGNING_IDENTITY
  APPLE_TEAM_ID
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

  codesign "${HELPER_CODESIGN_ARGS[@]}" "$helper_exec_path"
  codesign "${HELPER_CODESIGN_ARGS[@]}" "$helper_app_path"
}

cd "$ROOT_DIR"

CODESIGN_ARGS=(--force --sign "$APPLE_SIGNING_IDENTITY_REF" --options runtime --entitlements "$APP_ENTITLEMENTS_PATH")
HELPER_CODESIGN_ARGS=(--force --sign "$APPLE_SIGNING_IDENTITY_REF" --options runtime --entitlements "$HELPER_ENTITLEMENTS_PATH")
if [ "$BUILD_MODE" = "debug" ]; then
  CODESIGN_ARGS+=(--timestamp=none)
  HELPER_CODESIGN_ARGS+=(--timestamp=none)
fi

BUILD_ARGS=(--bundles app --no-sign)
if [ "$BUILD_MODE" = "debug" ]; then
  BUILD_ARGS+=(--debug)
fi
if [ "${#TARGET_ARGS[@]}" -gt 0 ]; then
  BUILD_ARGS+=("${TARGET_ARGS[@]}")
fi

echo "[1/4] app bundle build"
pnpm exec tauri build "${BUILD_ARGS[@]}"

APP_PATH="$ROOT_DIR/src-tauri/target"
if [ "${#TARGET_ARGS[@]}" -gt 0 ]; then
  APP_PATH="$APP_PATH/${TARGET_ARGS[2]}/$BUILD_MODE/bundle/macos/MinNote.app"
else
  APP_PATH="$APP_PATH/$BUILD_MODE/bundle/macos/MinNote.app"
fi

if [ ! -d "$APP_PATH" ]; then
  echo "MinNote.app not found: $APP_PATH"
  exit 1
fi

echo "[2/4] codesign"
xattr -crs "$APP_PATH"
if [ -n "$APPLE_PROVISIONING_PROFILE_RESOLVED" ]; then
  cp "$APPLE_PROVISIONING_PROFILE_RESOLVED" "$APP_PATH/Contents/embedded.provisionprofile"
fi
sign_helper_app "$APP_PATH"
codesign "${CODESIGN_ARGS[@]}" "$APP_PATH/Contents/MacOS/minnote"
codesign "${CODESIGN_ARGS[@]}" "$APP_PATH"

echo "[3/4] verify"
SIGN_INFO="$(codesign -dv --verbose=4 "$APP_PATH" 2>&1)"
echo "$SIGN_INFO"
echo "$SIGN_INFO" | grep -q "Authority=$APPLE_SIGNING_IDENTITY"
echo "$SIGN_INFO" | grep -q "TeamIdentifier=$APPLE_TEAM_ID"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

if ! spctl -a -vv -t exec "$APP_PATH"; then
  if [ "$STRICT_GATEKEEPER" = "yes" ]; then
    echo "spctl 검증 실패"
    exit 1
  fi

  echo "warn: 로컬 signed dev 앱은 notarization을 생략하므로 Gatekeeper에서 거절될 수 있습니다."
  echo "warn: codesign 검증은 통과했으므로 이 상태로 로컬 실행 확인을 계속합니다."
fi

if [ "$OPEN_APP" = "yes" ]; then
  echo "[4/4] open"
  open -n "$APP_PATH"
else
  echo "[4/4] skip open"
fi

echo "signed app ready: $APP_PATH"
