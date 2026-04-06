import CloudKit
import Foundation

private let containerIdentifier = "iCloud.com.seongmin.minnote"
private let documentRecordType = "Document"
private let blockRecordType = "Block"
private let documentTombstoneRecordType = "DocumentTombstone"
private let blockTombstoneRecordType = "BlockTombstone"

@main
struct Main {
  static func main() async {
    do {
      let command = try readCommand()
      switch command {
      case "getAccountStatus":
        let response = try await getAccountStatus()
        try writeResponse(response)
      case "ensureZone":
        let request: EnsureZoneRequest = try readPayload()
        try await ensureZone(zoneName: request.zoneName)
        try writeResponse(EmptyResponse())
      case "ensureSubscription":
        let request: EnsureSubscriptionRequest = try readPayload()
        try await ensureSubscription(
          zoneName: request.zoneName,
          subscriptionId: request.subscriptionId
        )
        try writeResponse(EmptyResponse())
      case "fetchChanges":
        let request: FetchChangesRequest = try readPayload()
        let response = try await fetchChanges(request: request)
        try writeResponse(response)
      case "applyOperations":
        let request: ApplyOperationsRequest = try readPayload()
        let response = try await applyOperations(request: request)
        try writeResponse(response)
      default:
        throw BridgeError.invalidCommand(command)
      }
    } catch {
      let nsError = error as NSError
      let message = "[\(nsError.domain):\(nsError.code)] \(error.localizedDescription)\n"
      FileHandle.standardError.write(message.data(using: .utf8)!)
      Foundation.exit(1)
    }
  }
}

private struct EmptyResponse: Codable {}

private struct EnsureZoneRequest: Codable {
  let zoneName: String
}

private struct EnsureSubscriptionRequest: Codable {
  let zoneName: String
  let subscriptionId: String
}

private struct AccountStatusResponse: Codable {
  let accountStatus: String
}

private struct FetchChangesRequest: Codable {
  let zoneName: String
  let serverChangeToken: String?
}

private struct FetchChangesResponse: Codable {
  let documents: [BridgeDocumentRecord]
  let blocks: [BridgeBlockRecord]
  let documentTombstones: [BridgeDocumentTombstoneRecord]
  let blockTombstones: [BridgeBlockTombstoneRecord]
  let nextServerChangeToken: String?
}

private struct ApplyOperationsRequest: Codable {
  let zoneName: String
  let saveDocuments: [BridgeDocumentRecord]
  let saveBlocks: [BridgeBlockRecord]
  let saveDocumentTombstones: [BridgeDocumentTombstoneRecord]
  let saveBlockTombstones: [BridgeBlockTombstoneRecord]
  let deleteRecordNames: [String]
}

private struct ApplyOperationsResponse: Codable {
  let savedRecordNames: [String]
  let failed: [BridgeFailure]
  let serverChanged: ServerChangedRecords
}

private struct BridgeFailure: Codable {
  let recordName: String
  let errorCode: String
  let message: String
}

private struct ServerChangedRecords: Codable {
  var documents: [BridgeDocumentRecord] = []
  var blocks: [BridgeBlockRecord] = []
  var documentTombstones: [BridgeDocumentTombstoneRecord] = []
  var blockTombstones: [BridgeBlockTombstoneRecord] = []
}

private struct BridgeDocumentRecord: Codable {
  let documentId: String
  let title: String
  let blockTintOverride: String?
  let documentSurfaceToneOverride: String?
  let updatedAtMs: Int64
  let updatedByDeviceId: String
}

private struct BridgeBlockRecord: Codable {
  let blockId: String
  let documentId: String
  let kind: String
  let content: String
  let language: String?
  let position: Int64
  let updatedAtMs: Int64
  let updatedByDeviceId: String
}

private struct BridgeDocumentTombstoneRecord: Codable {
  let documentId: String
  let deletedAtMs: Int64
  let deletedByDeviceId: String
}

