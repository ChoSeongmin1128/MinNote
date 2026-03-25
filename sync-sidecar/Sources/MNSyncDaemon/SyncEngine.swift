import CloudKit
import Foundation

@MainActor
final class SyncEngine: NSObject {
  private let container: CKContainer
  private let database: CKDatabase
  private let localDB: LocalDatabase
  private let statePath: String
  private var engine: CKSyncEngine?
  private var lastSyncAt: Int64?
  private var lastFetchAt: Int64?
  private var lastSendAt: Int64?
  private var initialFetchCompleted = false
  private var scheduledSendTask: Task<Void, Never>?
  private let sendDebounceNanoseconds: UInt64 = 300_000_000

  init(containerIdentifier: String, dbPath: String, statePath: String) throws {
    self.container = CKContainer(identifier: containerIdentifier)
    self.database = container.privateCloudDatabase
    self.localDB = try LocalDatabase(path: dbPath)
    self.statePath = statePath
    super.init()
  }

  func start() async {
    do {
      try await ensureZoneExists()
      let serialization = loadPersistedState()
      let config = CKSyncEngine.Configuration(
        database: database,
        stateSerialization: serialization,
        delegate: self
      )
      engine = CKSyncEngine(config)
      emitCurrentStatus(state: "syncing")
      try await engine?.fetchChanges()
    } catch {
      emitMessage(ErrorMessage(message: "동기화 시작 실패: \(error.localizedDescription)"))
      emitCurrentStatus(state: "error")
    }
  }

  func notifyChanged(documentId: String) {
    engine?.state.add(pendingRecordZoneChanges: [
      .saveRecord(CKRecord.ID(recordName: documentId, zoneID: RecordMapper.zoneID))
    ])
    scheduleSend()
  }

  func notifyDeleted(documentId: String) {
    // 소프트 딜리트: deleted_at이 설정된 레코드를 업로드 (다른 기기에서도 삭제 처리)
    engine?.state.add(pendingRecordZoneChanges: [
      .saveRecord(CKRecord.ID(recordName: documentId, zoneID: RecordMapper.zoneID))
    ])
    scheduleSend()
  }

  func notifyReset() async {
    do {
      try await database.deleteRecordZone(withID: RecordMapper.zoneID)
      try await ensureZoneExists()
      initialFetchCompleted = false
      lastFetchAt = nil
      lastSendAt = nil
      emitCurrentStatus(state: "syncing")
      try await engine?.fetchChanges()
    } catch {
      emitMessage(ErrorMessage(message: "전체 초기화 실패: \(error.localizedDescription)"))
      emitCurrentStatus(state: "error")
    }
  }

  func refresh() async {
    do {
      emitCurrentStatus(state: "syncing")
      try await engine?.fetchChanges()
    } catch {
      emitMessage(ErrorMessage(message: "동기화 새로고침 실패: \(error.localizedDescription)"))
      emitCurrentStatus(state: "error")
    }
  }

  // MARK: - Private

  private func ensureZoneExists() async throws {
    let zone = CKRecordZone(zoneID: RecordMapper.zoneID)
    do {
      _ = try await database.recordZone(for: RecordMapper.zoneID)
    } catch let ckError as CKError where ckError.code == .zoneNotFound {
      _ = try await database.save(zone)
    }
  }

  private func loadPersistedState() -> CKSyncEngine.State.Serialization? {
    guard
      let data = try? Data(contentsOf: URL(fileURLWithPath: statePath)),
      let state = try? JSONDecoder().decode(CKSyncEngine.State.Serialization.self, from: data)
    else { return nil }
    return state
  }

  private func persistState(_ state: CKSyncEngine.State.Serialization) {
    guard let data = try? JSONEncoder().encode(state) else { return }
    try? data.write(to: URL(fileURLWithPath: statePath), options: .atomic)
  }

  private func emitCurrentStatus(state: String) {
    emitMessage(
      StatusMessage(
        state: state,
        lastSyncAt: lastSyncAt,
        lastFetchAt: lastFetchAt,
        lastSendAt: lastSendAt,
        initialFetchCompleted: initialFetchCompleted
      )
    )
  }

  private func scheduleSend() {
    scheduledSendTask?.cancel()
    scheduledSendTask = Task { @MainActor [weak self] in
      guard let self else {
        return
      }
      do {
        try await Task.sleep(nanoseconds: self.sendDebounceNanoseconds)
      } catch {
        return
      }

      await self.sendPendingChanges()
    }
  }

  private func sendPendingChanges() async {
    do {
      try await engine?.sendChanges()
    } catch {
      emitMessage(ErrorMessage(message: "업로드 실패: \(error.localizedDescription)"))
      emitCurrentStatus(state: "error")
    }
  }
}

// MARK: - CKSyncEngineDelegate

extension SyncEngine: CKSyncEngineDelegate {
  nonisolated func nextRecordZoneChangeBatch(
    _ context: CKSyncEngine.SendChangesContext,
    syncEngine: CKSyncEngine
  ) async -> CKSyncEngine.RecordZoneChangeBatch? {
    let pendingChanges = syncEngine.state.pendingRecordZoneChanges
    guard !pendingChanges.isEmpty else { return nil }

    let db = await MainActor.run { self.localDB }

    return await CKSyncEngine.RecordZoneChangeBatch(pendingChanges: pendingChanges) { recordID in
      let docId = recordID.recordName
      guard let document = await db.fetchDocument(id: docId) else { return nil }
      let blocks = await db.fetchBlocks(documentId: docId)
      return RecordMapper.toRecord(document: document, blocks: blocks)
    }
  }

  nonisolated func handleEvent(
    _ event: CKSyncEngine.Event,
    syncEngine: CKSyncEngine
  ) async {
    switch event {

    case .stateUpdate(let e):
      await MainActor.run { self.persistState(e.stateSerialization) }

    case .accountChange(let e):
      switch e.changeType {
      case .signOut:
        await MainActor.run {
          emitMessage(ErrorMessage(message: "iCloud 계정에서 로그아웃되었습니다."))
          self.emitCurrentStatus(state: "error")
        }
      default: break
      }

    case .willFetchChanges:
      await MainActor.run {
        self.emitCurrentStatus(state: "syncing")
      }

    case .fetchedRecordZoneChanges(let e):
      var remoteDocuments: [RemoteDocument] = []
      for modification in e.modifications {
        if let doc = RecordMapper.toRemoteDocument(record: modification.record) {
          remoteDocuments.append(doc)
        }
      }
      if !remoteDocuments.isEmpty {
        await MainActor.run { [remoteDocuments] in
          emitMessage(RemoteChangedMessage(documents: remoteDocuments))
        }
      }

    case .didFetchChanges:
      await MainActor.run {
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        self.lastSyncAt = now
        self.lastFetchAt = now
        self.initialFetchCompleted = true
        self.emitCurrentStatus(state: "idle")
      }

    case .sentRecordZoneChanges(let e):
      if !e.savedRecords.isEmpty {
        await MainActor.run {
          let now = Int64(Date().timeIntervalSince1970 * 1000)
          self.lastSyncAt = now
          self.lastSendAt = now
          self.emitCurrentStatus(state: "idle")
        }
      }
      if let failed = e.failedRecordSaves.first {
        let error = failed.error
        await MainActor.run {
          emitMessage(ErrorMessage(message: "업로드 실패: \(error.localizedDescription)"))
        }
      }

    default:
      break
    }
  }
}
