//! Segmented Download Support
//!
//! This module provides multi-connection segmented downloads for faster
//! HTTP/HTTPS transfers. It splits files into segments and downloads
//! them in parallel using multiple connections.

use crate::error::{EngineError, NetworkErrorKind, Result, StorageErrorKind};
use crate::storage::Segment;
use crate::types::DownloadProgress;

use bytes::Bytes;
use futures::stream::StreamExt;
use parking_lot::RwLock;
use reqwest::Client;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::fs::{File, OpenOptions};
use tokio::io::{AsyncSeekExt, AsyncWriteExt, SeekFrom};
use tokio::sync::Semaphore;
use tokio_util::sync::CancellationToken;

/// Minimum segment size (1 MiB)
pub const MIN_SEGMENT_SIZE: u64 = 1024 * 1024;

/// Default number of connections per download
pub const DEFAULT_CONNECTIONS: usize = 16;

/// Progress update interval
const PROGRESS_INTERVAL: Duration = Duration::from_millis(250);

/// Shared state for a segmented download
struct SharedState {
    /// Total bytes downloaded across all segments
    downloaded: AtomicU64,
    /// Current download speed (bytes/sec)
    speed: AtomicU64,
    /// Number of active connections
    active_connections: AtomicU64,
    /// Whether download is paused
    paused: AtomicBool,
}

/// Segmented download manager
pub struct SegmentedDownload {
    /// URL to download from
    url: String,
    /// Total file size
    total_size: u64,
    /// Path to save the file
    save_path: PathBuf,
    /// Segments
    segments: Vec<Segment>,
    /// Whether server supports range requests (stored for resume validation)
    #[allow(dead_code)]
    supports_range: bool,
    /// ETag for validation
    etag: Option<String>,
    /// Last-Modified for validation (stored for resume validation)
    #[allow(dead_code)]
    last_modified: Option<String>,
    /// Shared state (wrapped in Arc for task sharing)
    state: Arc<SharedState>,
}

/// Server capabilities determined from HEAD request
#[derive(Debug, Clone)]
pub struct ServerCapabilities {
    /// Content-Length header value
    pub content_length: Option<u64>,
    /// Whether server supports Range requests
    pub supports_range: bool,
    /// ETag header for validation
    pub etag: Option<String>,
    /// Last-Modified header for validation
    pub last_modified: Option<String>,
    /// Suggested filename from Content-Disposition
    pub suggested_filename: Option<String>,
}

impl SegmentedDownload {
    /// Create a new segmented download
    pub fn new(
        url: String,
        total_size: u64,
        save_path: PathBuf,
        supports_range: bool,
        etag: Option<String>,
        last_modified: Option<String>,
    ) -> Self {
        Self {
            url,
            total_size,
            save_path,
            segments: Vec::new(),
            supports_range,
            etag,
            last_modified,
            state: Arc::new(SharedState {
                downloaded: AtomicU64::new(0),
                speed: AtomicU64::new(0),
                active_connections: AtomicU64::new(0),
                paused: AtomicBool::new(false),
            }),
        }
    }

    /// Initialize segments for a new download
    pub fn init_segments(&mut self, max_connections: usize, min_segment_size: u64) {
        let num_segments = calculate_segment_count(self.total_size, max_connections, min_segment_size);
        let segment_size = self.total_size / num_segments as u64;

        let mut segments = Vec::with_capacity(num_segments);
        for i in 0..num_segments {
            let start = i as u64 * segment_size;
            let end = if i == num_segments - 1 {
                self.total_size - 1
            } else {
                (i as u64 + 1) * segment_size - 1
            };
            segments.push(Segment::new(i, start, end));
        }

        self.segments = segments;
    }

    /// Restore segments from saved state
    pub fn restore_segments(&mut self, saved_segments: Vec<Segment>) {
        // Calculate total already downloaded
        let downloaded: u64 = saved_segments.iter().map(|s| s.downloaded).sum();
        self.state.downloaded.store(downloaded, Ordering::Relaxed);
        self.segments = saved_segments;
    }

