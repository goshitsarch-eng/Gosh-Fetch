//! SQLite Storage Implementation
//!
//! Provides persistent storage using SQLite with WAL mode for crash safety.

use super::{Segment, SegmentState, Storage};
use crate::error::{EngineError, Result};
use crate::types::{
    DownloadId, DownloadKind, DownloadMetadata, DownloadProgress, DownloadState, DownloadStatus,
};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Mutex;

/// SQLite-based storage for download persistence
pub struct SqliteStorage {
    conn: Arc<Mutex<Connection>>,
}

impl SqliteStorage {
    /// Create a new SQLite storage at the given path
    pub async fn new(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();

        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                tokio::fs::create_dir_all(parent).await.map_err(|e| {
                    EngineError::Database(format!("Failed to create database directory: {}", e))
                })?;
            }
        }

        let path = path.to_path_buf();
        let conn = tokio::task::spawn_blocking(move || -> Result<Connection> {
            let conn = Connection::open(&path)?;

            // Enable WAL mode for better concurrency and crash safety
            conn.pragma_update(None, "journal_mode", "WAL")?;
            conn.pragma_update(None, "synchronous", "NORMAL")?;
            conn.pragma_update(None, "foreign_keys", "ON")?;

            // Create tables
            conn.execute_batch(SCHEMA)?;

            Ok(conn)
        })
        .await
        .map_err(|e| EngineError::Database(format!("Failed to initialize database: {}", e)))??;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// Create an in-memory SQLite database (for testing)
    pub async fn in_memory() -> Result<Self> {
        let conn = tokio::task::spawn_blocking(move || -> Result<Connection> {
            let conn = Connection::open_in_memory()?;
            conn.pragma_update(None, "foreign_keys", "ON")?;
            conn.execute_batch(SCHEMA)?;
            Ok(conn)
        })
        .await
        .map_err(|e| EngineError::Database(format!("Failed to create in-memory database: {}", e)))??;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }
}

/// Database schema
const SCHEMA: &str = r#"
-- Downloads table
CREATE TABLE IF NOT EXISTS downloads (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    state TEXT NOT NULL,
    state_error_kind TEXT,
    state_error_message TEXT,
    state_error_retryable INTEGER,

    -- Progress
    total_size INTEGER,
    completed_size INTEGER NOT NULL DEFAULT 0,
    download_speed INTEGER NOT NULL DEFAULT 0,
    upload_speed INTEGER NOT NULL DEFAULT 0,
    connections INTEGER NOT NULL DEFAULT 0,
    seeders INTEGER NOT NULL DEFAULT 0,
    peers INTEGER NOT NULL DEFAULT 0,

    -- Metadata
    name TEXT NOT NULL,
    url TEXT,
    magnet_uri TEXT,
    info_hash TEXT,
    save_dir TEXT NOT NULL,
    filename TEXT,
    user_agent TEXT,
    referer TEXT,
    headers_json TEXT,

    -- Timestamps
    created_at TEXT NOT NULL,
    completed_at TEXT
);

-- Segments table for HTTP multi-connection downloads
CREATE TABLE IF NOT EXISTS segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    download_id TEXT NOT NULL,
    segment_index INTEGER NOT NULL,
    start_byte INTEGER NOT NULL,
    end_byte INTEGER NOT NULL,
    downloaded INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL,
    error_message TEXT,
    error_retries INTEGER DEFAULT 0,

    FOREIGN KEY (download_id) REFERENCES downloads(id) ON DELETE CASCADE,
    UNIQUE (download_id, segment_index)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_downloads_state ON downloads(state);
CREATE INDEX IF NOT EXISTS idx_downloads_kind ON downloads(kind);
CREATE INDEX IF NOT EXISTS idx_segments_download ON segments(download_id);
"#;

