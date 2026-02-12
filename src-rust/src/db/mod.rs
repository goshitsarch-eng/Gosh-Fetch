use crate::types::{Download, DownloadState, DownloadType};
use crate::{Error, Result};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub download_path: String,
    pub max_concurrent_downloads: u32,
    pub max_connections_per_server: u32,
    pub split_count: u32,
    pub download_speed_limit: u64,
    pub upload_speed_limit: u64,
    pub user_agent: String,
    pub enable_notifications: bool,
    pub close_to_tray: bool,
    pub theme: String,
    pub bt_enable_dht: bool,
    pub bt_enable_pex: bool,
    pub bt_enable_lpd: bool,
    pub bt_max_peers: u32,
    pub bt_seed_ratio: f64,
    pub auto_update_trackers: bool,
    pub delete_files_on_remove: bool,
    #[serde(default)]
    pub proxy_url: String,
    #[serde(default = "default_connect_timeout")]
    pub connect_timeout: u64,
    #[serde(default = "default_read_timeout")]
    pub read_timeout: u64,
    #[serde(default = "default_max_retries")]
    pub max_retries: u32,
    #[serde(default = "default_allocation_mode")]
    pub allocation_mode: String,
}

fn default_connect_timeout() -> u64 { 30 }
fn default_read_timeout() -> u64 { 60 }
fn default_max_retries() -> u32 { 3 }
fn default_allocation_mode() -> String { "sparse".to_string() }

impl Default for Settings {
    fn default() -> Self {
        Self {
            download_path: dirs::download_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| {
                    dirs::home_dir()
                        .map(|h| h.join("Downloads").to_string_lossy().to_string())
                        .unwrap_or_else(|| "Downloads".to_string())
                }),
            max_concurrent_downloads: 5,
            max_connections_per_server: 8,
            split_count: 8,
            download_speed_limit: 0,
            upload_speed_limit: 0,
            user_agent: "gosh-dl/0.1.0".to_string(),
            enable_notifications: true,
            close_to_tray: true,
            theme: "dark".to_string(),
            bt_enable_dht: true,
            bt_enable_pex: true,
            bt_enable_lpd: true,
            bt_max_peers: 55,
            bt_seed_ratio: 1.0,
            auto_update_trackers: true,
            delete_files_on_remove: false,
            proxy_url: String::new(),
            connect_timeout: 30,
            read_timeout: 60,
            max_retries: 3,
            allocation_mode: "sparse".to_string(),
        }
    }
}

/// Expand leading `~` in a path string to the user's home directory.
fn expand_tilde(path: &str) -> String {
    if path.starts_with("~/") || path == "~" {
        if let Some(home) = dirs::home_dir() {
            return path.replacen("~", &home.to_string_lossy(), 1);
        }
    }
    path.to_string()
}

impl Database {
    pub fn new(data_dir: &Path) -> Result<Self> {
        std::fs::create_dir_all(data_dir)?;
        let db_path = data_dir.join("gosh-fetch.db");
        let conn = Connection::open(&db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.run_migrations_sync()?;
        Ok(db)
    }

    /// Run a closure with the database connection on a blocking thread.
    /// This moves all blocking mutex + SQLite I/O off the Tokio runtime threads.
    async fn with_conn<F, R>(&self, f: F) -> Result<R>
    where
        F: FnOnce(&Connection) -> Result<R> + Send + 'static,
        R: Send + 'static,
    {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || {
            let conn = conn.lock().map_err(|e| Error::Database(e.to_string()))?;
            f(&conn)
        })
        .await
        .map_err(|e| Error::Database(e.to_string()))?
    }

    /// Synchronous migration -- called only once during Database::new() (not on Tokio runtime yet).
    /// Checks schema_version table to skip already-applied migrations.
    fn run_migrations_sync(&self) -> Result<()> {
        let conn = self.conn.lock().map_err(|e| Error::Database(e.to_string()))?;

        // Check if schema_version table exists and what version we're at
        let current_version: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_version",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0); // Table doesn't exist yet => version 0

        if current_version < 1 {
            let migration_sql = include_str!("../../migrations/001_initial.sql");
            conn.execute_batch(migration_sql)?;
            log::info!("Applied migration 001_initial.sql");
        }

        // Future migrations go here:
        // if current_version < 2 {
        //     let sql = include_str!("../../migrations/002_xxx.sql");
        //     conn.execute_batch(sql)?;
        // }

        Ok(())
    }