    /// Get current segments
    pub fn segments(&self) -> &[Segment] {
        &self.segments
    }

    /// Start the segmented download
    pub async fn start<F>(
        &self,
        client: &Client,
        user_agent: &str,
        headers: &[(String, String)],
        max_connections: usize,
        cancel_token: CancellationToken,
        progress_callback: F,
    ) -> Result<()>
    where
        F: Fn(DownloadProgress) + Send + Sync + 'static,
    {
        // Create/open the file and pre-allocate space
        let file = self.prepare_file().await?;
        let file = Arc::new(tokio::sync::Mutex::new(file));

        // Create semaphore for connection limiting
        let semaphore = Arc::new(Semaphore::new(max_connections));

        // Shared state for progress tracking
        let progress_callback = Arc::new(progress_callback);
        let last_progress = Arc::new(RwLock::new(Instant::now()));
        let bytes_since_progress = Arc::new(AtomicU64::new(0));

        // Clone segments data for tasks
        let segments_data: Vec<_> = self
            .segments
            .iter()
            .enumerate()
            .filter(|(_, s)| !s.is_complete())
            .map(|(idx, s)| (idx, s.start, s.end, s.downloaded))
            .collect();

        // Spawn tasks for each pending segment
        let mut handles = Vec::new();

        for (segment_idx, start, end, already_downloaded) in segments_data {
            let client = client.clone();
            let url = self.url.clone();
            let user_agent = user_agent.to_string();
            let headers = headers.to_vec();
            let file = Arc::clone(&file);
            let semaphore = Arc::clone(&semaphore);
            let cancel_token = cancel_token.clone();
            let etag = self.etag.clone();
            let state = Arc::clone(&self.state);
            let progress_callback = Arc::clone(&progress_callback);
            let last_progress = Arc::clone(&last_progress);
            let bytes_since_progress = Arc::clone(&bytes_since_progress);
            let total_size = self.total_size;

            let handle = tokio::spawn(async move {
                // Acquire permit
                let _permit = semaphore.acquire().await.map_err(|_| EngineError::Shutdown)?;

                // Check cancellation
                if cancel_token.is_cancelled() {
                    return Ok(());
                }

                // Check if paused
                if state.paused.load(Ordering::Relaxed) {
                    return Ok(());
                }

                state.active_connections.fetch_add(1, Ordering::Relaxed);

                // Adjusted start position for resume
                let resume_start = start + already_downloaded;
                if resume_start > end {
                    // Already complete
                    state.active_connections.fetch_sub(1, Ordering::Relaxed);
                    return Ok(());
                }

                // Build request with Range header
                let mut request = client.get(&url);
                request = request.header("User-Agent", &user_agent);
                request = request.header("Range", format!("bytes={}-{}", resume_start, end));

                // Add ETag for validation if available
                if let Some(ref etag_val) = etag {
                    request = request.header("If-Range", etag_val);
                }

                // Add custom headers
                for (name, value) in &headers {
                    request = request.header(name.as_str(), value.as_str());
                }

                // Send request
                let response = request.send().await.map_err(|e| {
                    EngineError::network(
                        NetworkErrorKind::Other,
                        format!("Segment {} request failed: {}", segment_idx, e),
                    )
                })?;

                let status = response.status();
                if !status.is_success() && status != reqwest::StatusCode::PARTIAL_CONTENT {
                    state.active_connections.fetch_sub(1, Ordering::Relaxed);
                    return Err(EngineError::network(
                        NetworkErrorKind::HttpStatus(status.as_u16()),
                        format!("Segment {} HTTP error: {}", segment_idx, status),
                    ));
                }

                // Stream data to file
                let mut stream = response.bytes_stream();
                let mut segment_bytes: u64 = already_downloaded;
                let mut last_speed_update = Instant::now();
                let mut bytes_for_speed: u64 = 0;

                while let Some(chunk_result) = tokio::select! {
                    chunk = stream.next() => chunk,
                    _ = cancel_token.cancelled() => None,
                } {
                    // Check pause
                    if state.paused.load(Ordering::Relaxed) {
                        break;
                    }

                    let chunk: Bytes = match chunk_result {
                        Ok(c) => c,
                        Err(e) => {
                            state.active_connections.fetch_sub(1, Ordering::Relaxed);
                            return Err(EngineError::network(
                                NetworkErrorKind::Other,
                                format!("Segment {} stream error: {}", segment_idx, e),
                            ));
                        }
                    };

                    let chunk_len = chunk.len() as u64;

                    // Write to file at correct offset
                    {
                        let mut file = file.lock().await;
                        file.seek(SeekFrom::Start(start + segment_bytes))
                            .await
                            .map_err(|e| {
                                EngineError::storage(
                                    StorageErrorKind::Io,
                                    PathBuf::new(),
                                    format!("Seek failed: {}", e),
                                )
                            })?;
                        file.write_all(&chunk).await.map_err(|e| {
                            EngineError::storage(
                                StorageErrorKind::Io,
                                PathBuf::new(),
                                format!("Write failed: {}", e),
                            )
                        })?;
                    }

                    segment_bytes += chunk_len;

                    // Update global counters
                    state.downloaded.fetch_add(chunk_len, Ordering::Relaxed);
                    bytes_since_progress.fetch_add(chunk_len, Ordering::Relaxed);
                    bytes_for_speed += chunk_len;

                    // Update speed calculation
                    let now = Instant::now();
                    let speed_elapsed = now.duration_since(last_speed_update);
                    if speed_elapsed >= Duration::from_millis(500) {
                        let current_speed =
                            (bytes_for_speed as f64 / speed_elapsed.as_secs_f64()) as u64;
                        state.speed.store(current_speed, Ordering::Relaxed);
                        bytes_for_speed = 0;
                        last_speed_update = now;
                    }

                    // Emit progress at intervals
                    let mut last = last_progress.write();
                    if now.duration_since(*last) >= PROGRESS_INTERVAL {
                        let total_downloaded = state.downloaded.load(Ordering::Relaxed);
                        let current_speed = state.speed.load(Ordering::Relaxed);
                        let connections = state.active_connections.load(Ordering::Relaxed) as u32;

                        progress_callback(DownloadProgress {
                            total_size: Some(total_size),
                            completed_size: total_downloaded,
                            download_speed: current_speed,
                            upload_speed: 0,
                            connections,
                            seeders: 0,
                            peers: 0,
                            eta_seconds: if current_speed > 0 {
                                Some((total_size.saturating_sub(total_downloaded)) / current_speed)
                            } else {
                                None
                            },
                        });

                        *last = now;
                        bytes_since_progress.store(0, Ordering::Relaxed);
                    }
                }

                state.active_connections.fetch_sub(1, Ordering::Relaxed);

                // Segment task completed (either fully or paused/cancelled)
                Result::<()>::Ok(())
            });

            handles.push(handle);
        }

        // Wait for all segment tasks to complete
        for handle in handles {
            if let Err(e) = handle.await {
                tracing::error!("Segment task panicked: {:?}", e);
            }
        }

        // Sync file to disk
        {
            let mut file = file.lock().await;
            file.flush().await.map_err(|e| {
                EngineError::storage(
                    StorageErrorKind::Io,
                    &self.save_path,
                    format!("Flush failed: {}", e),
                )
            })?;
            file.sync_all().await.map_err(|e| {
                EngineError::storage(
                    StorageErrorKind::Io,
                    &self.save_path,
                    format!("Sync failed: {}", e),
                )
            })?;
        }

        // Final progress update
        let total_downloaded = self.state.downloaded.load(Ordering::Relaxed);
        progress_callback(DownloadProgress {
            total_size: Some(self.total_size),
            completed_size: total_downloaded,
            download_speed: 0,
            upload_speed: 0,
            connections: 0,
            seeders: 0,
            peers: 0,
            eta_seconds: None,
        });

        // Check if complete
        if total_downloaded >= self.total_size {
            // Rename from .part to final name
            self.finalize().await?;
        }

        Ok(())
    }