#[async_trait]
impl Storage for SqliteStorage {
    async fn save_download(&self, status: &DownloadStatus) -> Result<()> {
        let conn = self.conn.clone();
        let status = status.clone();

        tokio::task::spawn_blocking(move || -> Result<()> {
            let conn = conn.blocking_lock();

            // Serialize state
            let (state_str, error_kind, error_msg, error_retryable) = match &status.state {
                DownloadState::Queued => ("queued", None, None, None),
                DownloadState::Connecting => ("connecting", None, None, None),
                DownloadState::Downloading => ("downloading", None, None, None),
                DownloadState::Seeding => ("seeding", None, None, None),
                DownloadState::Paused => ("paused", None, None, None),
                DownloadState::Completed => ("completed", None, None, None),
                DownloadState::Error {
                    kind,
                    message,
                    retryable,
                } => ("error", Some(kind.clone()), Some(message.clone()), Some(*retryable)),
            };

            // Serialize kind
            let kind_str = match status.kind {
                DownloadKind::Http => "http",
                DownloadKind::Torrent => "torrent",
                DownloadKind::Magnet => "magnet",
            };

            // Serialize headers to JSON
            let headers_json = serde_json::to_string(&status.metadata.headers)
                .unwrap_or_else(|_| "[]".to_string());

            conn.execute(
                r#"
                INSERT INTO downloads (
                    id, kind, state, state_error_kind, state_error_message, state_error_retryable,
                    total_size, completed_size, download_speed, upload_speed, connections, seeders, peers,
                    name, url, magnet_uri, info_hash, save_dir, filename, user_agent, referer, headers_json,
                    created_at, completed_at
                ) VALUES (
                    ?1, ?2, ?3, ?4, ?5, ?6,
                    ?7, ?8, ?9, ?10, ?11, ?12, ?13,
                    ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22,
                    ?23, ?24
                )
                ON CONFLICT(id) DO UPDATE SET
                    state = excluded.state,
                    state_error_kind = excluded.state_error_kind,
                    state_error_message = excluded.state_error_message,
                    state_error_retryable = excluded.state_error_retryable,
                    total_size = excluded.total_size,
                    completed_size = excluded.completed_size,
                    download_speed = excluded.download_speed,
                    upload_speed = excluded.upload_speed,
                    connections = excluded.connections,
                    seeders = excluded.seeders,
                    peers = excluded.peers,
                    filename = excluded.filename,
                    completed_at = excluded.completed_at
                "#,
                params![
                    status.id.as_uuid().to_string(),
                    kind_str,
                    state_str,
                    error_kind,
                    error_msg,
                    error_retryable,
                    status.progress.total_size,
                    status.progress.completed_size as i64,
                    status.progress.download_speed as i64,
                    status.progress.upload_speed as i64,
                    status.progress.connections as i64,
                    status.progress.seeders as i64,
                    status.progress.peers as i64,
                    status.metadata.name,
                    status.metadata.url,
                    status.metadata.magnet_uri,
                    status.metadata.info_hash,
                    status.metadata.save_dir.to_string_lossy().to_string(),
                    status.metadata.filename,
                    status.metadata.user_agent,
                    status.metadata.referer,
                    headers_json,
                    status.created_at.to_rfc3339(),
                    status.completed_at.map(|t| t.to_rfc3339()),
                ],
            )?;

            Ok(())
        })
        .await
        .map_err(|e| EngineError::Database(format!("Failed to save download: {}", e)))?
    }

    async fn load_download(&self, id: DownloadId) -> Result<Option<DownloadStatus>> {
        let conn = self.conn.clone();
        let id_str = id.as_uuid().to_string();

        tokio::task::spawn_blocking(move || -> Result<Option<DownloadStatus>> {
            let conn = conn.blocking_lock();

            let result: Option<DownloadStatus> = conn
                .query_row(
                    r#"
                    SELECT
                        id, kind, state, state_error_kind, state_error_message, state_error_retryable,
                        total_size, completed_size, download_speed, upload_speed, connections, seeders, peers,
                        name, url, magnet_uri, info_hash, save_dir, filename, user_agent, referer, headers_json,
                        created_at, completed_at
                    FROM downloads
                    WHERE id = ?1
                    "#,
                    params![id_str],
                    |row| {
                        row_to_status(row)
                    },
                )
                .optional()?;

            Ok(result)
        })
        .await
        .map_err(|e| EngineError::Database(format!("Failed to load download: {}", e)))?
    }