    pub fn get_settings(&self) -> Result<Settings> {
        let conn = self.conn.lock().map_err(|e| Error::Database(e.to_string()))?;
        Self::get_settings_inner(&conn)
    }

    pub async fn get_settings_async(&self) -> Result<Settings> {
        self.with_conn(|conn| Self::get_settings_inner(conn)).await
    }

    fn get_settings_inner(conn: &Connection) -> Result<Settings> {
        let mut settings = Settings::default();

        let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;

        for row in rows {
            let (key, value) = row?;
            match key.as_str() {
                "download_path" => settings.download_path = expand_tilde(&value),
                "max_concurrent_downloads" => {
                    settings.max_concurrent_downloads = value.parse().unwrap_or(5)
                }
                "max_connections_per_server" => {
                    settings.max_connections_per_server = value.parse().unwrap_or(8)
                }
                "split_count" => settings.split_count = value.parse().unwrap_or(8),
                "download_speed_limit" => {
                    settings.download_speed_limit = value.parse().unwrap_or(0)
                }
                "upload_speed_limit" => {
                    settings.upload_speed_limit = value.parse().unwrap_or(0)
                }
                "user_agent" => settings.user_agent = value,
                "enable_notifications" => settings.enable_notifications = value == "true",
                "close_to_tray" => settings.close_to_tray = value == "true",
                "theme" => settings.theme = value,
                "bt_enable_dht" => settings.bt_enable_dht = value == "true",
                "bt_enable_pex" => settings.bt_enable_pex = value == "true",
                "bt_enable_lpd" => settings.bt_enable_lpd = value == "true",
                "bt_max_peers" => settings.bt_max_peers = value.parse().unwrap_or(55),
                "bt_seed_ratio" => settings.bt_seed_ratio = value.parse().unwrap_or(1.0),
                "auto_update_trackers" => settings.auto_update_trackers = value == "true",
                "delete_files_on_remove" => settings.delete_files_on_remove = value == "true",
                "proxy_url" => settings.proxy_url = value,
                "connect_timeout" => settings.connect_timeout = value.parse().unwrap_or(30),
                "read_timeout" => settings.read_timeout = value.parse().unwrap_or(60),
                "max_retries" => settings.max_retries = value.parse().unwrap_or(3),
                "allocation_mode" => settings.allocation_mode = value,
                _ => {}
            }
        }

        Ok(settings)
    }

    pub async fn save_settings_async(&self, settings: Settings) -> Result<()> {
        self.with_conn(move |conn| {
            let pairs: Vec<(&str, String)> = vec![
                ("download_path", settings.download_path.clone()),
                ("max_concurrent_downloads", settings.max_concurrent_downloads.to_string()),
                ("max_connections_per_server", settings.max_connections_per_server.to_string()),
                ("split_count", settings.split_count.to_string()),
                ("download_speed_limit", settings.download_speed_limit.to_string()),
                ("upload_speed_limit", settings.upload_speed_limit.to_string()),
                ("user_agent", settings.user_agent.clone()),
                ("enable_notifications", settings.enable_notifications.to_string()),
                ("close_to_tray", settings.close_to_tray.to_string()),
                ("theme", settings.theme.clone()),
                ("bt_enable_dht", settings.bt_enable_dht.to_string()),
                ("bt_enable_pex", settings.bt_enable_pex.to_string()),
                ("bt_enable_lpd", settings.bt_enable_lpd.to_string()),
                ("bt_max_peers", settings.bt_max_peers.to_string()),
                ("bt_seed_ratio", settings.bt_seed_ratio.to_string()),
                ("auto_update_trackers", settings.auto_update_trackers.to_string()),
                ("delete_files_on_remove", settings.delete_files_on_remove.to_string()),
                ("proxy_url", settings.proxy_url.clone()),
                ("connect_timeout", settings.connect_timeout.to_string()),
                ("read_timeout", settings.read_timeout.to_string()),
                ("max_retries", settings.max_retries.to_string()),
                ("allocation_mode", settings.allocation_mode.clone()),
            ];

            let tx = conn.unchecked_transaction()?;
            for (key, value) in pairs {
                tx.execute(
                    "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))",
                    params![key, value],
                )?;
            }
            tx.commit()?;

            Ok(())
        }).await
    }