    /// Prepare the output file
    async fn prepare_file(&self) -> Result<File> {
        // Use .part extension during download
        let part_path = self.part_path();

        // Ensure parent directory exists
        if let Some(parent) = part_path.parent() {
            tokio::fs::create_dir_all(parent).await.map_err(|e| {
                EngineError::storage(
                    StorageErrorKind::Io,
                    parent,
                    format!("Create dir failed: {}", e),
                )
            })?;
        }

        // Check if file exists (for resume)
        let file = if part_path.exists() {
            OpenOptions::new()
                .write(true)
                .read(true)
                .open(&part_path)
                .await
                .map_err(|e| {
                    EngineError::storage(
                        StorageErrorKind::Io,
                        &part_path,
                        format!("Open failed: {}", e),
                    )
                })?
        } else {
            // Create new file and pre-allocate
            let file = File::create(&part_path).await.map_err(|e| {
                EngineError::storage(
                    StorageErrorKind::Io,
                    &part_path,
                    format!("Create failed: {}", e),
                )
            })?;

            // Pre-allocate space
            file.set_len(self.total_size).await.map_err(|e| {
                EngineError::storage(
                    StorageErrorKind::Io,
                    &part_path,
                    format!("Pre-allocate failed: {}", e),
                )
            })?;

            file
        };

        Ok(file)
    }