    async fn load_all(&self) -> Result<Vec<DownloadStatus>> {
        let conn = self.conn.clone();

        tokio::task::spawn_blocking(move || -> Result<Vec<DownloadStatus>> {
            let conn = conn.blocking_lock();

            let mut stmt = conn.prepare(
                r#"
                SELECT
                    id, kind, state, state_error_kind, state_error_message, state_error_retryable,
                    total_size, completed_size, download_speed, upload_speed, connections, seeders, peers,
                    name, url, magnet_uri, info_hash, save_dir, filename, user_agent, referer, headers_json,
                    created_at, completed_at
                FROM downloads
                ORDER BY created_at DESC
                "#,
            )?;

            let iter = stmt.query_map([], row_to_status)?;

            let mut results = Vec::new();
            for status in iter {
                results.push(status?);
            }

            Ok(results)
        })
        .await
        .map_err(|e| EngineError::Database(format!("Failed to load all downloads: {}", e)))?
    }

    async fn delete_download(&self, id: DownloadId) -> Result<()> {
        let conn = self.conn.clone();
        let id_str = id.as_uuid().to_string();

        tokio::task::spawn_blocking(move || -> Result<()> {
            let conn = conn.blocking_lock();
            conn.execute("DELETE FROM downloads WHERE id = ?1", params![id_str])?;
            Ok(())
        })
        .await
        .map_err(|e| EngineError::Database(format!("Failed to delete download: {}", e)))?
    }

    async fn save_segments(&self, id: DownloadId, segments: &[Segment]) -> Result<()> {
        let conn = self.conn.clone();
        let id_str = id.as_uuid().to_string();
        let segments = segments.to_vec();

        tokio::task::spawn_blocking(move || -> Result<()> {
            let conn = conn.blocking_lock();

            // Delete existing segments first
            conn.execute(
                "DELETE FROM segments WHERE download_id = ?1",
                params![id_str],
            )?;

            // Insert new segments
            let mut stmt = conn.prepare(
                r#"
                INSERT INTO segments (download_id, segment_index, start_byte, end_byte, downloaded, state, error_message, error_retries)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                "#,
            )?;

            for segment in &segments {
                let (state_str, error_msg, retries) = match &segment.state {
                    SegmentState::Pending => ("pending", None, 0),
                    SegmentState::Downloading => ("downloading", None, 0),
                    SegmentState::Completed => ("completed", None, 0),
                    SegmentState::Failed { error, retries } => {
                        ("failed", Some(error.clone()), *retries)
                    }
                };

                stmt.execute(params![
                    id_str,
                    segment.index as i64,
                    segment.start as i64,
                    segment.end as i64,
                    segment.downloaded as i64,
                    state_str,
                    error_msg,
                    retries as i64,
                ])?;
            }

            Ok(())
        })
        .await
        .map_err(|e| EngineError::Database(format!("Failed to save segments: {}", e)))?
    }

    async fn load_segments(&self, id: DownloadId) -> Result<Vec<Segment>> {
        let conn = self.conn.clone();
        let id_str = id.as_uuid().to_string();

        tokio::task::spawn_blocking(move || -> Result<Vec<Segment>> {
            let conn = conn.blocking_lock();

            let mut stmt = conn.prepare(
                r#"
                SELECT segment_index, start_byte, end_byte, downloaded, state, error_message, error_retries
                FROM segments
                WHERE download_id = ?1
                ORDER BY segment_index
                "#,
            )?;

            let iter = stmt.query_map(params![id_str], |row| {
                let index: i64 = row.get(0)?;
                let start: i64 = row.get(1)?;
                let end: i64 = row.get(2)?;
                let downloaded: i64 = row.get(3)?;
                let state_str: String = row.get(4)?;
                let error_msg: Option<String> = row.get(5)?;
                let retries: i64 = row.get(6)?;

                let state = match state_str.as_str() {
                    "pending" => SegmentState::Pending,
                    "downloading" => SegmentState::Pending, // Treat as pending on load
                    "completed" => SegmentState::Completed,
                    "failed" => SegmentState::Failed {
                        error: error_msg.unwrap_or_default(),
                        retries: retries as u32,
                    },
                    _ => SegmentState::Pending,
                };

                Ok(Segment {
                    index: index as usize,
                    start: start as u64,
                    end: end as u64,
                    downloaded: downloaded as u64,
                    state,
                })
            })?;

            let mut segments = Vec::new();
            for segment in iter {
                segments.push(segment?);
            }

            Ok(segments)
        })
        .await
        .map_err(|e| EngineError::Database(format!("Failed to load segments: {}", e)))?
    }

