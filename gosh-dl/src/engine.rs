//! Download Engine - Main coordinator
//!
//! The `DownloadEngine` is the primary entry point for the library.
//! It manages all downloads, coordinates between HTTP and BitTorrent
//! engines, handles persistence, and emits events.

use crate::config::EngineConfig;
use crate::error::{EngineError, Result};
use crate::http::HttpDownloader;
use crate::types::{
    DownloadEvent, DownloadId, DownloadKind, DownloadMetadata, DownloadOptions,
    DownloadProgress, DownloadState, DownloadStatus, GlobalStats,
};

use chrono::Utc;
use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, Semaphore};
use url::Url;

/// Maximum number of events to buffer
const EVENT_CHANNEL_CAPACITY: usize = 1024;

/// Internal representation of a managed download
struct ManagedDownload {
    status: DownloadStatus,
    handle: Option<DownloadHandle>,
}

/// Handle to control a running download
enum DownloadHandle {
    Http(HttpDownloadHandle),
    // Torrent(TorrentDownloadHandle), // TODO: Phase 3
}

/// Handle for an HTTP download task
struct HttpDownloadHandle {
    cancel_token: tokio_util::sync::CancellationToken,
    task: tokio::task::JoinHandle<Result<()>>,
}

/// The main download engine
pub struct DownloadEngine {
    /// Configuration
    config: RwLock<EngineConfig>,

    /// All managed downloads
    downloads: RwLock<HashMap<DownloadId, ManagedDownload>>,

    /// HTTP downloader
    http: Arc<HttpDownloader>,

    /// Event broadcaster
    event_tx: broadcast::Sender<DownloadEvent>,

    /// Semaphore for limiting concurrent downloads
    concurrent_limit: Arc<Semaphore>,

    /// Shutdown flag
    shutdown: tokio_util::sync::CancellationToken,
}

impl DownloadEngine {
    /// Create a new download engine with the given configuration
    pub async fn new(config: EngineConfig) -> Result<Arc<Self>> {
        // Validate configuration
        config.validate()?;

        // Create event channel
        let (event_tx, _) = broadcast::channel(EVENT_CHANNEL_CAPACITY);

        // Create HTTP downloader
        let http = Arc::new(HttpDownloader::new(&config)?);

        // Create concurrent download limiter
        let concurrent_limit = Arc::new(Semaphore::new(config.max_concurrent_downloads));

        let engine = Arc::new(Self {
            config: RwLock::new(config),
            downloads: RwLock::new(HashMap::new()),
            http,
            event_tx,
            concurrent_limit,
            shutdown: tokio_util::sync::CancellationToken::new(),
        });

        // TODO: Load persisted downloads from database

        Ok(engine)
    }

    /// Add an HTTP/HTTPS download
    pub async fn add_http(
        self: &Arc<Self>,
        url: &str,
        options: DownloadOptions,
    ) -> Result<DownloadId> {
        // Validate URL
        let parsed_url = Url::parse(url).map_err(|e| {
            EngineError::invalid_input("url", format!("Invalid URL: {}", e))
        })?;

        // Only allow http and https
        match parsed_url.scheme() {
            "http" | "https" => {}
            scheme => {
                return Err(EngineError::invalid_input(
                    "url",
                    format!("Unsupported scheme: {}", scheme),
                ));
            }
        }

        // Generate download ID
        let id = DownloadId::new();

        // Determine save directory
        let save_dir = options
            .save_dir
            .clone()
            .unwrap_or_else(|| self.config.read().download_dir.clone());

        // Extract filename from URL or options
        let filename = options.filename.clone().or_else(|| {
            parsed_url
                .path_segments()
                .and_then(|segments| segments.last())
                .map(|s| s.to_string())
                .filter(|s| !s.is_empty())
        });

        let name = filename.clone().unwrap_or_else(|| "download".to_string());

        // Create download status
        let status = DownloadStatus {
            id,
            kind: DownloadKind::Http,
            state: DownloadState::Queued,
            progress: DownloadProgress::default(),
            metadata: DownloadMetadata {
                name,
                url: Some(url.to_string()),
                magnet_uri: None,
                info_hash: None,
                save_dir,
                filename,
                user_agent: options.user_agent.clone(),
                referer: options.referer.clone(),
                headers: options.headers.clone(),
            },
            created_at: Utc::now(),
            completed_at: None,
        };

        // Insert into downloads map
        {
            let mut downloads = self.downloads.write();
            downloads.insert(
                id,
                ManagedDownload {
                    status,
                    handle: None,
                },
            );
        }

        // Emit event
        let _ = self.event_tx.send(DownloadEvent::Added { id });

        // Start the download
        self.start_download(id, url.to_string(), options).await?;

        Ok(id)
    }