    /// Get the .part file path
    fn part_path(&self) -> PathBuf {
        let ext = self
            .save_path
            .extension()
            .map(|e| format!("{}.part", e.to_string_lossy()))
            .unwrap_or_else(|| "part".to_string());
        self.save_path.with_extension(ext)
    }

    /// Rename .part file to final name
    async fn finalize(&self) -> Result<()> {
        let part_path = self.part_path();
        if part_path.exists() {
            tokio::fs::rename(&part_path, &self.save_path)
                .await
                .map_err(|e| {
                    EngineError::storage(
                        StorageErrorKind::Io,
                        &self.save_path,
                        format!("Rename failed: {}", e),
                    )
                })?;
        }
        Ok(())
    }

    /// Pause the download
    pub fn pause(&self) {
        self.state.paused.store(true, Ordering::Relaxed);
    }

    /// Check if download is complete
    pub fn is_complete(&self) -> bool {
        self.state.downloaded.load(Ordering::Relaxed) >= self.total_size
    }

    /// Get current progress
    pub fn progress(&self) -> DownloadProgress {
        DownloadProgress {
            total_size: Some(self.total_size),
            completed_size: self.state.downloaded.load(Ordering::Relaxed),
            download_speed: self.state.speed.load(Ordering::Relaxed),
            upload_speed: 0,
            connections: self.state.active_connections.load(Ordering::Relaxed) as u32,
            seeders: 0,
            peers: 0,
            eta_seconds: {
                let speed = self.state.speed.load(Ordering::Relaxed);
                let remaining = self
                    .total_size
                    .saturating_sub(self.state.downloaded.load(Ordering::Relaxed));
                if speed > 0 {
                    Some(remaining / speed)
                } else {
                    None
                }
            },
        }
    }
}

/// Calculate optimal number of segments based on file size and constraints
pub fn calculate_segment_count(
    total_size: u64,
    max_connections: usize,
    min_segment_size: u64,
) -> usize {
    if total_size == 0 {
        return 1;
    }

    // Calculate maximum segments based on min_segment_size
    let max_segments_by_size = (total_size / min_segment_size) as usize;

    // Use the smaller of max_connections and max_segments_by_size
    let num_segments = max_connections.min(max_segments_by_size.max(1));

    // Ensure at least 1 segment
    num_segments.max(1)
}