    async fn delete_segments(&self, id: DownloadId) -> Result<()> {
        let conn = self.conn.clone();
        let id_str = id.as_uuid().to_string();

        tokio::task::spawn_blocking(move || -> Result<()> {
            let conn = conn.blocking_lock();
            conn.execute(
                "DELETE FROM segments WHERE download_id = ?1",
                params![id_str],
            )?;
            Ok(())
        })
        .await
        .map_err(|e| EngineError::Database(format!("Failed to delete segments: {}", e)))?
    }

    async fn health_check(&self) -> Result<()> {
        let conn = self.conn.clone();

        tokio::task::spawn_blocking(move || -> Result<()> {
            let conn = conn.blocking_lock();
            // Use query_row since we're expecting a result
            let _: i64 = conn.query_row("SELECT 1", [], |row| row.get(0))?;
            Ok(())
        })
        .await
        .map_err(|e| EngineError::Database(format!("Health check failed: {}", e)))?
    }

    async fn compact(&self) -> Result<()> {
        let conn = self.conn.clone();

        tokio::task::spawn_blocking(move || -> Result<()> {
            let conn = conn.blocking_lock();
            conn.execute("VACUUM", [])?;
            Ok(())
        })
        .await
        .map_err(|e| EngineError::Database(format!("Compact failed: {}", e)))?
    }
}