    /// Start a download task
    async fn start_download(
        self: &Arc<Self>,
        id: DownloadId,
        url: String,
        _options: DownloadOptions,
    ) -> Result<()> {
        let engine = Arc::clone(self);
        let http = Arc::clone(&self.http);
        let concurrent_limit = Arc::clone(&self.concurrent_limit);
        let cancel_token = tokio_util::sync::CancellationToken::new();
        let cancel_token_clone = cancel_token.clone();

        // Update state to connecting
        self.update_state(id, DownloadState::Connecting)?;

        let task = tokio::spawn(async move {
            // Acquire semaphore permit for concurrent limit
            let _permit = concurrent_limit.acquire().await.map_err(|_| EngineError::Shutdown)?;

            // Check if cancelled before starting
            if cancel_token_clone.is_cancelled() {
                return Ok(());
            }

            // Update state to downloading
            engine.update_state(id, DownloadState::Downloading)?;
            let _ = engine.event_tx.send(DownloadEvent::Started { id });

            // Get save path
            let (save_dir, filename, user_agent, referer, headers) = {
                let downloads = engine.downloads.read();
                let download = downloads.get(&id).ok_or_else(|| {
                    EngineError::NotFound(id.to_string())
                })?;
                (
                    download.status.metadata.save_dir.clone(),
                    download.status.metadata.filename.clone(),
                    download.status.metadata.user_agent.clone(),
                    download.status.metadata.referer.clone(),
                    download.status.metadata.headers.clone(),
                )
            };

            // Create progress callback
            let engine_clone = Arc::clone(&engine);
            let progress_callback = move |progress: DownloadProgress| {
                // Update progress in download status
                {
                    let mut downloads = engine_clone.downloads.write();
                    if let Some(download) = downloads.get_mut(&id) {
                        download.status.progress = progress.clone();
                    }
                }
                // Emit progress event
                let _ = engine_clone.event_tx.send(DownloadEvent::Progress {
                    id,
                    progress,
                });
            };

            // Get config for segmented downloads
            let (max_connections, min_segment_size) = {
                let config = engine.config.read();
                (config.max_connections_per_download, config.min_segment_size)
            };

            // Perform the download (uses segmented if server supports it)
            let result = http
                .download_segmented(
                    &url,
                    &save_dir,
                    filename.as_deref(),
                    user_agent.as_deref(),
                    referer.as_deref(),
                    &headers,
                    max_connections,
                    min_segment_size,
                    cancel_token_clone.clone(),
                    progress_callback,
                )
                .await;

            match result {
                Ok(final_path) => {
                    // Update status to completed
                    {
                        let mut downloads = engine.downloads.write();
                        if let Some(download) = downloads.get_mut(&id) {
                            download.status.state = DownloadState::Completed;
                            download.status.completed_at = Some(Utc::now());
                            download.status.metadata.filename =
                                final_path.file_name().map(|s| s.to_string_lossy().to_string());
                        }
                    }
                    let _ = engine.event_tx.send(DownloadEvent::Completed { id });
                }
                Err(e) if cancel_token_clone.is_cancelled() => {
                    // Cancelled, already handled
                }
                Err(e) => {
                    let retryable = e.is_retryable();
                    let error_msg = e.to_string();

                    // Update status to error
                    engine.update_state(
                        id,
                        DownloadState::Error {
                            kind: format!("{:?}", e),
                            message: error_msg.clone(),
                            retryable,
                        },
                    )?;

                    let _ = engine.event_tx.send(DownloadEvent::Failed {
                        id,
                        error: error_msg,
                        retryable,
                    });
                }
            }

            Ok(())
        });

        // Store the handle
        {
            let mut downloads = self.downloads.write();
            if let Some(download) = downloads.get_mut(&id) {
                download.handle = Some(DownloadHandle::Http(HttpDownloadHandle {
                    cancel_token,
                    task,
                }));
            }
        }

        Ok(())
    }

