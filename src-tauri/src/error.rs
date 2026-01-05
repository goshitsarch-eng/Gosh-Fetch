use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
    #[error("aria2 error: {0}")]
    Aria2(String),

    #[error("aria2 not running")]
    Aria2NotRunning,

    #[error("aria2 connection failed: {0}")]
    Aria2Connection(String),

    #[error("database error: {0}")]
    Database(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("tauri error: {0}")]
    Tauri(#[from] tauri::Error),

    #[error("invalid input: {0}")]
    InvalidInput(String),

    #[error("not found: {0}")]
    NotFound(String),

    #[error("network error: {0}")]
    Network(String),
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, Error>;