private struct BridgeBlockTombstoneRecord: Codable {
  let blockId: String
  let documentId: String
  let deletedAtMs: Int64
  let deletedByDeviceId: String
}

private enum BridgeError: LocalizedError {
  case invalidCommand(String)
  case missingPayload
  case invalidToken

  var errorDescription: String? {
    switch self {
    case .invalidCommand(let command):
      return "알 수 없는 iCloud bridge 명령입니다: \(command)"
    case .missingPayload:
      return "iCloud bridge payload를 읽지 못했습니다."
    case .invalidToken:
      return "CloudKit 변경 토큰을 복원하지 못했습니다."
    }
  }
}

private func readCommand() throws -> String {
  guard CommandLine.arguments.count >= 2 else {
    throw BridgeError.invalidCommand("")
  }
  return CommandLine.arguments[1]
}

private func readPayload<T: Decodable>() throws -> T {
  let data = FileHandle.standardInput.readDataToEndOfFile()
  guard !data.isEmpty else {
    throw BridgeError.missingPayload
  }
  return try JSONDecoder().decode(T.self, from: data)
}

private func writeResponse<T: Encodable>(_ value: T) throws {
  let data = try JSONEncoder().encode(value)
  FileHandle.standardOutput.write(data)
}

private func container() -> CKContainer {
  CKContainer(identifier: containerIdentifier)
}

private func privateDatabase() -> CKDatabase {
  container().privateCloudDatabase
}

private func zoneID(named zoneName: String) -> CKRecordZone.ID {
  CKRecordZone.ID(zoneName: zoneName, ownerName: CKCurrentUserDefaultName)
}

private func getAccountStatus() async throws -> AccountStatusResponse {
  let status: CKAccountStatus = try await withCheckedThrowingContinuation { continuation in
    container().accountStatus { accountStatus, error in
      if let error {
        continuation.resume(throwing: error)
        return
      }
      continuation.resume(returning: accountStatus)
    }
  }

  return AccountStatusResponse(accountStatus: mapAccountStatus(status))
}

private func ensureZone(zoneName: String) async throws {
  let zone = CKRecordZone(zoneID: zoneID(named: zoneName))
  try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
    let operation = CKModifyRecordZonesOperation(recordZonesToSave: [zone], recordZoneIDsToDelete: nil)
    operation.modifyRecordZonesCompletionBlock = { _, _, error in
      if let error {
        continuation.resume(throwing: error)
      } else {
        continuation.resume(returning: ())
      }
    }
    privateDatabase().add(operation)
  }
}

private func ensureSubscription(zoneName: String, subscriptionId: String) async throws {
  let zone = zoneID(named: zoneName)
  let subscription = CKRecordZoneSubscription(
    zoneID: zone,
    subscriptionID: subscriptionId
  )
  let notificationInfo = CKSubscription.NotificationInfo()
  notificationInfo.shouldSendContentAvailable = true
  subscription.notificationInfo = notificationInfo

  _ = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<CKSubscription, Error>) in
    privateDatabase().save(subscription) { savedSubscription, error in
      if let error {
        continuation.resume(throwing: error)
      } else if let savedSubscription {
        continuation.resume(returning: savedSubscription)
      } else {
        continuation.resume(throwing: BridgeError.invalidCommand("ensureSubscription"))
      }
    }
  }
}