    pub async fn get_completed_downloads_async(&self) -> Result<Vec<Download>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT * FROM downloads WHERE status = 'complete' ORDER BY completed_at DESC LIMIT 100",
            )?;
            let downloads = stmt
                .query_map([], |row| Ok(row_to_download(row)))?
                .filter_map(|r| r.ok())
                .collect();
            Ok(downloads)
        }).await
    }

    pub async fn save_download_async(&self, download: Download) -> Result<()> {
        self.with_conn(move |conn| {
            let selected_files_json = download
                .selected_files
                .as_ref()
                .map(|f| serde_json::to_string(f).unwrap_or_default());

            conn.execute(
                "INSERT OR REPLACE INTO downloads
                 (gid, name, url, magnet_uri, info_hash, download_type, status, total_size, completed_size,
                  download_speed, upload_speed, save_path, created_at, completed_at, error_message, selected_files)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
                params![
                    download.gid,
                    download.name,
                    download.url,
                    download.magnet_uri,
                    download.info_hash,
                    download.download_type.to_string(),
                    download.status.to_string(),
                    download.total_size as i64,
                    download.completed_size as i64,
                    download.download_speed as i64,
                    download.upload_speed as i64,
                    download.save_path,
                    download.created_at,
                    download.completed_at,
                    download.error_message,
                    selected_files_json,
                ],
            )?;
            Ok(())
        }).await
    }

    pub async fn remove_download_async(&self, gid: String) -> Result<()> {
        self.with_conn(move |conn| {
            conn.execute("DELETE FROM downloads WHERE gid = ?1", params![gid])?;
            Ok(())
        }).await
    }

    pub async fn clear_history_async(&self) -> Result<()> {
        self.with_conn(|conn| {
            conn.execute("DELETE FROM downloads WHERE status = 'complete'", [])?;
            Ok(())
        }).await
    }

    pub async fn get_incomplete_downloads_async(&self) -> Result<Vec<Download>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT * FROM downloads
                 WHERE status NOT IN ('complete', 'error')
                 AND (total_size <= 0 OR completed_size < total_size)
                 ORDER BY created_at ASC",
            )?;
            let downloads = stmt
                .query_map([], |row| Ok(row_to_download(row)))?
                .filter_map(|r| r.ok())
                .collect();
            Ok(downloads)
        }).await
    }
}

fn row_to_download(row: &rusqlite::Row) -> Download {
    let status_str: String = row.get::<_, String>("status").unwrap_or_default();
    let dl_type_str: String = row.get::<_, String>("download_type").unwrap_or_default();
    let selected_files_str: Option<String> = row.get::<_, Option<String>>("selected_files").unwrap_or(None);

    Download {
        id: row.get::<_, i64>("id").unwrap_or(0),
        gid: row.get::<_, String>("gid").unwrap_or_default(),
        name: row.get::<_, String>("name").unwrap_or_default(),
        url: row.get::<_, Option<String>>("url").unwrap_or(None),
        magnet_uri: row.get::<_, Option<String>>("magnet_uri").unwrap_or(None),
        info_hash: row.get::<_, Option<String>>("info_hash").unwrap_or(None),
        download_type: match dl_type_str.as_str() {
            "torrent" => DownloadType::Torrent,
            "magnet" => DownloadType::Magnet,
            _ => DownloadType::Http,
        },
        status: DownloadState::from(status_str.as_str()),
        total_size: row.get::<_, i64>("total_size").unwrap_or(0) as u64,
        completed_size: row.get::<_, i64>("completed_size").unwrap_or(0) as u64,
        download_speed: row.get::<_, i64>("download_speed").unwrap_or(0) as u64,
        upload_speed: row.get::<_, i64>("upload_speed").unwrap_or(0) as u64,
        save_path: row.get::<_, String>("save_path").unwrap_or_default(),
        created_at: row.get::<_, String>("created_at").unwrap_or_default(),
        completed_at: row.get::<_, Option<String>>("completed_at").unwrap_or(None),
        error_message: row.get::<_, Option<String>>("error_message").unwrap_or(None),
        connections: 0,
        seeders: 0,
        selected_files: selected_files_str.and_then(|s| serde_json::from_str(&s).ok()),
    }
}

