// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "MNSyncDaemon",
  platforms: [.macOS(.v14)],
  targets: [
    .executableTarget(
      name: "MNSyncDaemon",
      path: "Sources/MNSyncDaemon",
      swiftSettings: [
        .unsafeFlags(["-strict-concurrency=minimal"])
      ]
    )
  ]
)
