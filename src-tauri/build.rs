use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

fn main() {
  if let Ok(target) = env::var("TARGET") {
    println!("cargo:rustc-env=MINNOTE_TARGET_TRIPLE={target}");
  }

  #[cfg(target_os = "macos")]
  build_cloudkit_sidecar();

  tauri_build::build()
}

#[cfg(target_os = "macos")]
fn build_cloudkit_sidecar() {
  let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("manifest dir"));
  let root_dir = manifest_dir.parent().expect("repo root");
  let package_dir = root_dir.join("sync-sidecar");
  let package_manifest = package_dir.join("Package.swift");
  if !package_manifest.exists() {
    return;
  }

  println!("cargo:rerun-if-changed={}", package_manifest.display());
  println!("cargo:rerun-if-changed={}", package_dir.join("Sources").display());

  let target = env::var("TARGET").unwrap_or_else(|_| "aarch64-apple-darwin".to_string());
  let profile = env::var("PROFILE").unwrap_or_else(|_| "debug".to_string());
  let swift_configuration = if profile == "release" { "release" } else { "debug" };
  let arch = if target.starts_with("x86_64") { "x86_64" } else { "arm64" };

  let status = Command::new("swift")
    .arg("build")
    .arg("-c")
    .arg(swift_configuration)
    .arg("--arch")
    .arg(arch)
    .arg("--product")
    .arg("minnote-cloudkit-bridge")
    .arg("--package-path")
    .arg(&package_dir)
    .status()
    .expect("swift build should start");

  if !status.success() {
    panic!("swift sidecar build failed");
  }

  let built_binary = find_sidecar_binary(&package_dir.join(".build"), "minnote-cloudkit-bridge")
    .expect("swift sidecar binary should exist after build");
  let binaries_dir = manifest_dir.join("binaries");
  fs::create_dir_all(&binaries_dir).expect("binaries dir should be created");
  let destination = binaries_dir.join(format!("minnote-cloudkit-bridge-{target}"));
  fs::copy(&built_binary, &destination).expect("swift sidecar should be copied");
  create_helper_app_bundle(&binaries_dir, &built_binary, &package_manifest);

  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    let mut permissions = fs::metadata(&destination).expect("sidecar metadata").permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&destination, permissions).expect("sidecar permissions");
  }
}

#[cfg(target_os = "macos")]
fn create_helper_app_bundle(binaries_dir: &Path, built_binary: &Path, package_manifest: &Path) {
  let helper_app_dir = binaries_dir.join("minnote-cloudkit-bridge.app");
  let contents_dir = helper_app_dir.join("Contents");
  let macos_dir = contents_dir.join("MacOS");
  fs::create_dir_all(&macos_dir).expect("helper app MacOS dir should be created");

  let helper_executable = macos_dir.join("minnote-cloudkit-bridge");
  fs::copy(built_binary, &helper_executable).expect("helper app executable should be copied");
  write_helper_info_plist(&contents_dir.join("Info.plist"));
  println!("cargo:rerun-if-changed={}", package_manifest.display());

  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    let mut permissions = fs::metadata(&helper_executable)
      .expect("helper app executable metadata")
      .permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&helper_executable, permissions).expect("helper app executable permissions");
  }
}

#[cfg(target_os = "macos")]
fn write_helper_info_plist(path: &Path) {
  let plist = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>English</string>
  <key>CFBundleExecutable</key>
  <string>minnote-cloudkit-bridge</string>
  <key>CFBundleIdentifier</key>
  <string>com.seongmin.minnote</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>MinNoteCloudKitBridge</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.5</string>
  <key>CFBundleVersion</key>
  <string>0.1.5</string>
  <key>LSMinimumSystemVersion</key>
  <string>14.0</string>
</dict>
</plist>
"#;
  fs::write(path, plist).expect("helper app Info.plist should be written");
}

#[cfg(target_os = "macos")]
fn find_sidecar_binary(build_dir: &Path, file_name: &str) -> Option<PathBuf> {
  if !build_dir.exists() {
    return None;
  }

  let mut stack = vec![build_dir.to_path_buf()];
  while let Some(path) = stack.pop() {
    let entries = fs::read_dir(&path).ok()?;
    for entry in entries.flatten() {
      let entry_path = entry.path();
      if entry_path.is_dir() {
        stack.push(entry_path);
        continue;
      }

      if entry_path.file_name().and_then(|name| name.to_str()) == Some(file_name) {
        return Some(entry_path);
      }
    }
  }

  None
}
