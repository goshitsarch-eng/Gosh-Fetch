use crate::types::DownloadType;
use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri::Manager;

#[derive(Clone)]
pub struct Database {
    db_path: String,
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
            user_agent: "Gosh-Fetch/1.0".to_string(),
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
    pub async fn new(app: &AppHandle) -> Result<Self> {
        let app_data = app
            .path()
            .app_data_dir()
            .map_err(|e| Error::Database(e.to_string()))?;
        std::fs::create_dir_all(&app_data)?;

        let db_path = app_data.join("gosh-fetch.db");
        let db_path_str = db_path.to_string_lossy().to_string();

        // Note: SQL plugin is initialized in main.rs via tauri.conf.json
        // This just returns the database path for reference

        Ok(Self {
            db_path: db_path_str,
        })
    }

    pub fn get_path(&self) -> &str {
        &self.db_path
    }
}

// Helper functions for database operations
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
