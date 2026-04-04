// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "CloudKitBridge",
  platforms: [
    .macOS(.v14),
  ],
  products: [
    .executable(
      name: "minnote-cloudkit-bridge",
      targets: ["CloudKitBridge"]
    ),
  ],
  targets: [
    .executableTarget(
      name: "CloudKitBridge"
    ),
  ]
)
