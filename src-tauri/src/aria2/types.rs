use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadStatus {
    pub gid: String,
    pub status: String,
    pub total_length: String,
    pub completed_length: String,
    pub download_speed: String,
    pub upload_speed: String,
    pub connections: Option<String>,
    pub num_seeders: Option<String>,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub dir: String,
    #[serde(default)]
    pub files: Vec<Aria2File>,
    pub bittorrent: Option<BitTorrentInfo>,
    pub info_hash: Option<String>,
    pub following_gid: Option<String>,
    pub verified_length: Option<String>,
    pub verify_integrity_pending: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Aria2File {
    pub index: String,
    pub path: String,
    pub length: String,
    pub completed_length: String,
    pub selected: String,
    #[serde(default)]
    pub uris: Vec<Aria2Uri>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Aria2Uri {
    pub uri: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BitTorrentInfo {
    pub announce_list: Option<Vec<Vec<String>>>,
    pub comment: Option<String>,
    pub creation_date: Option<i64>,
    pub mode: Option<String>,
    pub info: Option<BitTorrentName>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BitTorrentName {
    pub name: Option<String>,
}

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

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub struct DownloadOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dir: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub out: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub split: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_connection_per_server: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_agent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub referer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub header: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub select_file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bt_tracker: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed_ratio: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_download_limit: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_upload_limit: Option<String>,
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TorrentFile {
    pub index: usize,
    pub path: String,
    pub length: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MagnetInfo {
    pub name: Option<String>,
    pub info_hash: String,
    pub trackers: Vec<String>,
}

// Frontend-facing download model
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DownloadType {
    Http,
    Ftp,
    Torrent,
    Magnet,
}

impl std::fmt::Display for DownloadType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DownloadType::Http => write!(f, "http"),
            DownloadType::Ftp => write!(f, "ftp"),
            DownloadType::Torrent => write!(f, "torrent"),
            DownloadType::Magnet => write!(f, "magnet"),
        }
    }
}

/// User-friendly error categories for failed downloads
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorKind {
    NetworkError,
    FileError,
    NotFound,
    Timeout,
    AuthRequired,
    AlreadyExists,
    ResumeNotSupported,
    Unknown,
}

impl ErrorKind {
    /// Map aria2 error codes to user-friendly error kinds
    pub fn from_code(code: i32) -> Self {
        match code {
            1 => ErrorKind::Unknown,
            2 => ErrorKind::Timeout,
            3 => ErrorKind::NotFound,
            6 => ErrorKind::NetworkError,
            7 => ErrorKind::ResumeNotSupported,
            13 => ErrorKind::AlreadyExists,
            24 => ErrorKind::AuthRequired,
            _ => ErrorKind::Unknown,
        }
    }

    /// Get a user-friendly message for the error
    pub fn message(&self) -> &'static str {
        match self {
            ErrorKind::NetworkError => "Connection failed",
            ErrorKind::FileError => "File operation failed",
            ErrorKind::NotFound => "File not found (404)",
            ErrorKind::Timeout => "Server took too long to respond",
            ErrorKind::AuthRequired => "Login required",
            ErrorKind::AlreadyExists => "File already exists",
            ErrorKind::ResumeNotSupported => "Cannot resume, restarting download",
            ErrorKind::Unknown => "Download failed",
        }
    }
}

/// Clean, normalized download state for the UI
/// This hides aria2's confusing internal states and provides a better UX
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "lowercase")]
pub enum AppDownloadState {
    /// Waiting to start (aria2: waiting)
    Queued,
    /// Actively downloading with progress (aria2: active with speed > 0)
    Downloading,
    /// Active but no progress for extended period (aria2: active with speed == 0)
    Stalled,
    /// User paused
    Paused,
    /// Successfully finished
    Completed,
    /// Failed with reason
    Error {
        kind: ErrorKind,
        message: String,
    },
    /// Auto-retry in progress after failure
    Retrying {
        attempt: u32,
        max_attempts: u32,
    },
}