pub fn download_type_from_url(url: &str) -> DownloadType {
    let lower = url.to_lowercase();
    if lower.starts_with("magnet:") {
        DownloadType::Magnet
    } else if lower.ends_with(".torrent") || lower.contains("torrent") {
        DownloadType::Torrent
    } else {
        DownloadType::Http
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> Database {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;").unwrap();
        let db = Database {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.run_migrations_sync().unwrap();
        db
    }

    #[test]
    fn test_download_type_from_url() {
        assert_eq!(download_type_from_url("https://example.com/file.zip"), DownloadType::Http);
        assert_eq!(download_type_from_url("https://example.com/file.torrent"), DownloadType::Torrent);
        assert_eq!(download_type_from_url("magnet:?xt=urn:btih:abc"), DownloadType::Magnet);
        assert_eq!(download_type_from_url("MAGNET:?xt=urn:btih:abc"), DownloadType::Magnet);
        assert_eq!(download_type_from_url("https://example.com/torrent/details"), DownloadType::Torrent);
    }

    #[test]
    fn test_expand_tilde() {
        let expanded = expand_tilde("~/Downloads");
        assert!(!expanded.starts_with("~"));
        assert!(expanded.ends_with("/Downloads"));

        assert_eq!(expand_tilde("/absolute/path"), "/absolute/path");
        assert_eq!(expand_tilde("relative/path"), "relative/path");
    }

    #[test]
    fn test_default_settings() {
        let settings = Settings::default();
        assert_eq!(settings.max_concurrent_downloads, 5);
        assert_eq!(settings.max_connections_per_server, 8);
        assert!(settings.enable_notifications);
        assert!(settings.close_to_tray);
        assert_eq!(settings.theme, "dark");
        assert!(settings.bt_enable_dht);
        assert_eq!(settings.bt_seed_ratio, 1.0);
        assert_eq!(settings.connect_timeout, 30);
        assert_eq!(settings.read_timeout, 60);
        assert_eq!(settings.max_retries, 3);
        assert_eq!(settings.allocation_mode, "sparse");
    }

    #[test]
    fn test_settings_round_trip() {
        let db = test_db();
        let settings = db.get_settings().unwrap();
        assert_eq!(settings.max_concurrent_downloads, 5);
        assert_eq!(settings.theme, "dark");
    }

    #[tokio::test]
    async fn test_settings_save_and_load() {
        let db = test_db();
        let mut settings = Settings::default();
        settings.max_concurrent_downloads = 10;
        settings.theme = "light".to_string();
        settings.proxy_url = "http://proxy:8080".to_string();

        db.save_settings_async(settings).await.unwrap();

        let loaded = db.get_settings_async().await.unwrap();
        assert_eq!(loaded.max_concurrent_downloads, 10);
        assert_eq!(loaded.theme, "light");
        assert_eq!(loaded.proxy_url, "http://proxy:8080");
    }

    #[tokio::test]
    async fn test_save_and_load_download() {
        let db = test_db();
        let download = Download {
            id: 0,
            gid: "test-gid-123".to_string(),
            name: "test-file.zip".to_string(),
            url: Some("https://example.com/file.zip".to_string()),
            magnet_uri: None,
            info_hash: None,
            download_type: DownloadType::Http,
            status: DownloadState::Complete,
            total_size: 1024,
            completed_size: 1024,
            download_speed: 0,
            upload_speed: 0,
            save_path: "/tmp/downloads".to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            completed_at: Some("2026-01-01T00:01:00Z".to_string()),
            error_message: None,
            connections: 0,
            seeders: 0,
            selected_files: None,
        };

        db.save_download_async(download).await.unwrap();

        let completed = db.get_completed_downloads_async().await.unwrap();
        assert_eq!(completed.len(), 1);
        assert_eq!(completed[0].gid, "test-gid-123");
        assert_eq!(completed[0].name, "test-file.zip");
        assert_eq!(completed[0].total_size, 1024);
    }

    #[tokio::test]
    async fn test_remove_download() {
        let db = test_db();
        let download = Download {
            id: 0,
            gid: "remove-me".to_string(),
            name: "to-remove.zip".to_string(),
            url: Some("https://example.com/file.zip".to_string()),
            magnet_uri: None,
            info_hash: None,
            download_type: DownloadType::Http,
            status: DownloadState::Complete,
            total_size: 512,
            completed_size: 512,
            download_speed: 0,
            upload_speed: 0,
            save_path: "/tmp".to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            completed_at: Some("2026-01-01T00:01:00Z".to_string()),
            error_message: None,
            connections: 0,
            seeders: 0,
            selected_files: None,
        };

        db.save_download_async(download).await.unwrap();
        assert_eq!(db.get_completed_downloads_async().await.unwrap().len(), 1);

        db.remove_download_async("remove-me".to_string()).await.unwrap();
        assert_eq!(db.get_completed_downloads_async().await.unwrap().len(), 0);
    }

    #[tokio::test]
    async fn test_clear_history() {
        let db = test_db();
        for i in 0..3 {
            let download = Download {
                id: 0,
                gid: format!("gid-{}", i),
                name: format!("file-{}.zip", i),
                url: Some("https://example.com/file.zip".to_string()),
                magnet_uri: None,
                info_hash: None,
                download_type: DownloadType::Http,
                status: DownloadState::Complete,
                total_size: 100,
                completed_size: 100,
                download_speed: 0,
                upload_speed: 0,
                save_path: "/tmp".to_string(),
                created_at: "2026-01-01T00:00:00Z".to_string(),
                completed_at: Some("2026-01-01T00:01:00Z".to_string()),
                error_message: None,
                connections: 0,
                seeders: 0,
                selected_files: None,
            };
            db.save_download_async(download).await.unwrap();
        }
        assert_eq!(db.get_completed_downloads_async().await.unwrap().len(), 3);

        db.clear_history_async().await.unwrap();
        assert_eq!(db.get_completed_downloads_async().await.unwrap().len(), 0);
    }

    #[tokio::test]
    async fn test_incomplete_downloads() {
        let db = test_db();
        // Save an active download
        let active = Download {
            id: 0,
            gid: "active-1".to_string(),
            name: "downloading.zip".to_string(),
            url: Some("https://example.com/file.zip".to_string()),
            magnet_uri: None,
            info_hash: None,
            download_type: DownloadType::Http,
            status: DownloadState::Active,
            total_size: 1000,
            completed_size: 500,
            download_speed: 0,
            upload_speed: 0,
            save_path: "/tmp".to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            completed_at: None,
            error_message: None,
            connections: 0,
            seeders: 0,
            selected_files: None,
        };
        db.save_download_async(active).await.unwrap();

        // Save a completed download
        let complete = Download {
            id: 0,
            gid: "complete-1".to_string(),
            name: "done.zip".to_string(),
            url: Some("https://example.com/done.zip".to_string()),
            magnet_uri: None,
            info_hash: None,
            download_type: DownloadType::Http,
            status: DownloadState::Complete,
            total_size: 100,
            completed_size: 100,
            download_speed: 0,
            upload_speed: 0,
            save_path: "/tmp".to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            completed_at: Some("2026-01-01T00:01:00Z".to_string()),
            error_message: None,
            connections: 0,
            seeders: 0,
            selected_files: None,
        };
        db.save_download_async(complete).await.unwrap();

        let incomplete = db.get_incomplete_downloads_async().await.unwrap();
        assert_eq!(incomplete.len(), 1);
        assert_eq!(incomplete[0].gid, "active-1");
    }

    #[test]
    fn test_migration_idempotent() {
        let db = test_db();
        // Running migrations again should not fail
        db.run_migrations_sync().unwrap();
        let settings = db.get_settings().unwrap();
        assert_eq!(settings.max_concurrent_downloads, 5);
    }
}
