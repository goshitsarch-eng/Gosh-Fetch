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
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            download_path: dirs::download_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| "~/Downloads".to_string()),
            max_concurrent_downloads: 5,
            max_connections_per_server: 16,
            split_count: 16,
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
        }
    }
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
        db.run_migrations()?;
        Ok(db)
    }

    fn run_migrations(&self) -> Result<()> {
        let conn = self.conn.lock().map_err(|e| Error::Database(e.to_string()))?;
        let migration_sql = include_str!("../migrations/001_initial.sql");
        conn.execute_batch(migration_sql)?;
        Ok(())
    }

    pub fn get_settings(&self) -> Result<Settings> {
        let conn = self.conn.lock().map_err(|e| Error::Database(e.to_string()))?;
        let mut settings = Settings::default();

        let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;

        for row in rows {
            let (key, value) = row?;
            match key.as_str() {
                "download_path" => settings.download_path = value,
                "max_concurrent_downloads" => {
                    settings.max_concurrent_downloads = value.parse().unwrap_or(5)
                }
                "max_connections_per_server" => {
                    settings.max_connections_per_server = value.parse().unwrap_or(16)
                }
                "split_count" => settings.split_count = value.parse().unwrap_or(16),
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
                _ => {}
            }
        }

        Ok(settings)
    }

    pub fn save_settings(&self, settings: &Settings) -> Result<()> {
        let conn = self.conn.lock().map_err(|e| Error::Database(e.to_string()))?;
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
        ];

        for (key, value) in pairs {
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))",
                params![key, value],
            )?;
        }

        Ok(())
    }

    pub fn get_completed_downloads(&self) -> Result<Vec<Download>> {
        let conn = self.conn.lock().map_err(|e| Error::Database(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT * FROM downloads WHERE status = 'complete' ORDER BY completed_at DESC LIMIT 100",
        )?;
        let downloads = stmt
            .query_map([], |row| Ok(row_to_download(row)))?
            .filter_map(|r| r.ok())
            .collect();
        Ok(downloads)
    }

    pub fn save_download(&self, download: &Download) -> Result<()> {
        let conn = self.conn.lock().map_err(|e| Error::Database(e.to_string()))?;
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
                download.total_size,
                download.completed_size,
                download.download_speed,
                download.upload_speed,
                download.save_path,
                download.created_at,
                download.completed_at,
                download.error_message,
                selected_files_json,
            ],
        )?;
        Ok(())
    }

    pub fn remove_download(&self, gid: &str) -> Result<()> {
        let conn = self.conn.lock().map_err(|e| Error::Database(e.to_string()))?;
        conn.execute("DELETE FROM downloads WHERE gid = ?1", params![gid])?;
        Ok(())
    }

    pub fn clear_history(&self) -> Result<()> {
        let conn = self.conn.lock().map_err(|e| Error::Database(e.to_string()))?;
        conn.execute("DELETE FROM downloads WHERE status = 'complete'", [])?;
        Ok(())
    }

    pub fn get_incomplete_downloads(&self) -> Result<Vec<Download>> {
        let conn = self.conn.lock().map_err(|e| Error::Database(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT * FROM downloads WHERE status NOT IN ('complete', 'error') ORDER BY created_at ASC",
        )?;
        let downloads = stmt
            .query_map([], |row| Ok(row_to_download(row)))?
            .filter_map(|r| r.ok())
            .collect();
        Ok(downloads)
    }
}

fn row_to_download(row: &rusqlite::Row) -> Download {
    let status_str: String = row.get(7).unwrap_or_default();
    let dl_type_str: String = row.get(6).unwrap_or_default();
    let selected_files_str: Option<String> = row.get(16).unwrap_or(None);

    Download {
        id: row.get(0).unwrap_or(0),
        gid: row.get(1).unwrap_or_default(),
        name: row.get(2).unwrap_or_default(),
        url: row.get(3).unwrap_or(None),
        magnet_uri: row.get(4).unwrap_or(None),
        info_hash: row.get(5).unwrap_or(None),
        download_type: match dl_type_str.as_str() {
            "ftp" => DownloadType::Ftp,
            "torrent" => DownloadType::Torrent,
            "magnet" => DownloadType::Magnet,
            _ => DownloadType::Http,
        },
        status: DownloadState::from(status_str.as_str()),
        total_size: row.get::<_, i64>(8).unwrap_or(0) as u64,
        completed_size: row.get::<_, i64>(9).unwrap_or(0) as u64,
        download_speed: row.get::<_, i64>(10).unwrap_or(0) as u64,
        upload_speed: row.get::<_, i64>(11).unwrap_or(0) as u64,
        save_path: row.get(12).unwrap_or_default(),
        created_at: row.get(13).unwrap_or_default(),
        completed_at: row.get(14).unwrap_or(None),
        error_message: row.get(15).unwrap_or(None),
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
    } else if lower.starts_with("ftp://") || lower.starts_with("sftp://") {
        DownloadType::Ftp
    } else {
        DownloadType::Http
    }
}
