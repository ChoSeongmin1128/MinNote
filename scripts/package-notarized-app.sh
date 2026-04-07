#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_ENTITLEMENTS_PATH="$ROOT_DIR/src-tauri/Entitlements.plist"
HELPER_ENTITLEMENTS_PATH="$ROOT_DIR/src-tauri/Entitlements.Helper.plist"

export PATH="$ROOT_DIR/node_modules/.bin:$PATH"

usage() {
  cat <<'EOF'
usage:
  package-notarized-app.sh build <target>
  package-notarized-app.sh embed-profile <target> <profile-path>
  package-notarized-app.sh sign-helper <target>
  package-notarized-app.sh sign-app <target>
  package-notarized-app.sh zip-for-notarization <target> <arch-label> <output-dir>
  package-notarized-app.sh notarize <app-zip-path>
  package-notarized-app.sh staple-and-verify <target>
  package-notarized-app.sh package-updater <target> <arch-label> <output-dir>
  package-notarized-app.sh full <target> <arch-label> <profile-path> <output-dir>
EOF
}

cleanup_temp_dir() {
  local dir_path="$1"
  if [ -n "$dir_path" ] && [ -d "$dir_path" ]; then
    rm -rf "$dir_path"
  fi
}

require_env() {
  local name="$1"
  if [ -z "${(P)name:-}" ]; then
    echo "$name is required"
    exit 1
  fi
}

app_path_for_target() {
  local target="$1"
  echo "$ROOT_DIR/src-tauri/target/$target/release/bundle/macos/MinNote.app"
}

helper_app_path_for_app() {
  local app_path="$1"
  echo "$app_path/Contents/Resources/minnote-cloudkit-bridge.app"
}

helper_exec_path_for_app() {
  local app_path="$1"
  echo "$(helper_app_path_for_app "$app_path")/Contents/MacOS/minnote-cloudkit-bridge"
}

build_app_bundle() {
  local target="$1"
  "$ROOT_DIR/scripts/run-tauri-build.sh" --bundles app --target "$target" --no-sign --verbose

  local app_path
  app_path="$(app_path_for_target "$target")"
  if [ ! -d "$app_path" ]; then
    echo "MinNote.app not found for $target"
    exit 1
  fi
}

embed_profile() {
  local target="$1"
  local profile_path="$2"
  local app_path helper_app_path helper_exec_path

  app_path="$(app_path_for_target "$target")"
  helper_app_path="$(helper_app_path_for_app "$app_path")"
  helper_exec_path="$(helper_exec_path_for_app "$app_path")"

  if [ ! -f "$profile_path" ]; then
    echo "Provisioning profile not found: $profile_path"
    exit 1
  fi

  xattr -crs "$app_path"
  cp "$profile_path" "$app_path/Contents/embedded.provisionprofile"
  if [ -f "$helper_exec_path" ]; then
    cp "$profile_path" "$helper_app_path/Contents/embedded.provisionprofile"
  fi
}

sign_helper_bundle() {
  local target="$1"
  local app_path helper_app_path helper_exec_path

  require_env APPLE_SIGNING_IDENTITY_REF

  app_path="$(app_path_for_target "$target")"
  helper_app_path="$(helper_app_path_for_app "$app_path")"
  helper_exec_path="$(helper_exec_path_for_app "$app_path")"
  if [ ! -f "$helper_exec_path" ]; then
    return
  fi

  codesign --force --sign "$APPLE_SIGNING_IDENTITY_REF" --options runtime --entitlements "$HELPER_ENTITLEMENTS_PATH" "$helper_exec_path"
  codesign --force --sign "$APPLE_SIGNING_IDENTITY_REF" --options runtime --entitlements "$HELPER_ENTITLEMENTS_PATH" "$helper_app_path"
}

sign_app_bundle() {
  local target="$1"
  local app_path

  require_env APPLE_SIGNING_IDENTITY_REF

  app_path="$(app_path_for_target "$target")"
  codesign --force --sign "$APPLE_SIGNING_IDENTITY_REF" --options runtime --entitlements "$APP_ENTITLEMENTS_PATH" "$app_path/Contents/MacOS/minnote"
  codesign --force --sign "$APPLE_SIGNING_IDENTITY_REF" --options runtime --entitlements "$APP_ENTITLEMENTS_PATH" "$app_path"
}

zip_for_notarization() {
  local target="$1"
  local arch_label="$2"
  local output_dir="$3"
  local app_path app_zip_path

  app_path="$(app_path_for_target "$target")"
  mkdir -p "$output_dir"
  app_zip_path="$output_dir/MinNote_${arch_label}.app.zip"

  rm -f "$app_zip_path"
  ditto -c -k --keepParent --sequesterRsrc "$app_path" "$app_zip_path"
  echo "$app_zip_path"
}

notarize_app_zip() {
  local app_zip_path="$1"

  require_env APPLE_ID
  require_env APPLE_PASSWORD
  require_env APPLE_TEAM_ID

  local started_at finished_at
  started_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "Submitting app for notarization: $app_zip_path"
  echo "Notarization started at $started_at"
  xcrun notarytool submit "$app_zip_path" \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" \
    --wait
  finished_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "Notarization finished at $finished_at"
}

