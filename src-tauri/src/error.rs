use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("state lock failed")]
    StateLock,
    #[error("{0}")]
    Validation(String),
}

impl AppError {
    pub fn validation(message: impl Into<String>) -> Self {
        Self::Validation(message.into())
    }
}

#[derive(Debug, Error)]
pub enum StartupError {
    #[error("앱 데이터 디렉터리를 찾지 못했습니다.")]
    ResolveAppDataDir,
    #[error("앱 데이터 디렉터리를 준비하지 못했습니다: {0}")]
    PrepareAppDataDir(#[source] std::io::Error),
    #[error("앱 저장소를 초기화하지 못했습니다: {0}")]
    InitializeState(#[source] AppError),
    #[error("저장된 설정을 읽지 못했습니다: {0}")]
    LoadSettings(#[source] AppError),
    #[error("창 초기 설정을 적용하지 못했습니다: {0}")]
    ApplyWindowPreferences(String),
}