    /// Pause a download
    pub async fn pause(&self, id: DownloadId) -> Result<()> {
        let mut downloads = self.downloads.write();
        let download = downloads.get_mut(&id).ok_or_else(|| {
            EngineError::NotFound(id.to_string())
        })?;

        // Check if can be paused
        if !download.status.state.is_active() {
            return Err(EngineError::InvalidState {
                action: "pause",
                current_state: format!("{:?}", download.status.state),
            });
        }

        // Cancel the task
        if let Some(handle) = download.handle.take() {
            match handle {
                DownloadHandle::Http(h) => {
                    h.cancel_token.cancel();
                    // Don't await the task here to avoid blocking
                }
            }
        }

        // Update state
        let old_state = download.status.state.clone();
        download.status.state = DownloadState::Paused;

        // Emit events
        let _ = self.event_tx.send(DownloadEvent::StateChanged {
            id,
            old_state,
            new_state: DownloadState::Paused,
        });
        let _ = self.event_tx.send(DownloadEvent::Paused { id });

        Ok(())
    }

    /// Resume a paused download
    pub async fn resume(self: &Arc<Self>, id: DownloadId) -> Result<()> {
        let (url, options) = {
            let downloads = self.downloads.read();
            let download = downloads.get(&id).ok_or_else(|| {
                EngineError::NotFound(id.to_string())
            })?;

            // Check if can be resumed
            if download.status.state != DownloadState::Paused {
                return Err(EngineError::InvalidState {
                    action: "resume",
                    current_state: format!("{:?}", download.status.state),
                });
            }

            let url = download.status.metadata.url.clone().ok_or_else(|| {
                EngineError::Internal("HTTP download missing URL".to_string())
            })?;

            let options = DownloadOptions {
                save_dir: Some(download.status.metadata.save_dir.clone()),
                filename: download.status.metadata.filename.clone(),
                user_agent: download.status.metadata.user_agent.clone(),
                referer: download.status.metadata.referer.clone(),
                headers: download.status.metadata.headers.clone(),
                ..Default::default()
            };

            (url, options)
        };

        // Start the download again
        self.start_download(id, url, options).await?;

        let _ = self.event_tx.send(DownloadEvent::Resumed { id });

        Ok(())
    }

    /// Cancel a download and optionally delete files
    pub async fn cancel(&self, id: DownloadId, delete_files: bool) -> Result<()> {
        let (handle, save_path) = {
            let mut downloads = self.downloads.write();
            let download = downloads.remove(&id).ok_or_else(|| {
                EngineError::NotFound(id.to_string())
            })?;

            let save_path = if delete_files {
                Some(download.status.metadata.save_dir.join(
                    download.status.metadata.filename.as_deref().unwrap_or("download"),
                ))
            } else {
                None
            };

            (download.handle, save_path)
        };

        // Cancel the task if running
        if let Some(handle) = handle {
            match handle {
                DownloadHandle::Http(h) => {
                    h.cancel_token.cancel();
                }
            }
        }

        // Delete files if requested
        if let Some(path) = save_path {
            if path.exists() {
                tokio::fs::remove_file(&path).await.ok();
            }
            // Also try to remove partial file
            let partial_path = path.with_extension("part");
            if partial_path.exists() {
                tokio::fs::remove_file(&partial_path).await.ok();
            }
        }

        let _ = self.event_tx.send(DownloadEvent::Removed { id });

        Ok(())
    }

