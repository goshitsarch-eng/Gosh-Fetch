//! Engine configuration
//!
//! This module contains all configuration options for the download engine.

use crate::error::{EngineError, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Main configuration for the download engine
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineConfig {
    /// Directory to save downloads
    pub download_dir: PathBuf,

    /// Maximum concurrent downloads
    pub max_concurrent_downloads: usize,

    /// Maximum connections per download (for segmented HTTP)
    pub max_connections_per_download: usize,

    /// Minimum segment size in bytes (won't split smaller than this)
    pub min_segment_size: u64,

    /// Global download speed limit (bytes/sec, None = unlimited)
    pub global_download_limit: Option<u64>,

    /// Global upload speed limit (bytes/sec, None = unlimited)
    pub global_upload_limit: Option<u64>,

    /// Default user agent
    pub user_agent: String,

    /// Enable DHT for torrents
    pub enable_dht: bool,

    /// Enable PEX (Peer Exchange) for torrents
    pub enable_pex: bool,

    /// Enable LPD (Local Peer Discovery) for torrents
    pub enable_lpd: bool,

    /// Maximum peers per torrent
    pub max_peers: usize,

    /// Stop seeding when this ratio is reached
    pub seed_ratio: f64,

    /// Database path for session persistence
    pub database_path: Option<PathBuf>,

    /// HTTP configuration
    pub http: HttpConfig,

    /// BitTorrent configuration
    pub torrent: TorrentConfig,
}

/// HTTP-specific configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpConfig {
    /// Connection timeout in seconds
    pub connect_timeout: u64,

    /// Read timeout in seconds
    pub read_timeout: u64,

    /// Maximum redirects to follow
    pub max_redirects: usize,

    /// Retry attempts for failed segments
    pub max_retries: usize,

    /// Initial retry delay in milliseconds
    pub retry_delay_ms: u64,

    /// Maximum retry delay in milliseconds
    pub max_retry_delay_ms: u64,

    /// Whether to accept invalid TLS certificates (dangerous!)
    pub accept_invalid_certs: bool,
}

/// BitTorrent-specific configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TorrentConfig {
    /// Port range for incoming connections
    pub listen_port_range: (u16, u16),

    /// DHT bootstrap nodes
    pub dht_bootstrap_nodes: Vec<String>,

    /// Tracker update interval in seconds
    pub tracker_update_interval: u64,

    /// Peer request timeout in seconds
    pub peer_timeout: u64,

    /// Maximum outstanding piece requests per peer
    pub max_pending_requests: usize,

    /// Enable endgame mode
    pub enable_endgame: bool,
}

impl Default for EngineConfig {
    fn default() -> Self {
        Self {
            download_dir: dirs::download_dir().unwrap_or_else(|| PathBuf::from(".")),
            max_concurrent_downloads: 5,
            max_connections_per_download: 16,
            min_segment_size: 1024 * 1024, // 1 MiB
            global_download_limit: None,
            global_upload_limit: None,
            user_agent: format!("gosh-dl/{}", env!("CARGO_PKG_VERSION")),
            enable_dht: true,
            enable_pex: true,
            enable_lpd: true,
            max_peers: 55,
            seed_ratio: 1.0,
            database_path: None,
            http: HttpConfig::default(),
            torrent: TorrentConfig::default(),
        }
    }
}

impl Default for HttpConfig {
    fn default() -> Self {
        Self {
            connect_timeout: 30,
            read_timeout: 60,
            max_redirects: 10,
            max_retries: 3,
            retry_delay_ms: 1000,
            max_retry_delay_ms: 30000,
            accept_invalid_certs: false,
        }
    }
}

impl Default for TorrentConfig {
    fn default() -> Self {
        Self {
            listen_port_range: (6881, 6889),
            dht_bootstrap_nodes: vec![
                "router.bittorrent.com:6881".to_string(),
                "router.utorrent.com:6881".to_string(),
                "dht.transmissionbt.com:6881".to_string(),
            ],
            tracker_update_interval: 1800, // 30 minutes
            peer_timeout: 120,
            max_pending_requests: 16,
            enable_endgame: true,
        }
    }
}

impl EngineConfig {
    /// Create a new config with default values
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the download directory
    pub fn download_dir(mut self, path: impl Into<PathBuf>) -> Self {
        self.download_dir = path.into();
        self
    }

    /// Set maximum concurrent downloads
    pub fn max_concurrent_downloads(mut self, max: usize) -> Self {
        self.max_concurrent_downloads = max;
        self
    }

    /// Set maximum connections per download
    pub fn max_connections_per_download(mut self, max: usize) -> Self {
        self.max_connections_per_download = max;
        self
    }

    /// Set global download speed limit
    pub fn download_limit(mut self, limit: Option<u64>) -> Self {
        self.global_download_limit = limit;
        self
    }

    /// Set global upload speed limit
    pub fn upload_limit(mut self, limit: Option<u64>) -> Self {
        self.global_upload_limit = limit;
        self
    }

    /// Set the user agent
    pub fn user_agent(mut self, ua: impl Into<String>) -> Self {
        self.user_agent = ua.into();
        self
    }

    /// Set the database path for persistence
    pub fn database_path(mut self, path: impl Into<PathBuf>) -> Self {
        self.database_path = Some(path.into());
        self
    }

    /// Validate the configuration
    pub fn validate(&self) -> Result<()> {
        // Check download directory
        if !self.download_dir.exists() {
            return Err(EngineError::invalid_input(
                "download_dir",
                format!("Directory does not exist: {:?}", self.download_dir),
            ));
        }

        if !self.download_dir.is_dir() {
            return Err(EngineError::invalid_input(
                "download_dir",
                format!("Path is not a directory: {:?}", self.download_dir),
            ));
        }

        // Check numeric limits
        if self.max_concurrent_downloads == 0 {
            return Err(EngineError::invalid_input(
                "max_concurrent_downloads",
                "Must be at least 1",
            ));
        }

        if self.max_connections_per_download == 0 {
            return Err(EngineError::invalid_input(
                "max_connections_per_download",
                "Must be at least 1",
            ));
        }

        if self.seed_ratio < 0.0 {
            return Err(EngineError::invalid_input(
                "seed_ratio",
                "Must be non-negative",
            ));
        }

        // Check port range
        if self.torrent.listen_port_range.0 > self.torrent.listen_port_range.1 {
            return Err(EngineError::invalid_input(
                "listen_port_range",
                "Start port must be <= end port",
            ));
        }

        Ok(())
    }

    /// Get the database path, using default if not set
    pub fn get_database_path(&self) -> PathBuf {
        self.database_path.clone().unwrap_or_else(|| {
            dirs::data_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join("gosh-dl")
                .join("gosh-dl.db")
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_default_config() {
        let config = EngineConfig::default();
        assert_eq!(config.max_concurrent_downloads, 5);
        assert_eq!(config.max_connections_per_download, 16);
        assert!(config.enable_dht);
    }

    #[test]
    fn test_config_builder() {
        let config = EngineConfig::new()
            .max_concurrent_downloads(10)
            .max_connections_per_download(8)
            .download_limit(Some(1024 * 1024));

        assert_eq!(config.max_concurrent_downloads, 10);
        assert_eq!(config.max_connections_per_download, 8);
        assert_eq!(config.global_download_limit, Some(1024 * 1024));
    }

    #[test]
    fn test_config_validation() {
        let dir = tempdir().unwrap();
        let config = EngineConfig::new().download_dir(dir.path());
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_invalid_download_dir() {
        let config = EngineConfig::new().download_dir("/nonexistent/path/12345");
        assert!(config.validate().is_err());
    }
}
