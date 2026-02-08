use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
    #[error("download engine error: {0}")]
    Engine(String),

    #[error("engine not initialized")]
    EngineNotInitialized,

    #[error("database error: {0}")]
    Database(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("rusqlite error: {0}")]
    Rusqlite(#[from] rusqlite::Error),

    #[error("invalid input: {0}")]
    InvalidInput(String),

    #[error("not found: {0}")]
    NotFound(String),

    #[error("network error: {0}")]
    Network(String),
}

impl Error {
    pub fn code(&self) -> i32 {
        match self {
            Error::Engine(_) => -1,
            Error::EngineNotInitialized => -2,
            Error::Database(_) => -3,
            Error::Io(_) => -4,
            Error::Serialization(_) => -5,
            Error::Rusqlite(_) => -6,
            Error::InvalidInput(_) => -7,
            Error::NotFound(_) => -8,
            Error::Network(_) => -9,
        }
    }
}

impl From<gosh_dl::EngineError> for Error {
    fn from(err: gosh_dl::EngineError) -> Self {
        match err {
            gosh_dl::EngineError::NotFound(msg) => Error::NotFound(msg),
            gosh_dl::EngineError::InvalidInput { field, message } => {
                Error::InvalidInput(format!("{}: {}", field, message))
            }
            gosh_dl::EngineError::Network { message, .. } => Error::Network(message),
            gosh_dl::EngineError::Storage { message, .. } => Error::Database(message),
            other => Error::Engine(other.to_string()),
        }
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_codes() {
        assert_eq!(Error::Engine("test".into()).code(), -1);
        assert_eq!(Error::EngineNotInitialized.code(), -2);
        assert_eq!(Error::Database("test".into()).code(), -3);
        assert_eq!(Error::InvalidInput("test".into()).code(), -7);
        assert_eq!(Error::NotFound("test".into()).code(), -8);
        assert_eq!(Error::Network("test".into()).code(), -9);
    }

    #[test]
    fn test_error_display() {
        let e = Error::InvalidInput("bad url".into());
        assert_eq!(e.to_string(), "invalid input: bad url");
    }

    #[test]
    fn test_error_serialize() {
        let e = Error::NotFound("missing item".into());
        let json = serde_json::to_string(&e).unwrap();
        assert!(json.contains("not found: missing item"));
    }
}