staple_and_verify_app() {
  local target="$1"
  local app_path sign_info

  require_env APPLE_TEAM_ID

  app_path="$(app_path_for_target "$target")"
  xcrun stapler staple "$app_path"

  sign_info="$(codesign -dv --verbose=4 "$app_path" 2>&1)"
  echo "$sign_info"
  echo "$sign_info" | grep -q "Authority=Developer ID Application: SEONGMIN CHO ($APPLE_TEAM_ID)"
  echo "$sign_info" | grep -q "TeamIdentifier=$APPLE_TEAM_ID"

  codesign --verify --deep --strict --verbose=2 "$app_path"
  xcrun stapler validate "$app_path"
  spctl -a -vv -t exec "$app_path"
}

package_updater_artifacts() {
  local target="$1"
  local arch_label="$2"
  local output_dir="$3"
  local app_path app_tar_path staging_dir extract_dir

  app_path="$(app_path_for_target "$target")"
  mkdir -p "$output_dir"
  app_tar_path="$output_dir/MinNote_${arch_label}.app.tar.gz"
  staging_dir="$(mktemp -d "${TMPDIR:-/tmp}/minnote-updater-stage.XXXXXX")"
  extract_dir="$(mktemp -d "${TMPDIR:-/tmp}/minnote-updater-extract.XXXXXX")"
  trap 'cleanup_temp_dir "$staging_dir"; cleanup_temp_dir "$extract_dir"' RETURN

  ditto "$app_path" "$staging_dir/MinNote.app"
  xattr -cr "$staging_dir/MinNote.app"

  rm -f "$app_tar_path"
  COPYFILE_DISABLE=1 bsdtar --disable-copyfile -czf "$app_tar_path" -C "$staging_dir" "MinNote.app"

  python3 - "$app_tar_path" <<'PY'
import sys
import tarfile

archive_path = sys.argv[1]
invalid_entries = []

with tarfile.open(archive_path, "r:gz") as archive:
    for member in archive.getmembers():
        name = member.name
        if name.startswith("._") or "/._" in name or name.endswith("/.DS_Store") or name.endswith(".DS_Store"):
            invalid_entries.append(name)

if invalid_entries:
    print("Updater archive contains unsupported Apple metadata entries:", file=sys.stderr)
    for entry in invalid_entries:
        print(f" - {entry}", file=sys.stderr)
    raise SystemExit(1)
PY

  tar -xzf "$app_tar_path" -C "$extract_dir"
  [ -d "$extract_dir/MinNote.app" ] || { echo "Updater archive smoke extract failed: MinNote.app missing"; exit 1; }
  if find "$extract_dir" \( -name '._*' -o -name '.DS_Store' \) -print -quit | grep -q .; then
    echo "Updater archive smoke extract produced unsupported Apple metadata files"
    exit 1
  fi

  if [ -n "${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" ]; then
    pnpm exec tauri signer sign "$app_tar_path" \
      -f "$TAURI_SIGNING_PRIVATE_KEY_PATH" \
      -p "$TAURI_SIGNING_PRIVATE_KEY_PASSWORD"
  else
    pnpm exec tauri signer sign "$app_tar_path"
  fi

  trap - RETURN
  cleanup_temp_dir "$staging_dir"
  cleanup_temp_dir "$extract_dir"
}

package_full() {
  local target="$1"
  local arch_label="$2"
  local profile_path="$3"
  local output_dir="$4"
  local app_zip_path

  build_app_bundle "$target"
  embed_profile "$target" "$profile_path"
  sign_helper_bundle "$target"
  sign_app_bundle "$target"
  app_zip_path="$(zip_for_notarization "$target" "$arch_label" "$output_dir")"
  notarize_app_zip "$app_zip_path"
  staple_and_verify_app "$target"
  package_updater_artifacts "$target" "$arch_label" "$output_dir"
}

if [ "$#" -lt 1 ]; then
  usage
  exit 1
fi

command="$1"
shift

case "$command" in
  build)
    [ "$#" -eq 1 ] || { usage; exit 1; }
    build_app_bundle "$1"
    ;;
  embed-profile)
    [ "$#" -eq 2 ] || { usage; exit 1; }
    embed_profile "$1" "$2"
    ;;
  sign-helper)
    [ "$#" -eq 1 ] || { usage; exit 1; }
    sign_helper_bundle "$1"
    ;;
  sign-app)
    [ "$#" -eq 1 ] || { usage; exit 1; }
    sign_app_bundle "$1"
    ;;
  zip-for-notarization)
    [ "$#" -eq 3 ] || { usage; exit 1; }
    zip_for_notarization "$1" "$2" "$3"
    ;;
  notarize)
    [ "$#" -eq 1 ] || { usage; exit 1; }
    notarize_app_zip "$1"
    ;;
  staple-and-verify)
    [ "$#" -eq 1 ] || { usage; exit 1; }
    staple_and_verify_app "$1"
    ;;
  package-updater)
    [ "$#" -eq 3 ] || { usage; exit 1; }
    package_updater_artifacts "$1" "$2" "$3"
    ;;
  full)
    [ "$#" -eq 4 ] || { usage; exit 1; }
    package_full "$1" "$2" "$3" "$4"
    ;;
  *)
    usage
    exit 1
    ;;
esac