/// Probe server capabilities with a HEAD request
pub async fn probe_server(
    client: &Client,
    url: &str,
    user_agent: &str,
) -> Result<ServerCapabilities> {
    let response = client
        .head(url)
        .header("User-Agent", user_agent)
        .send()
        .await
        .map_err(|e| {
            EngineError::network(
                NetworkErrorKind::Other,
                format!("HEAD request failed: {}", e),
            )
        })?;

    if !response.status().is_success() {
        return Err(EngineError::network(
            NetworkErrorKind::HttpStatus(response.status().as_u16()),
            format!("HEAD request returned: {}", response.status()),
        ));
    }

    let headers = response.headers();

    let content_length = headers
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok());

    let supports_range = headers
        .get("accept-ranges")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.contains("bytes"))
        .unwrap_or(false);

    let etag = headers
        .get("etag")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let last_modified = headers
        .get("last-modified")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let suggested_filename = headers
        .get("content-disposition")
        .and_then(|v| v.to_str().ok())
        .and_then(parse_content_disposition);

    Ok(ServerCapabilities {
        content_length,
        supports_range,
        etag,
        last_modified,
        suggested_filename,
    })
}

/// Parse filename from Content-Disposition header
fn parse_content_disposition(header: &str) -> Option<String> {
    // Look for filename="..." or filename*=UTF-8''...
    if let Some(start) = header.find("filename=") {
        let rest = &header[start + 9..];
        if let Some(stripped) = rest.strip_prefix('"') {
            let end = stripped.find('"')?;
            return Some(stripped[..end].to_string());
        } else {
            let end = rest.find(';').unwrap_or(rest.len());
            return Some(rest[..end].trim().to_string());
        }
    }

    if let Some(start) = header.find("filename*=") {
        let rest = &header[start + 10..];
        if let Some(quote_start) = rest.find("''") {
            let encoded = &rest[quote_start + 2..];
            let end = encoded.find(';').unwrap_or(encoded.len());
            if let Ok(decoded) = urlencoding::decode(&encoded[..end]) {
                return Some(decoded.to_string());
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_segment_count() {
        // 100MB file, 16 connections, 1MB min
        assert_eq!(
            calculate_segment_count(100 * 1024 * 1024, 16, 1024 * 1024),
            16
        );

        // 10MB file, 16 connections, 1MB min -> only 10 segments
        assert_eq!(
            calculate_segment_count(10 * 1024 * 1024, 16, 1024 * 1024),
            10
        );

        // 500KB file, 16 connections, 1MB min -> 1 segment
        assert_eq!(calculate_segment_count(512 * 1024, 16, 1024 * 1024), 1);

        // Empty file
        assert_eq!(calculate_segment_count(0, 16, 1024 * 1024), 1);

        // Very large file
        assert_eq!(
            calculate_segment_count(10 * 1024 * 1024 * 1024, 16, 1024 * 1024),
            16
        );
    }

    #[test]
    fn test_segment_init() {
        let mut download = SegmentedDownload::new(
            "https://example.com/file.zip".to_string(),
            100 * 1024 * 1024, // 100MB
            PathBuf::from("/tmp/file.zip"),
            true,
            None,
            None,
        );

        download.init_segments(16, 1024 * 1024);

        let segments = download.segments();
        assert_eq!(segments.len(), 16);

        // Check segment boundaries
        assert_eq!(segments[0].start, 0);
        assert_eq!(segments[15].end, 100 * 1024 * 1024 - 1);

        // Check segments are contiguous
        for i in 0..15 {
            assert_eq!(segments[i].end + 1, segments[i + 1].start);
        }
    }

    #[test]
    fn test_parse_content_disposition() {
        assert_eq!(
            parse_content_disposition("attachment; filename=\"test.zip\""),
            Some("test.zip".to_string())
        );

        assert_eq!(
            parse_content_disposition("attachment; filename=test.zip"),
            Some("test.zip".to_string())
        );

        assert_eq!(
            parse_content_disposition("attachment; filename*=UTF-8''test%20file.zip"),
            Some("test file.zip".to_string())
        );
    }
}
