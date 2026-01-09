//! Engine Adapter
//!
//! This module adapts the gosh-dl download engine to the existing
//! Tauri command interface, maintaining backwards compatibility
//! with the frontend.

use crate::types::{Download, DownloadOptions as FrontendOptions, DownloadState, DownloadType, GlobalStat};
use gosh_dl::{
    DownloadEngine, DownloadId, DownloadOptions, DownloadState as EngineState, DownloadStatus,
    PeerInfo as EnginePeerInfo, TorrentFile,
};
use std::path::PathBuf;
use std::sync::Arc;

/// Torrent file info for frontend compatibility
#[derive(Debug, Clone)]
pub struct TorrentFileInfo {
    pub path: PathBuf,
    pub size: u64,
    pub completed: u64,
    pub selected: bool,
}

/// Peer info for frontend compatibility
#[derive(Debug, Clone)]
pub struct PeerInfo {
    pub ip: String,
    pub port: u16,
    pub client: Option<String>,
    pub download_speed: u64,
    pub upload_speed: u64,
}

/// Adapter to convert between gosh-dl types and existing frontend types
#[derive(Clone)]
pub struct EngineAdapter {
    engine: Arc<DownloadEngine>,
}

impl EngineAdapter {
    /// Create a new adapter with the given engine
    pub fn new(engine: Arc<DownloadEngine>) -> Self {
        Self { engine }
    }

    /// Get a reference to the engine
    pub fn engine(&self) -> &Arc<DownloadEngine> {
        &self.engine
    }

    /// Add an HTTP download
    pub async fn add_download(
        &self,
        url: String,
        options: Option<FrontendOptions>,
    ) -> Result<String, gosh_dl::EngineError> {
        let opts = options.map(convert_options).unwrap_or_default();
        let id = self.engine.add_http(&url, opts).await?;
        Ok(id.as_uuid().to_string())
    }

    /// Add multiple downloads
    pub async fn add_urls(
        &self,
        urls: Vec<String>,
        options: Option<FrontendOptions>,
    ) -> Result<Vec<String>, gosh_dl::EngineError> {
        let opts = options.map(convert_options).unwrap_or_default();
        let mut gids = Vec::new();
        for url in urls {
            let id = self.engine.add_http(&url, opts.clone()).await?;
            gids.push(id.as_uuid().to_string());
        }
        Ok(gids)
    }

    /// Pause a download
    pub async fn pause(&self, gid: &str) -> Result<(), gosh_dl::EngineError> {
        let id = parse_gid(gid)?;
        self.engine.pause(id).await
    }

    /// Pause all downloads
    pub async fn pause_all(&self) -> Result<(), gosh_dl::EngineError> {
        for status in self.engine.active() {
            let _ = self.engine.pause(status.id).await;
        }
        Ok(())
    }

    /// Resume a download
    pub async fn resume(&self, gid: &str) -> Result<(), gosh_dl::EngineError> {
        let id = parse_gid(gid)?;
        self.engine.resume(id).await
    }

    /// Resume all downloads
    pub async fn resume_all(&self) -> Result<(), gosh_dl::EngineError> {
        for status in self.engine.stopped() {
            if matches!(
                status.state,
                EngineState::Paused | EngineState::Error { .. }
            ) {
                let _ = self.engine.resume(status.id).await;
            }
        }
        Ok(())
    }

    /// Remove a download
    pub async fn remove(
        &self,
        gid: &str,
        delete_files: bool,
    ) -> Result<(), gosh_dl::EngineError> {
        let id = parse_gid(gid)?;
        self.engine.cancel(id, delete_files).await
    }

    /// Get status of a single download
    pub fn get_status(&self, gid: &str) -> Option<Download> {
        let id = parse_gid(gid).ok()?;
        self.engine.status(id).map(convert_status)
    }

    /// Get all downloads
    pub fn get_all(&self) -> Vec<Download> {
        self.engine.list().into_iter().map(convert_status).collect()
    }

    /// Get active downloads
    pub fn get_active(&self) -> Vec<Download> {
        self.engine.active().into_iter().map(convert_status).collect()
    }

    /// Get global stats
    pub fn get_global_stats(&self) -> GlobalStat {
        let stats = self.engine.global_stats();
        GlobalStat {
            download_speed: stats.download_speed.to_string(),
            upload_speed: stats.upload_speed.to_string(),
            num_active: stats.num_active.to_string(),
            num_waiting: stats.num_waiting.to_string(),
            num_stopped: stats.num_stopped.to_string(),
            num_stopped_total: stats.num_stopped.to_string(),
        }
    }

    /// Set speed limits
    pub fn set_speed_limit(
        &self,
        download_limit: Option<u64>,
        upload_limit: Option<u64>,
    ) -> Result<(), gosh_dl::EngineError> {
        let mut config = self.engine.get_config();
        config.global_download_limit = download_limit;
        config.global_upload_limit = upload_limit;
        self.engine.set_config(config)
    }

    /// Add a torrent from file data
    pub async fn add_torrent(
        &self,
        torrent_data: &[u8],
        options: Option<FrontendOptions>,
    ) -> Result<String, gosh_dl::EngineError> {
        let opts = options.map(convert_options).unwrap_or_default();
        let id = self.engine.add_torrent(torrent_data, opts).await?;
        Ok(id.as_uuid().to_string())
    }

    /// Add a magnet link
    pub async fn add_magnet(
        &self,
        magnet_uri: &str,
        options: Option<FrontendOptions>,
    ) -> Result<String, gosh_dl::EngineError> {
        let opts = options.map(convert_options).unwrap_or_default();
        let id = self.engine.add_magnet(magnet_uri, opts).await?;
        Ok(id.as_uuid().to_string())
    }