/// Convert a database row to a DownloadStatus
fn row_to_status(row: &rusqlite::Row<'_>) -> rusqlite::Result<DownloadStatus> {
    let id_str: String = row.get(0)?;
    let kind_str: String = row.get(1)?;
    let state_str: String = row.get(2)?;
    let error_kind: Option<String> = row.get(3)?;
    let error_msg: Option<String> = row.get(4)?;
    let error_retryable: Option<bool> = row.get(5)?;

    let total_size: Option<i64> = row.get(6)?;
    let completed_size: i64 = row.get(7)?;
    let download_speed: i64 = row.get(8)?;
    let upload_speed: i64 = row.get(9)?;
    let connections: i64 = row.get(10)?;
    let seeders: i64 = row.get(11)?;
    let peers: i64 = row.get(12)?;

    let name: String = row.get(13)?;
    let url: Option<String> = row.get(14)?;
    let magnet_uri: Option<String> = row.get(15)?;
    let info_hash: Option<String> = row.get(16)?;
    let save_dir: String = row.get(17)?;
    let filename: Option<String> = row.get(18)?;
    let user_agent: Option<String> = row.get(19)?;
    let referer: Option<String> = row.get(20)?;
    let headers_json: Option<String> = row.get(21)?;

    let created_at_str: String = row.get(22)?;
    let completed_at_str: Option<String> = row.get(23)?;

    // Parse ID
    let uuid = uuid::Uuid::parse_str(&id_str)
        .map_err(|e| rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e)))?;
    let id = DownloadId::from_uuid(uuid);

    // Parse kind
    let kind = match kind_str.as_str() {
        "http" => DownloadKind::Http,
        "torrent" => DownloadKind::Torrent,
        "magnet" => DownloadKind::Magnet,
        _ => DownloadKind::Http,
    };

    // Parse state
    let state = match state_str.as_str() {
        "queued" => DownloadState::Queued,
        "connecting" => DownloadState::Connecting,
        "downloading" => DownloadState::Downloading,
        "seeding" => DownloadState::Seeding,
        "paused" => DownloadState::Paused,
        "completed" => DownloadState::Completed,
        "error" => DownloadState::Error {
            kind: error_kind.unwrap_or_default(),
            message: error_msg.unwrap_or_default(),
            retryable: error_retryable.unwrap_or(false),
        },
        _ => DownloadState::Queued,
    };

    // Parse headers
    let headers: Vec<(String, String)> = headers_json
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    // Parse timestamps
    let created_at = DateTime::parse_from_rfc3339(&created_at_str)
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now());

    let completed_at = completed_at_str.and_then(|s| {
        DateTime::parse_from_rfc3339(&s)
            .ok()
            .map(|dt| dt.with_timezone(&Utc))
    });

    Ok(DownloadStatus {
        id,
        kind,
        state,
        progress: DownloadProgress {
            total_size: total_size.map(|n| n as u64),
            completed_size: completed_size as u64,
            download_speed: download_speed as u64,
            upload_speed: upload_speed as u64,
            connections: connections as u32,
            seeders: seeders as u32,
            peers: peers as u32,
            eta_seconds: None,
        },
        metadata: DownloadMetadata {
            name,
            url,
            magnet_uri,
            info_hash,
            save_dir: PathBuf::from(save_dir),
            filename,
            user_agent,
            referer,
            headers,
        },
        created_at,
        completed_at,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_status() -> DownloadStatus {
        DownloadStatus {
            id: DownloadId::new(),
            kind: DownloadKind::Http,
            state: DownloadState::Downloading,
            progress: DownloadProgress {
                total_size: Some(1000),
                completed_size: 500,
                download_speed: 100,
                upload_speed: 0,
                connections: 4,
                seeders: 0,
                peers: 0,
                eta_seconds: Some(5),
            },
            metadata: DownloadMetadata {
                name: "test.zip".to_string(),
                url: Some("https://example.com/test.zip".to_string()),
                magnet_uri: None,
                info_hash: None,
                save_dir: PathBuf::from("/tmp/downloads"),
                filename: Some("test.zip".to_string()),
                user_agent: Some("gosh-dl/0.1.0".to_string()),
                referer: None,
                headers: vec![("X-Custom".to_string(), "value".to_string())],
            },
            created_at: Utc::now(),
            completed_at: None,
        }
    }

    #[tokio::test]
    async fn test_sqlite_save_load() {
        let storage = SqliteStorage::in_memory().await.unwrap();
        let status = create_test_status();
        let id = status.id;

        // Save
        storage.save_download(&status).await.unwrap();

        // Load
        let loaded = storage.load_download(id).await.unwrap().unwrap();
        assert_eq!(loaded.id, id);
        assert_eq!(loaded.metadata.name, "test.zip");
        assert_eq!(loaded.progress.completed_size, 500);
    }

    #[tokio::test]
    async fn test_sqlite_load_all() {
        let storage = SqliteStorage::in_memory().await.unwrap();

        // Save multiple
        for i in 0..5 {
            let mut status = create_test_status();
            status.metadata.name = format!("file{}.zip", i);
            storage.save_download(&status).await.unwrap();
        }

        // Load all
        let all = storage.load_all().await.unwrap();
        assert_eq!(all.len(), 5);
    }

    #[tokio::test]
    async fn test_sqlite_delete() {
        let storage = SqliteStorage::in_memory().await.unwrap();
        let status = create_test_status();
        let id = status.id;

        storage.save_download(&status).await.unwrap();
        storage.delete_download(id).await.unwrap();

        let loaded = storage.load_download(id).await.unwrap();
        assert!(loaded.is_none());
    }

    #[tokio::test]
    async fn test_sqlite_segments() {
        let storage = SqliteStorage::in_memory().await.unwrap();

        // First create a download (foreign key constraint)
        let status = create_test_status();
        let id = status.id;
        storage.save_download(&status).await.unwrap();

        let segments = vec![
            Segment::new(0, 0, 999),
            Segment {
                index: 1,
                start: 1000,
                end: 1999,
                downloaded: 500,
                state: SegmentState::Downloading,
            },
            Segment {
                index: 2,
                start: 2000,
                end: 2999,
                downloaded: 1000,
                state: SegmentState::Completed,
            },
        ];

        // Save segments
        storage.save_segments(id, &segments).await.unwrap();

        // Load segments
        let loaded = storage.load_segments(id).await.unwrap();
        assert_eq!(loaded.len(), 3);
        assert_eq!(loaded[0].start, 0);
        assert_eq!(loaded[1].downloaded, 500);
        assert!(matches!(loaded[2].state, SegmentState::Completed));
    }

    #[tokio::test]
    async fn test_sqlite_update() {
        let storage = SqliteStorage::in_memory().await.unwrap();
        let mut status = create_test_status();
        let id = status.id;

        // Save initial
        storage.save_download(&status).await.unwrap();

        // Update
        status.progress.completed_size = 800;
        status.state = DownloadState::Completed;
        status.completed_at = Some(Utc::now());
        storage.save_download(&status).await.unwrap();

        // Verify update
        let loaded = storage.load_download(id).await.unwrap().unwrap();
        assert_eq!(loaded.progress.completed_size, 800);
        assert!(matches!(loaded.state, DownloadState::Completed));
        assert!(loaded.completed_at.is_some());
    }

    #[tokio::test]
    async fn test_sqlite_health_check() {
        let storage = SqliteStorage::in_memory().await.unwrap();
        storage.health_check().await.unwrap();
    }
}