private func fetchChanges(request: FetchChangesRequest) async throws -> FetchChangesResponse {
  let zone = zoneID(named: request.zoneName)
  let options = CKFetchRecordZoneChangesOperation.ZoneConfiguration()
  if let token = request.serverChangeToken {
    options.previousServerChangeToken = try decodeToken(token)
  }

  return try await withCheckedThrowingContinuation { continuation in
    var documents: [BridgeDocumentRecord] = []
    var blocks: [BridgeBlockRecord] = []
    var documentTombstones: [BridgeDocumentTombstoneRecord] = []
    var blockTombstones: [BridgeBlockTombstoneRecord] = []
    var nextServerChangeToken: String?

    let operation = CKFetchRecordZoneChangesOperation(
      recordZoneIDs: [zone],
      configurationsByRecordZoneID: [zone: options]
    )

    operation.recordChangedBlock = { record in
      switch record.recordType {
      case documentRecordType:
        if let value = decodeDocument(record: record) {
          documents.append(value)
        }
      case blockRecordType:
        if let value = decodeBlock(record: record) {
          blocks.append(value)
        }
      case documentTombstoneRecordType:
        if let value = decodeDocumentTombstone(record: record) {
          documentTombstones.append(value)
        }
      case blockTombstoneRecordType:
        if let value = decodeBlockTombstone(record: record) {
          blockTombstones.append(value)
        }
      default:
        break
      }
    }

    operation.recordZoneFetchCompletionBlock = { _, serverChangeToken, _, _, error in
      if let error {
        continuation.resume(throwing: error)
        return
      }

      nextServerChangeToken = try? serverChangeToken.map(encodeToken)
    }

    operation.fetchRecordZoneChangesCompletionBlock = { error in
      if let error {
        continuation.resume(throwing: error)
        return
      }

      continuation.resume(
        returning: FetchChangesResponse(
          documents: documents,
          blocks: blocks,
          documentTombstones: documentTombstones,
          blockTombstones: blockTombstones,
          nextServerChangeToken: nextServerChangeToken
        )
      )
    }

    privateDatabase().add(operation)
  }
}

private func applyOperations(request: ApplyOperationsRequest) async throws -> ApplyOperationsResponse {
  let zone = zoneID(named: request.zoneName)
  let recordsToSave = request.saveDocuments.map { makeDocumentRecord($0, zoneID: zone) }
    + request.saveBlocks.map { makeBlockRecord($0, zoneID: zone) }
    + request.saveDocumentTombstones.map { makeDocumentTombstoneRecord($0, zoneID: zone) }
    + request.saveBlockTombstones.map { makeBlockTombstoneRecord($0, zoneID: zone) }
  let recordIDsToDelete = request.deleteRecordNames.map { CKRecord.ID(recordName: $0, zoneID: zone) }

  return try await withCheckedThrowingContinuation { continuation in
    var savedRecordNames: [String] = []
    var failures: [BridgeFailure] = []
    var serverChanged = ServerChangedRecords()

    let operation = CKModifyRecordsOperation(recordsToSave: recordsToSave, recordIDsToDelete: recordIDsToDelete)
    operation.savePolicy = .allKeys
    operation.isAtomic = false
    operation.perRecordSaveBlock = { recordID, result in
      switch result {
      case .success(let record):
        savedRecordNames.append(record.recordID.recordName)
      case .failure(let error):
        failures.append(BridgeFailure(
          recordName: recordID.recordName,
          errorCode: codeString(for: error),
          message: error.localizedDescription
        ))
        appendServerChanged(from: error, into: &serverChanged)
      }
    }
    operation.perRecordDeleteBlock = { recordID, result in
      switch result {
      case .success:
        savedRecordNames.append(recordID.recordName)
      case .failure(let error):
        failures.append(BridgeFailure(
          recordName: recordID.recordName,
          errorCode: codeString(for: error),
          message: error.localizedDescription
        ))
        appendServerChanged(from: error, into: &serverChanged)
      }
    }
    operation.modifyRecordsResultBlock = { result in
      switch result {
      case .success:
        continuation.resume(returning: ApplyOperationsResponse(
          savedRecordNames: savedRecordNames,
          failed: failures,
          serverChanged: serverChanged
        ))
      case .failure(let error):
        if let ckError = error as? CKError, ckError.code == .partialFailure {
          continuation.resume(returning: ApplyOperationsResponse(
            savedRecordNames: savedRecordNames,
            failed: failures,
            serverChanged: serverChanged
          ))
        } else {
          continuation.resume(throwing: error)
        }
      }
    }

    privateDatabase().add(operation)
  }
}