    /// Get the status of a download
    pub fn status(&self, id: DownloadId) -> Option<DownloadStatus> {
        self.downloads.read().get(&id).map(|d| d.status.clone())
    }

    /// List all downloads
    pub fn list(&self) -> Vec<DownloadStatus> {
        self.downloads
            .read()
            .values()
            .map(|d| d.status.clone())
            .collect()
    }

    /// Get active downloads
    pub fn active(&self) -> Vec<DownloadStatus> {
        self.downloads
            .read()
            .values()
            .filter(|d| d.status.state.is_active())
            .map(|d| d.status.clone())
            .collect()
    }

    /// Get waiting/queued downloads
    pub fn waiting(&self) -> Vec<DownloadStatus> {
        self.downloads
            .read()
            .values()
            .filter(|d| matches!(d.status.state, DownloadState::Queued))
            .map(|d| d.status.clone())
            .collect()
    }

    /// Get stopped downloads (paused, completed, error)
    pub fn stopped(&self) -> Vec<DownloadStatus> {
        self.downloads
            .read()
            .values()
            .filter(|d| {
                matches!(
                    d.status.state,
                    DownloadState::Paused | DownloadState::Completed | DownloadState::Error { .. }
                )
            })
            .map(|d| d.status.clone())
            .collect()
    }

    /// Get global statistics
    pub fn global_stats(&self) -> GlobalStats {
        let downloads = self.downloads.read();
        let mut stats = GlobalStats::default();

        for download in downloads.values() {
            match &download.status.state {
                DownloadState::Downloading | DownloadState::Seeding | DownloadState::Connecting => {
                    stats.num_active += 1;
                    stats.download_speed += download.status.progress.download_speed;
                    stats.upload_speed += download.status.progress.upload_speed;
                }
                DownloadState::Queued => {
                    stats.num_waiting += 1;
                }
                DownloadState::Paused | DownloadState::Completed | DownloadState::Error { .. } => {
                    stats.num_stopped += 1;
                }
            }
        }

        stats
    }

    /// Subscribe to download events
    pub fn subscribe(&self) -> broadcast::Receiver<DownloadEvent> {
        self.event_tx.subscribe()
    }

    /// Update engine configuration
    pub fn set_config(&self, config: EngineConfig) -> Result<()> {
        config.validate()?;

        // Update concurrent download limit
        // Note: This doesn't affect currently running downloads

        *self.config.write() = config;
        Ok(())
    }

    /// Get current configuration
    pub fn get_config(&self) -> EngineConfig {
        self.config.read().clone()
    }

    /// Graceful shutdown
    pub async fn shutdown(&self) -> Result<()> {
        // Signal shutdown
        self.shutdown.cancel();

        // Cancel all active downloads
        let handles: Vec<_> = {
            let mut downloads = self.downloads.write();
            downloads
                .values_mut()
                .filter_map(|d| d.handle.take())
                .collect()
        };

        for handle in handles {
            match handle {
                DownloadHandle::Http(h) => {
                    h.cancel_token.cancel();
                    // Wait for task to finish (with timeout)
                    let _ = tokio::time::timeout(
                        std::time::Duration::from_secs(5),
                        h.task,
                    ).await;
                }
            }
        }

        // TODO: Save state to database

        Ok(())
    }

    /// Helper to update download state
    fn update_state(&self, id: DownloadId, new_state: DownloadState) -> Result<()> {
        let mut downloads = self.downloads.write();
        let download = downloads.get_mut(&id).ok_or_else(|| {
            EngineError::NotFound(id.to_string())
        })?;

        let old_state = download.status.state.clone();
        download.status.state = new_state.clone();

        let _ = self.event_tx.send(DownloadEvent::StateChanged {
            id,
            old_state,
            new_state,
        });

        Ok(())
    }
}

impl Drop for DownloadEngine {
    fn drop(&mut self) {
        // Signal shutdown on drop
        self.shutdown.cancel();
    }
}