    /// Get torrent files
    pub fn get_torrent_files(&self, gid: &str) -> Option<Vec<TorrentFileInfo>> {
        let id = parse_gid(gid).ok()?;
        let status = self.engine.status(id)?;

        // Convert gosh-dl TorrentFile to TorrentFileInfo
        status.torrent_info.map(|info| {
            info.files
                .into_iter()
                .map(|f: TorrentFile| TorrentFileInfo {
                    path: f.path,
                    size: f.size,
                    completed: f.completed,
                    selected: f.selected,
                })
                .collect()
        })
    }

    /// Get peer info for a torrent
    pub fn get_peers(&self, gid: &str) -> Option<Vec<PeerInfo>> {
        let id = parse_gid(gid).ok()?;
        let status = self.engine.status(id)?;

        // Convert gosh-dl PeerInfo to local PeerInfo
        status.peers.map(|peers| {
            peers
                .into_iter()
                .map(|p: EnginePeerInfo| PeerInfo {
                    ip: p.ip,
                    port: p.port,
                    client: p.client,
                    download_speed: p.download_speed,
                    upload_speed: p.upload_speed,
                })
                .collect()
        })
    }

}

/// Parse a GID string to a DownloadId
/// Supports both full UUID format and legacy 16-char GID format
fn parse_gid(gid: &str) -> Result<DownloadId, gosh_dl::EngineError> {
    // Try parsing as full UUID first (new format)
    if let Ok(uuid) = uuid::Uuid::parse_str(gid) {
        return Ok(DownloadId::from_uuid(uuid));
    }
    // Fall back to legacy 16-char GID format
    DownloadId::from_gid(gid).ok_or_else(|| {
        gosh_dl::EngineError::NotFound(format!("Invalid GID: {}", gid))
    })
}

/// Convert frontend options to gosh-dl options
fn convert_options(opts: FrontendOptions) -> DownloadOptions {
    let mut headers = Vec::new();

    // Parse header strings like "Key: Value"
    if let Some(hdrs) = opts.header {
        for h in hdrs {
            if let Some((k, v)) = h.split_once(':') {
                headers.push((k.trim().to_string(), v.trim().to_string()));
            }
        }
    }

    DownloadOptions {
        save_dir: opts.dir.map(PathBuf::from),
        filename: opts.out,
        user_agent: opts.user_agent,
        referer: opts.referer,
        headers,
        max_connections: opts
            .max_connection_per_server
            .and_then(|s| s.parse().ok()),
        max_download_speed: opts.max_download_limit.and_then(|s| parse_speed(&s)),
        max_upload_speed: opts.max_upload_limit.and_then(|s| parse_speed(&s)),
        seed_ratio: opts.seed_ratio.and_then(|s| s.parse().ok()),
        selected_files: opts.select_file.map(|s| {
            s.split(',')
                .filter_map(|n| n.parse().ok())
                .collect()
        }),
        ..Default::default()
    }
}

/// Parse a speed string like "1M" or "500K" to bytes/sec
fn parse_speed(s: &str) -> Option<u64> {
    let s = s.trim().to_uppercase();
    if s.ends_with('K') {
        s[..s.len() - 1].parse::<u64>().ok().map(|n| n * 1024)
    } else if s.ends_with('M') {
        s[..s.len() - 1].parse::<u64>().ok().map(|n| n * 1024 * 1024)
    } else if s.ends_with('G') {
        s[..s.len() - 1]
            .parse::<u64>()
            .ok()
            .map(|n| n * 1024 * 1024 * 1024)
    } else {
        s.parse().ok()
    }
}

/// Convert gosh-dl status to frontend Download type
fn convert_status(status: DownloadStatus) -> Download {
    use gosh_dl::DownloadKind;

    let download_type = match status.kind {
        DownloadKind::Http => DownloadType::Http,
        DownloadKind::Torrent => DownloadType::Torrent,
        DownloadKind::Magnet => DownloadType::Magnet,
    };

    let state = match &status.state {
        EngineState::Queued => DownloadState::Waiting,
        EngineState::Connecting => DownloadState::Active,
        EngineState::Downloading => DownloadState::Active,
        EngineState::Seeding => DownloadState::Active,
        EngineState::Paused => DownloadState::Paused,
        EngineState::Completed => DownloadState::Complete,
        EngineState::Error { .. } => DownloadState::Error,
    };

    let error_message = match &status.state {
        EngineState::Error { message, .. } => Some(message.clone()),
        _ => None,
    };

    Download {
        id: 0, // Frontend uses database ID, we don't have one yet
        gid: status.id.as_uuid().to_string(),
        name: status.metadata.name.clone(),
        url: status.metadata.url.clone(),
        magnet_uri: status.metadata.magnet_uri.clone(),
        info_hash: status.metadata.info_hash.clone(),
        download_type,
        status: state,
        total_size: status.progress.total_size.unwrap_or(0),
        completed_size: status.progress.completed_size,
        download_speed: status.progress.download_speed,
        upload_speed: status.progress.upload_speed,
        save_path: status.metadata.save_dir.to_string_lossy().to_string(),
        created_at: status.created_at.to_rfc3339(),
        completed_at: status.completed_at.map(|t| t.to_rfc3339()),
        error_message,
        connections: status.progress.connections,
        seeders: status.progress.seeders,
        selected_files: status.torrent_info.as_ref().map(|info| {
            info.files
                .iter()
                .filter(|f| f.selected)
                .map(|f| f.index)
                .collect()
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_speed() {
        assert_eq!(parse_speed("1024"), Some(1024));
        assert_eq!(parse_speed("1K"), Some(1024));
        assert_eq!(parse_speed("1M"), Some(1024 * 1024));
        assert_eq!(parse_speed("2G"), Some(2 * 1024 * 1024 * 1024));
    }
}
