use std::path::PathBuf;
use std::process::{Command, Stdio};

use serde::{de::DeserializeOwned, Deserialize, Serialize};

use crate::domain::models::ICloudAccountStatus;
use crate::error::AppError;

const PRIMARY_ICLOUD_CONTAINER_IDENTIFIER: &str = "iCloud.com.seongmin.madi";
const CLOUDKIT_CONTAINER_ENV: &str = "MADI_CLOUDKIT_CONTAINER_IDENTIFIER";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BridgeDocumentRecord {
    pub document_id: String,
    pub title: String,
    pub block_tint_override: Option<String>,
    pub document_surface_tone_override: Option<String>,
    pub updated_at_ms: i64,
    pub updated_by_device_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BridgeBlockRecord {
    pub block_id: String,
    pub document_id: String,
    pub kind: String,
    pub content: String,
    pub language: Option<String>,
    pub position: i64,
    pub updated_at_ms: i64,
    pub updated_by_device_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BridgeDocumentTombstoneRecord {
    pub document_id: String,
    pub deleted_at_ms: i64,
    pub deleted_by_device_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BridgeBlockTombstoneRecord {
    pub block_id: String,
    pub document_id: String,
    pub deleted_at_ms: i64,
    pub deleted_by_device_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FetchChangesRequest {
    pub zone_name: String,
    pub server_change_token: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FetchChangesResponse {
    pub documents: Vec<BridgeDocumentRecord>,
    pub blocks: Vec<BridgeBlockRecord>,
    pub document_tombstones: Vec<BridgeDocumentTombstoneRecord>,
    pub block_tombstones: Vec<BridgeBlockTombstoneRecord>,
    pub next_server_change_token: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ApplyOperationsRequest {
    pub zone_name: String,
    pub save_documents: Vec<BridgeDocumentRecord>,
    pub save_blocks: Vec<BridgeBlockRecord>,
    pub save_document_tombstones: Vec<BridgeDocumentTombstoneRecord>,
    pub save_block_tombstones: Vec<BridgeBlockTombstoneRecord>,
    pub delete_record_names: Vec<String>,
}

impl ApplyOperationsRequest {
    pub fn has_operations(&self) -> bool {
        !self.save_documents.is_empty()
            || !self.save_blocks.is_empty()
            || !self.save_document_tombstones.is_empty()
            || !self.save_block_tombstones.is_empty()
            || !self.delete_record_names.is_empty()
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BridgeFailure {
    pub record_name: String,
    pub error_code: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ServerChangedRecords {
    pub documents: Vec<BridgeDocumentRecord>,
    pub blocks: Vec<BridgeBlockRecord>,
    pub document_tombstones: Vec<BridgeDocumentTombstoneRecord>,
    pub block_tombstones: Vec<BridgeBlockTombstoneRecord>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ApplyOperationsResponse {
    pub saved_record_names: Vec<String>,
    pub failed: Vec<BridgeFailure>,
    pub server_changed: ServerChangedRecords,
}

pub struct CloudKitBridge {
    executable_path: PathBuf,
    container_identifier: String,
}

impl CloudKitBridge {
    pub fn new() -> Result<Self, AppError> {
        Self::primary()
    }

    pub fn primary() -> Result<Self, AppError> {
        let executable_path = resolve_bridge_path()?;
        Ok(Self {
            executable_path,
            container_identifier: PRIMARY_ICLOUD_CONTAINER_IDENTIFIER.to_string(),
        })
    }

    pub fn get_account_status(&self) -> Result<ICloudAccountStatus, AppError> {
        let response = self.invoke::<serde_json::Value, AccountStatusResponse>(
            "getAccountStatus",
            &serde_json::json!({}),
        )?;
        Ok(response.account_status)
    }

    pub fn ensure_zone(&self, zone_name: &str) -> Result<(), AppError> {
        self.invoke::<EnsureZoneRequest, EmptyResponse>(
            "ensureZone",
            &EnsureZoneRequest {
                zone_name: zone_name.to_string(),
            },
        )?;
        Ok(())
    }

    pub fn ensure_subscription(
        &self,
        zone_name: &str,
        subscription_id: &str,
    ) -> Result<(), AppError> {
        self.invoke::<EnsureSubscriptionRequest, EmptyResponse>(
            "ensureSubscription",
            &EnsureSubscriptionRequest {
                zone_name: zone_name.to_string(),
                subscription_id: subscription_id.to_string(),
            },
        )?;
        Ok(())
    }

    pub fn fetch_changes(
        &self,
        request: &FetchChangesRequest,
    ) -> Result<FetchChangesResponse, AppError> {
        self.invoke("fetchChanges", request)
    }

    pub fn apply_operations(
        &self,
        request: &ApplyOperationsRequest,
    ) -> Result<ApplyOperationsResponse, AppError> {
        self.invoke("applyOperations", request)
    }

    fn invoke<TReq: Serialize, TResp: DeserializeOwned>(
        &self,
        command: &str,
        payload: &TReq,
    ) -> Result<TResp, AppError> {
        let mut child = Command::new(&self.executable_path)
            .arg(command)
            .env(CLOUDKIT_CONTAINER_ENV, &self.container_identifier)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| {
                AppError::validation(format!("iCloud bridge를 실행하지 못했습니다: {error}"))
            })?;

        {
            let stdin = child
                .stdin
                .as_mut()
                .ok_or_else(|| AppError::validation("iCloud bridge stdin을 열지 못했습니다."))?;
            serde_json::to_writer(stdin, payload)?;
        }

        let output = child.wait_with_output().map_err(|error| {
            AppError::validation(format!("iCloud bridge 응답을 기다리지 못했습니다: {error}"))
        })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(AppError::validation(if stderr.is_empty() {
                "iCloud bridge가 실패했습니다.".to_string()
            } else {
                format!("iCloud bridge가 실패했습니다: {stderr}")
            }));
        }

        serde_json::from_slice(&output.stdout).map_err(AppError::from)
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EnsureZoneRequest {
    zone_name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EnsureSubscriptionRequest {
    zone_name: String,
    subscription_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AccountStatusResponse {
    account_status: ICloudAccountStatus,
}

#[derive(Debug, Deserialize)]
struct EmptyResponse {}

fn resolve_bridge_path() -> Result<PathBuf, AppError> {
    let target_triple = option_env!("MADI_TARGET_TRIPLE")
        .map(str::to_string)
        .or_else(|| std::env::var("TARGET").ok())
        .unwrap_or_else(|| "aarch64-apple-darwin".to_string());
    let sidecar_name = format!("madi-cloudkit-bridge-{target_triple}");
    let bundled_sidecar_name = "madi-cloudkit-bridge";
    let bundled_helper_app = "madi-cloudkit-bridge.app";
    let current_exe = std::env::current_exe().map_err(|error| {
        AppError::validation(format!(
            "현재 실행 파일 경로를 확인하지 못했습니다: {error}"
        ))
    })?;

    let candidates = [
        current_exe
            .parent()
            .and_then(|path| path.parent())
            .map(|path| {
                path.join("Resources")
                    .join(bundled_helper_app)
                    .join("Contents")
                    .join("MacOS")
                    .join(bundled_sidecar_name)
            }),
        current_exe.parent().map(|path| path.join(&sidecar_name)),
        current_exe
            .parent()
            .and_then(|path| path.parent())
            .map(|path| path.join("MacOS").join(&sidecar_name)),
        Some(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("binaries")
                .join(bundled_helper_app)
                .join("Contents")
                .join("MacOS")
                .join(bundled_sidecar_name),
        ),
        Some(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("binaries")
                .join(&sidecar_name),
        ),
    ];

    for candidate in candidates.into_iter().flatten() {
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    Err(AppError::validation(format!(
        "iCloud bridge 실행 파일을 찾지 못했습니다: {bundled_helper_app}"
    )))
}
