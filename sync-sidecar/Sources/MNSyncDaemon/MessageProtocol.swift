import Foundation

// MARK: - Tauri → Sidecar (stdin)

enum IncomingMessage: Decodable {
  case start(StartPayload)
  case refresh
  case notifyChanged(DocumentIdPayload)
  case notifyDeleted(DocumentIdPayload)
  case notifyReset
  case stop

  struct StartPayload: Decodable {
    let dbPath: String
    let statePath: String
    let containerIdentifier: String
  }

  struct DocumentIdPayload: Decodable {
    let documentId: String
  }

  private enum MessageType: String, Decodable {
    case start
    case refresh
    case notifyChanged = "notify-changed"
    case notifyDeleted = "notify-deleted"
    case notifyReset = "notify-reset"
    case stop
  }

  private enum CodingKeys: String, CodingKey { case type }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let type = try container.decode(MessageType.self, forKey: .type)
    switch type {
    case .start:        self = .start(try StartPayload(from: decoder))
    case .refresh:      self = .refresh
    case .notifyChanged: self = .notifyChanged(try DocumentIdPayload(from: decoder))
    case .notifyDeleted: self = .notifyDeleted(try DocumentIdPayload(from: decoder))
    case .notifyReset:  self = .notifyReset
    case .stop:         self = .stop
    }
  }
}

// MARK: - Sidecar → Tauri (stdout)

struct StatusMessage: Encodable {
  let type = "status"
  let state: String
  let lastSyncAt: Int64?
  let lastFetchAt: Int64?
  let lastSendAt: Int64?
  let initialFetchCompleted: Bool
}

struct RemoteChangedMessage: Encodable {
  let type = "remote-changed"
  let documents: [RemoteDocument]
}

struct RemoteDocument: Encodable {
  let id: String
  let title: String?
  let blockTintOverride: String?
  let documentSurfaceToneOverride: String?
  let blocksJson: String
  let createdAt: Int64
  let updatedAt: Int64
  let deletedAt: Int64?
}

struct ErrorMessage: Encodable {
  let type = "error"
  let message: String
}

func emitMessage<T: Encodable>(_ message: T) {
  guard
    let data = try? JSONEncoder().encode(message),
    let json = String(data: data, encoding: .utf8)
  else { return }
  print(json)
  fflush(stdout)
}