private func mapAccountStatus(_ status: CKAccountStatus) -> String {
  switch status {
  case .available:
    return "available"
  case .noAccount:
    return "no_account"
  case .restricted:
    return "restricted"
  case .temporarilyUnavailable:
    return "temporarily_unavailable"
  case .couldNotDetermine:
    return "could_not_determine"
  @unknown default:
    return "unknown"
  }
}

private func makeDocumentRecord(_ document: BridgeDocumentRecord, zoneID: CKRecordZone.ID) -> CKRecord {
  let recordID = CKRecord.ID(recordName: "doc:\(document.documentId)", zoneID: zoneID)
  let record = CKRecord(recordType: documentRecordType, recordID: recordID)
  record["documentId"] = document.documentId as CKRecordValue
  record["title"] = document.title as CKRecordValue
  record["blockTintOverride"] = document.blockTintOverride as? CKRecordValue
  record["documentSurfaceToneOverride"] = document.documentSurfaceToneOverride as? CKRecordValue
  record["updatedAtMs"] = NSNumber(value: document.updatedAtMs)
  record["updatedByDeviceId"] = document.updatedByDeviceId as CKRecordValue
  return record
}

private func makeBlockRecord(_ block: BridgeBlockRecord, zoneID: CKRecordZone.ID) -> CKRecord {
  let recordID = CKRecord.ID(recordName: "blk:\(block.blockId)", zoneID: zoneID)
  let record = CKRecord(recordType: blockRecordType, recordID: recordID)
  record["blockId"] = block.blockId as CKRecordValue
  record["documentId"] = block.documentId as CKRecordValue
  record["kind"] = block.kind as CKRecordValue
  record["content"] = block.content as CKRecordValue
  record["language"] = block.language as? CKRecordValue
  record["position"] = NSNumber(value: block.position)
  record["updatedAtMs"] = NSNumber(value: block.updatedAtMs)
  record["updatedByDeviceId"] = block.updatedByDeviceId as CKRecordValue
  return record
}

private func makeDocumentTombstoneRecord(_ tombstone: BridgeDocumentTombstoneRecord, zoneID: CKRecordZone.ID) -> CKRecord {
  let recordID = CKRecord.ID(recordName: "dt:\(tombstone.documentId)", zoneID: zoneID)
  let record = CKRecord(recordType: documentTombstoneRecordType, recordID: recordID)
  record["documentId"] = tombstone.documentId as CKRecordValue
  record["deletedAtMs"] = NSNumber(value: tombstone.deletedAtMs)
  record["deletedByDeviceId"] = tombstone.deletedByDeviceId as CKRecordValue
  return record
}

private func makeBlockTombstoneRecord(_ tombstone: BridgeBlockTombstoneRecord, zoneID: CKRecordZone.ID) -> CKRecord {
  let recordID = CKRecord.ID(recordName: "bt:\(tombstone.blockId)", zoneID: zoneID)
  let record = CKRecord(recordType: blockTombstoneRecordType, recordID: recordID)
  record["blockId"] = tombstone.blockId as CKRecordValue
  record["documentId"] = tombstone.documentId as CKRecordValue
  record["deletedAtMs"] = NSNumber(value: tombstone.deletedAtMs)
  record["deletedByDeviceId"] = tombstone.deletedByDeviceId as CKRecordValue
  return record
}

private func decodeDocument(record: CKRecord) -> BridgeDocumentRecord? {
  guard
    let documentId = record["documentId"] as? String,
    let title = record["title"] as? String,
    let updatedAtMs = (record["updatedAtMs"] as? NSNumber)?.int64Value,
    let updatedByDeviceId = record["updatedByDeviceId"] as? String
  else {
    return nil
  }

  return BridgeDocumentRecord(
    documentId: documentId,
    title: title,
    blockTintOverride: record["blockTintOverride"] as? String,
    documentSurfaceToneOverride: record["documentSurfaceToneOverride"] as? String,
    updatedAtMs: updatedAtMs,
    updatedByDeviceId: updatedByDeviceId
  )
}

