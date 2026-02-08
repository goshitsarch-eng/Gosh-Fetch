//! Types module - frontend-facing types for Gosh-Fetch
//!
//! These types define the API contract between the backend and the frontend.

use serde::{Deserialize, Serialize};

/// Download options passed from the frontend
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadOptions {
    /// Directory to save the file
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dir: Option<String>,
    /// Output filename
    #[serde(skip_serializing_if = "Option::is_none")]
    pub out: Option<String>,
    /// Number of connections/splits for this download
    #[serde(skip_serializing_if = "Option::is_none")]
    pub split: Option<String>,
    /// Number of connections per server
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_connection_per_server: Option<String>,
    /// Custom user agent
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_agent: Option<String>,
    /// Referer URL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub referer: Option<String>,
    /// Custom headers
    #[serde(skip_serializing_if = "Option::is_none")]
    pub header: Option<Vec<String>>,
    /// File indices to download (for torrents)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub select_file: Option<String>,
    /// Seed ratio for torrents
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed_ratio: Option<String>,
    /// Max download speed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_download_limit: Option<String>,
    /// Max upload speed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_upload_limit: Option<String>,
    /// Download priority (low, normal, high, critical)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<String>,
    /// Checksum for verification (format: "sha256:hex" or "md5:hex")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checksum: Option<String>,
    /// Mirror/failover URLs
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mirrors: Option<Vec<String>>,
    /// Sequential download mode (for torrents)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sequential: Option<bool>,
}

/// Global download statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalStat {
    pub download_speed: String,
    pub upload_speed: String,
    pub num_active: String,
    pub num_waiting: String,
    pub num_stopped: String,
    pub num_stopped_total: String,
}

/// Torrent file information (for display before adding)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentInfo {
    pub name: String,
    pub info_hash: String,
    pub total_size: u64,
    pub files: Vec<TorrentFile>,
    pub comment: Option<String>,
    pub creation_date: Option<i64>,
    pub announce_list: Vec<String>,
}

/// Single file in a torrent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TorrentFile {
    pub index: usize,
    pub path: String,
    pub length: u64,
}

/// Magnet link information (for display before adding)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MagnetInfo {
    pub name: Option<String>,
    pub info_hash: String,
    pub trackers: Vec<String>,
}

/// File information for a download
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadFile {
    pub index: String,
    pub path: String,
    pub length: String,
    pub completed_length: String,
    pub selected: String,
    #[serde(default)]
    pub uris: Vec<FileUri>,
}

/// URI for a file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileUri {
    pub uri: String,
    pub status: String,
}

/// Frontend-facing download model
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Download {
    pub id: i64,
    pub gid: String,
    pub name: String,
    pub url: Option<String>,
    pub magnet_uri: Option<String>,
    pub info_hash: Option<String>,
    pub download_type: DownloadType,
    pub status: DownloadState,
    pub total_size: u64,
    pub completed_size: u64,
    pub download_speed: u64,
    pub upload_speed: u64,
    pub save_path: String,
    pub created_at: String,
    pub completed_at: Option<String>,
    pub error_message: Option<String>,
    pub connections: u32,
    pub seeders: u32,
    pub selected_files: Option<Vec<usize>>,
}

/// Type of download
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DownloadType {
    Http,
    Torrent,
    Magnet,
}

impl std::fmt::Display for DownloadType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DownloadType::Http => write!(f, "http"),
            DownloadType::Torrent => write!(f, "torrent"),
            DownloadType::Magnet => write!(f, "magnet"),
        }
    }
}

/// Download state
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DownloadState {
    Active,
    Waiting,
    Paused,
    Complete,
    Error,
    Removed,
}

impl From<&str> for DownloadState {
    fn from(s: &str) -> Self {
        match s {
            "active" => DownloadState::Active,
            "waiting" => DownloadState::Waiting,
            "paused" => DownloadState::Paused,
            "complete" => DownloadState::Complete,
            "error" => DownloadState::Error,
            "removed" => DownloadState::Removed,
            _ => DownloadState::Waiting,
        }
    }
}

impl std::fmt::Display for DownloadState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DownloadState::Active => write!(f, "active"),
            DownloadState::Waiting => write!(f, "waiting"),
            DownloadState::Paused => write!(f, "paused"),
            DownloadState::Complete => write!(f, "complete"),
            DownloadState::Error => write!(f, "error"),
            DownloadState::Removed => write!(f, "removed"),
        }
    }
}