impl AppDownloadState {
    /// Normalize aria2 status to a clean app state
    ///
    /// # Arguments
    /// * `aria2_status` - Raw status string from aria2 (active, waiting, paused, complete, error, removed)
    /// * `download_speed` - Current download speed in bytes/sec
    /// * `stall_seconds` - How long the download has been at 0 speed
    /// * `error_code` - Optional error code from aria2
    /// * `error_message` - Optional error message from aria2
    pub fn from_aria2(
        aria2_status: &str,
        download_speed: u64,
        stall_seconds: u64,
        error_code: Option<i32>,
        error_message: Option<&str>,
    ) -> Self {
        match aria2_status {
            "active" => {
                if download_speed == 0 && stall_seconds > 30 {
                    AppDownloadState::Stalled
                } else {
                    AppDownloadState::Downloading
                }
            }
            "waiting" => AppDownloadState::Queued,
            "paused" => AppDownloadState::Paused,
            "complete" => AppDownloadState::Completed,
            "error" | "removed" => {
                let kind = error_code
                    .map(ErrorKind::from_code)
                    .unwrap_or(ErrorKind::Unknown);
                let message = error_message
                    .map(String::from)
                    .unwrap_or_else(|| kind.message().to_string());
                AppDownloadState::Error { kind, message }
            }
            _ => AppDownloadState::Queued,
        }
    }

    /// Check if the download is in an active/running state
    pub fn is_active(&self) -> bool {
        matches!(self, AppDownloadState::Downloading | AppDownloadState::Stalled | AppDownloadState::Retrying { .. })
    }

    /// Check if the download is complete (success or failure)
    pub fn is_finished(&self) -> bool {
        matches!(self, AppDownloadState::Completed | AppDownloadState::Error { .. })
    }

    /// Check if the download can be resumed
    pub fn can_resume(&self) -> bool {
        matches!(self, AppDownloadState::Paused | AppDownloadState::Stalled | AppDownloadState::Error { .. })
    }
}

impl Default for AppDownloadState {
    fn default() -> Self {
        AppDownloadState::Queued
    }
}

impl std::fmt::Display for AppDownloadState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppDownloadState::Queued => write!(f, "queued"),
            AppDownloadState::Downloading => write!(f, "downloading"),
            AppDownloadState::Stalled => write!(f, "stalled"),
            AppDownloadState::Paused => write!(f, "paused"),
            AppDownloadState::Completed => write!(f, "completed"),
            AppDownloadState::Error { .. } => write!(f, "error"),
            AppDownloadState::Retrying { attempt, max_attempts } => {
                write!(f, "retrying ({}/{})", attempt, max_attempts)
            }
        }
    }
}

/// Legacy DownloadState for backwards compatibility with existing code
/// TODO: Migrate all usages to AppDownloadState
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

// Aria2 notification events
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Aria2Event {
    DownloadStart { gid: String },
    DownloadPause { gid: String },
    DownloadStop { gid: String },
    DownloadComplete { gid: String },
    DownloadError { gid: String },
    BtDownloadComplete { gid: String },
}

/// Type-safe wrapper for aria2 GID (Global ID)
/// GIDs are 16-character hexadecimal strings
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Gid(String);

impl Gid {
    /// Create a new Gid from a string, validating the format
    pub fn new(s: String) -> Result<Self, GidError> {
        if s.len() == 16 && s.chars().all(|c| c.is_ascii_hexdigit()) {
            Ok(Self(s))
        } else {
            Err(GidError::InvalidFormat(s))
        }
    }

    /// Create a Gid without validation (use when coming from aria2)
    pub fn from_aria2(s: String) -> Self {
        Self(s)
    }

    /// Get the inner string value
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Consume and return the inner string
    pub fn into_inner(self) -> String {
        self.0
    }
}

impl std::fmt::Display for Gid {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl Serialize for Gid {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.0)
    }
}

impl<'de> Deserialize<'de> for Gid {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        Ok(Gid::from_aria2(s))
    }
}

impl From<Gid> for String {
    fn from(gid: Gid) -> Self {
        gid.0
    }
}

impl AsRef<str> for Gid {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

/// Error type for invalid GID formats
#[derive(Debug, Clone)]
pub enum GidError {
    InvalidFormat(String),
}

impl std::fmt::Display for GidError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            GidError::InvalidFormat(s) => write!(f, "Invalid GID format: {}", s),
        }
    }
}

impl std::error::Error for GidError {}