private func decodeBlock(record: CKRecord) -> BridgeBlockRecord? {
  guard
    let blockId = record["blockId"] as? String,
    let documentId = record["documentId"] as? String,
    let kind = record["kind"] as? String,
    let content = record["content"] as? String,
    let position = (record["position"] as? NSNumber)?.int64Value,
    let updatedAtMs = (record["updatedAtMs"] as? NSNumber)?.int64Value,
    let updatedByDeviceId = record["updatedByDeviceId"] as? String
  else {
    return nil
  }

  return BridgeBlockRecord(
    blockId: blockId,
    documentId: documentId,
    kind: kind,
    content: content,
    language: record["language"] as? String,
    position: position,
    updatedAtMs: updatedAtMs,
    updatedByDeviceId: updatedByDeviceId
  )
}

private func decodeDocumentTombstone(record: CKRecord) -> BridgeDocumentTombstoneRecord? {
  guard
    let documentId = record["documentId"] as? String,
    let deletedAtMs = (record["deletedAtMs"] as? NSNumber)?.int64Value,
    let deletedByDeviceId = record["deletedByDeviceId"] as? String
  else {
    return nil
  }

  return BridgeDocumentTombstoneRecord(
    documentId: documentId,
    deletedAtMs: deletedAtMs,
    deletedByDeviceId: deletedByDeviceId
  )
}

private func decodeBlockTombstone(record: CKRecord) -> BridgeBlockTombstoneRecord? {
  guard
    let blockId = record["blockId"] as? String,
    let documentId = record["documentId"] as? String,
    let deletedAtMs = (record["deletedAtMs"] as? NSNumber)?.int64Value,
    let deletedByDeviceId = record["deletedByDeviceId"] as? String
  else {
    return nil
  }

  return BridgeBlockTombstoneRecord(
    blockId: blockId,
    documentId: documentId,
    deletedAtMs: deletedAtMs,
    deletedByDeviceId: deletedByDeviceId
  )
}

private func encodeToken(_ token: CKServerChangeToken) throws -> String {
  let data = try NSKeyedArchiver.archivedData(withRootObject: token, requiringSecureCoding: true)
  return data.base64EncodedString()
}

private func decodeToken(_ value: String) throws -> CKServerChangeToken {
  guard let data = Data(base64Encoded: value) else {
    throw BridgeError.invalidToken
  }
  guard let token = try NSKeyedUnarchiver.unarchivedObject(ofClass: CKServerChangeToken.self, from: data) else {
    throw BridgeError.invalidToken
  }
  return token
}

private func appendServerChanged(from error: Error, into storage: inout ServerChangedRecords) {
  guard
    let ckError = error as? CKError,
    ckError.code == .serverRecordChanged,
    let record = ckError.userInfo[CKRecordChangedErrorServerRecordKey] as? CKRecord
  else {
    return
  }

  switch record.recordType {
  case documentRecordType:
    if let value = decodeDocument(record: record) {
      storage.documents.append(value)
    }
  case blockRecordType:
    if let value = decodeBlock(record: record) {
      storage.blocks.append(value)
    }
  case documentTombstoneRecordType:
    if let value = decodeDocumentTombstone(record: record) {
      storage.documentTombstones.append(value)
    }
  case blockTombstoneRecordType:
    if let value = decodeBlockTombstone(record: record) {
      storage.blockTombstones.append(value)
    }
  default:
    break
  }
}

private func codeString(for error: Error) -> String {
  if let ckError = error as? CKError {
    return "ck_\(ckError.code.rawValue)"
  }
  return "bridge_error"
}
