//! BitTorrent Module
//!
//! This module handles BitTorrent protocol downloads including:
//! - Torrent file parsing (metainfo)
//! - Magnet URI handling
//! - Tracker communication (HTTP/UDP)
//! - Peer wire protocol
//! - Piece management with SHA-1 verification
//! - DHT peer discovery (BEP 5)
//! - Peer Exchange (BEP 11)
//! - Local Peer Discovery (BEP 14)
//! - Choking algorithm

pub mod bencode;
pub mod choking;
pub mod dht;
pub mod lpd;
pub mod magnet;
pub mod metainfo;
pub mod peer;
pub mod pex;
pub mod piece;
pub mod tracker;

// Re-export commonly used types
pub use bencode::BencodeValue;
pub use choking::{ChokingConfig, ChokingDecision, ChokingManager, PeerStats};
pub use dht::{DhtClient, DhtManager};
pub use lpd::{LocalPeer, LpdManager, LpdService};
pub use magnet::MagnetUri;
pub use metainfo::{FileInfo, Info, Metainfo, Sha1Hash};
pub use peer::{ConnectionState, PeerConnection, PeerMessage, BLOCK_SIZE, OUR_PEX_EXTENSION_ID};
pub use pex::{ExtensionHandshake, PexMessage, PexState, PEX_EXTENSION_NAME};
pub use piece::{BlockRequest, PendingPiece, PieceManager, PieceProgress};
pub use tracker::{
    AnnounceEvent, AnnounceRequest, AnnounceResponse, PeerAddr, ScrapeInfo, ScrapeRequest,
    ScrapeResponse, TrackerClient,
};

use std::collections::{HashMap, HashSet};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::RwLock;
use tokio::sync::{broadcast, Semaphore};

use crate::error::Result;
use crate::types::{DownloadEvent, DownloadId, DownloadProgress};

/// Configuration for torrent downloads
#[derive(Debug, Clone)]
pub struct TorrentConfig {
    /// Maximum number of peers per torrent
    pub max_peers: usize,
    /// Port range for incoming connections
    pub listen_port_range: (u16, u16),
    /// Enable DHT (Phase 4)
    pub enable_dht: bool,
    /// Enable Peer Exchange (Phase 4)
    pub enable_pex: bool,
    /// Enable Local Peer Discovery (Phase 4)
    pub enable_lpd: bool,
    /// Seed ratio limit (stop seeding after this ratio)
    pub seed_ratio: Option<f64>,
    /// Maximum upload speed (bytes/sec, 0 = unlimited)
    pub max_upload_speed: u64,
    /// Maximum download speed (bytes/sec, 0 = unlimited)
    pub max_download_speed: u64,
    /// Announce interval override (0 = use tracker's)
    pub announce_interval: u64,
    /// Request timeout for blocks
    pub request_timeout: Duration,
    /// Keep-alive interval
    pub keepalive_interval: Duration,
}

impl Default for TorrentConfig {
    fn default() -> Self {
        Self {
            max_peers: 50,
            listen_port_range: (6881, 6889),
            enable_dht: true,
            enable_pex: true,
            enable_lpd: true,
            seed_ratio: None,
            max_upload_speed: 0,
            max_download_speed: 0,
            announce_interval: 0,
            request_timeout: Duration::from_secs(30),
            keepalive_interval: Duration::from_secs(120),
        }
    }
}

/// State of a torrent download
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TorrentState {
    /// Checking existing files
    Checking,
    /// Downloading metadata (for magnet links)
    Metadata,
    /// Downloading pieces
    Downloading,
    /// Seeding (complete)
    Seeding,
    /// Paused
    Paused,
    /// Stopped
    Stopped,
    /// Error
    Error,
}

/// Torrent download coordinator
#[allow(dead_code)]
pub struct TorrentDownloader {
    /// Download ID
    id: DownloadId,
    /// Metainfo (None for magnet links until metadata received)
    metainfo: RwLock<Option<Arc<Metainfo>>>,
    /// Magnet URI (if started from magnet)
    magnet: Option<MagnetUri>,
    /// Info hash
    info_hash: Sha1Hash,
    /// Save directory
    save_dir: PathBuf,
    /// Configuration
    config: TorrentConfig,
    /// Piece manager
    piece_manager: RwLock<Option<Arc<PieceManager>>>,
    /// Tracker client
    tracker_client: TrackerClient,
    /// Current state
    state: RwLock<TorrentState>,
    /// Connected peers
    peers: RwLock<HashMap<SocketAddr, PeerInfo>>,
    /// Known peer addresses (from trackers, DHT, etc.)
    known_peers: RwLock<HashSet<SocketAddr>>,
    /// Event sender
    event_tx: broadcast::Sender<DownloadEvent>,
    /// Shutdown flag
    shutdown: AtomicBool,
    /// Statistics
    stats: TorrentStats,
    /// Peer connection semaphore
    peer_semaphore: Semaphore,
}

/// Information about a connected peer
#[derive(Debug)]
#[allow(dead_code)]
struct PeerInfo {
    /// Socket address
    addr: SocketAddr,
    /// Peer ID
    peer_id: Option<[u8; 20]>,
    /// Client name
    client: Option<String>,
    /// Connection established time
    connected_at: Instant,
    /// Download speed (bytes/sec)
    download_speed: u64,
    /// Upload speed (bytes/sec)
    upload_speed: u64,
    /// Total downloaded
    downloaded: u64,
    /// Total uploaded
    uploaded: u64,
    /// Is choking us
    choking: bool,
    /// Is interested in us
    interested: bool,
}

/// Torrent statistics
#[allow(dead_code)]
struct TorrentStats {
    downloaded: AtomicU64,
    uploaded: AtomicU64,
    download_speed: AtomicU64,
    upload_speed: AtomicU64,
    peers_connected: AtomicU64,
    seeders: AtomicU64,
    leechers: AtomicU64,
}

impl TorrentStats {
    fn new() -> Self {
        Self {
            downloaded: AtomicU64::new(0),
            uploaded: AtomicU64::new(0),
            download_speed: AtomicU64::new(0),
            upload_speed: AtomicU64::new(0),
            peers_connected: AtomicU64::new(0),
            seeders: AtomicU64::new(0),
            leechers: AtomicU64::new(0),
        }
    }
}

impl TorrentDownloader {
    /// Create a new torrent downloader from a .torrent file
    pub fn from_torrent(
        id: DownloadId,
        metainfo: Metainfo,
        save_dir: PathBuf,
        config: TorrentConfig,
        event_tx: broadcast::Sender<DownloadEvent>,
    ) -> Result<Self> {
        let info_hash = metainfo.info_hash;
        let metainfo = Arc::new(metainfo);
        let piece_manager = Arc::new(PieceManager::new(metainfo.clone(), save_dir.clone()));

        Ok(Self {
            id,
            metainfo: RwLock::new(Some(metainfo)),
            magnet: None,
            info_hash,
            save_dir,
            config: config.clone(),
            piece_manager: RwLock::new(Some(piece_manager)),
            tracker_client: TrackerClient::new(),
            state: RwLock::new(TorrentState::Checking),
            peers: RwLock::new(HashMap::new()),
            known_peers: RwLock::new(HashSet::new()),
            event_tx,
            shutdown: AtomicBool::new(false),
            stats: TorrentStats::new(),
            peer_semaphore: Semaphore::new(config.max_peers),
        })
    }

    /// Create a new torrent downloader from a magnet URI
    pub fn from_magnet(
        id: DownloadId,
        magnet: MagnetUri,
        save_dir: PathBuf,
        config: TorrentConfig,
        event_tx: broadcast::Sender<DownloadEvent>,
    ) -> Result<Self> {
        let info_hash = magnet.info_hash;

        Ok(Self {
            id,
            metainfo: RwLock::new(None),
            magnet: Some(magnet),
            info_hash,
            save_dir,
            config: config.clone(),
            piece_manager: RwLock::new(None),
            tracker_client: TrackerClient::new(),
            state: RwLock::new(TorrentState::Metadata),
            peers: RwLock::new(HashMap::new()),
            known_peers: RwLock::new(HashSet::new()),
            event_tx,
            shutdown: AtomicBool::new(false),
            stats: TorrentStats::new(),
            peer_semaphore: Semaphore::new(config.max_peers),
        })
    }

    /// Get the download ID
    pub fn id(&self) -> DownloadId {
        self.id
    }

    /// Get the info hash
    pub fn info_hash(&self) -> &Sha1Hash {
        &self.info_hash
    }

    /// Get the info hash as hex string
    pub fn info_hash_hex(&self) -> String {
        self.info_hash
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect()
    }

    /// Get the current state
    pub fn state(&self) -> TorrentState {
        *self.state.read()
    }

    /// Get the name (from metainfo or magnet)
    pub fn name(&self) -> String {
        if let Some(ref metainfo) = *self.metainfo.read() {
            metainfo.info.name.clone()
        } else if let Some(ref magnet) = self.magnet {
            magnet.name()
        } else {
            self.info_hash_hex()
        }
    }

    /// Get progress information
    pub fn progress(&self) -> DownloadProgress {
        let pm_guard = self.piece_manager.read();

        let (completed_size, total_size) = if let Some(ref pm) = *pm_guard {
            let progress = pm.progress();
            (progress.verified_bytes, progress.total_size)
        } else {
            (0, 0)
        };

        DownloadProgress {
            total_size: if total_size > 0 { Some(total_size) } else { None },
            completed_size,
            download_speed: self.stats.download_speed.load(Ordering::Relaxed),
            upload_speed: self.stats.upload_speed.load(Ordering::Relaxed),
            connections: self.stats.peers_connected.load(Ordering::Relaxed) as u32,
            seeders: self.stats.seeders.load(Ordering::Relaxed) as u32,
            peers: self.stats.leechers.load(Ordering::Relaxed) as u32,
            eta_seconds: self.calculate_eta(),
        }
    }

    /// Calculate ETA in seconds
    fn calculate_eta(&self) -> Option<u64> {
        let pm_guard = self.piece_manager.read();
        let pm = pm_guard.as_ref()?;

        let progress = pm.progress();
        let remaining = progress.bytes_remaining();

        if remaining == 0 {
            return Some(0);
        }

        let speed = self.stats.download_speed.load(Ordering::Relaxed);
        if speed == 0 {
            return None;
        }

        Some(remaining / speed)
    }

    /// Start the download
    #[allow(clippy::await_holding_lock)]
    pub async fn start(&self) -> Result<()> {
        // Verify existing files if we have metainfo
        if let Some(ref pm) = *self.piece_manager.read() {
            *self.state.write() = TorrentState::Checking;

            let valid = pm.verify_existing().await?;
            tracing::info!(
                "Verified {} existing pieces for torrent {}",
                valid,
                self.info_hash_hex()
            );

            if pm.is_complete() {
                *self.state.write() = TorrentState::Seeding;
            } else {
                *self.state.write() = TorrentState::Downloading;
            }
        }

        // Announce to trackers
        self.announce_to_trackers(AnnounceEvent::Started).await?;

        // Start peer connection loop
        // This would be spawned as a task in real usage

        Ok(())
    }

    /// Announce to all known trackers
    #[allow(clippy::await_holding_lock)]
    async fn announce_to_trackers(&self, event: AnnounceEvent) -> Result<()> {
        let trackers = self.get_tracker_urls();

        if trackers.is_empty() {
            tracing::warn!(
                "No trackers available for torrent {}",
                self.info_hash_hex()
            );
            return Ok(());
        }

        let pm_guard = self.piece_manager.read();
        let (downloaded, left) = if let Some(ref pm) = *pm_guard {
            let progress = pm.progress();
            (progress.verified_bytes, progress.bytes_remaining())
        } else {
            (0, 0)
        };
        drop(pm_guard);

        let request = AnnounceRequest {
            info_hash: self.info_hash,
            peer_id: *self.tracker_client.peer_id(),
            port: self.config.listen_port_range.0,
            uploaded: self.stats.uploaded.load(Ordering::Relaxed),
            downloaded,
            left,
            event,
            compact: true,
            numwant: Some(self.config.max_peers as u32),
            key: None,
            tracker_id: None,
        };

        for tracker_url in trackers {
            match self.tracker_client.announce(&tracker_url, &request).await {
                Ok(response) => {
                    tracing::info!(
                        "Announced to {}: {} peers, interval {}s",
                        tracker_url,
                        response.peers.len(),
                        response.interval
                    );

                    // Update stats
                    if let Some(complete) = response.complete {
                        self.stats.seeders.store(complete as u64, Ordering::Relaxed);
                    }
                    if let Some(incomplete) = response.incomplete {
                        self.stats
                            .leechers
                            .store(incomplete as u64, Ordering::Relaxed);
                    }

                    // Add peers to known list
                    let mut known = self.known_peers.write();
                    for peer in response.peers {
                        if let Some(addr) = peer.to_socket_addr() {
                            known.insert(addr);
                        }
                    }
                }
                Err(e) => {
                    tracing::warn!("Failed to announce to {}: {}", tracker_url, e);
                }
            }
        }

        Ok(())
    }

    /// Get tracker URLs
    fn get_tracker_urls(&self) -> Vec<String> {
        if let Some(ref metainfo) = *self.metainfo.read() {
            metainfo.all_trackers()
        } else if let Some(ref magnet) = self.magnet {
            magnet.trackers.clone()
        } else {
            Vec::new()
        }
    }

    /// Pause the download
    pub fn pause(&self) {
        *self.state.write() = TorrentState::Paused;
        // Disconnect all peers and stop requesting
    }

    /// Resume the download
    pub fn resume(&self) {
        let current = *self.state.read();
        if current == TorrentState::Paused {
            // Determine new state based on progress
            let pm_guard = self.piece_manager.read();
            if let Some(ref pm) = *pm_guard {
                if pm.is_complete() {
                    *self.state.write() = TorrentState::Seeding;
                } else {
                    *self.state.write() = TorrentState::Downloading;
                }
            }
        }
    }

    /// Stop the download
    pub async fn stop(&self) -> Result<()> {
        self.shutdown.store(true, Ordering::SeqCst);
        *self.state.write() = TorrentState::Stopped;

        // Announce stopped
        self.announce_to_trackers(AnnounceEvent::Stopped).await?;

        Ok(())
    }

    /// Check if download is complete
    pub fn is_complete(&self) -> bool {
        let pm_guard = self.piece_manager.read();
        pm_guard.as_ref().map(|pm| pm.is_complete()).unwrap_or(false)
    }

    /// Get number of connected peers
    pub fn peer_count(&self) -> usize {
        self.peers.read().len()
    }

    /// Get list of known peer addresses
    pub fn known_peer_addresses(&self) -> Vec<SocketAddr> {
        self.known_peers.read().iter().cloned().collect()
    }

    /// Check if this is a private torrent.
    ///
    /// Private torrents should not use DHT, PEX, or LPD (BEP 27).
    pub fn is_private(&self) -> bool {
        self.metainfo
            .read()
            .as_ref()
            .map(|m| m.info.private)
            .unwrap_or(false)
    }

    /// Add discovered peers to the known peers list.
    ///
    /// This is used by DHT, PEX, and LPD to add discovered peers.
    pub fn add_known_peers(&self, peers: impl IntoIterator<Item = SocketAddr>) {
        let mut known = self.known_peers.write();
        for peer in peers {
            known.insert(peer);
        }
    }

    /// Get the configuration.
    pub fn config(&self) -> &TorrentConfig {
        &self.config
    }

    /// Check if DHT is enabled for this torrent.
    pub fn dht_enabled(&self) -> bool {
        self.config.enable_dht && !self.is_private()
    }

    /// Check if PEX is enabled for this torrent.
    pub fn pex_enabled(&self) -> bool {
        self.config.enable_pex && !self.is_private()
    }

    /// Check if LPD is enabled for this torrent.
    pub fn lpd_enabled(&self) -> bool {
        self.config.enable_lpd && !self.is_private()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_torrent_config_default() {
        let config = TorrentConfig::default();
        assert_eq!(config.max_peers, 50);
        assert_eq!(config.listen_port_range, (6881, 6889));
        assert!(config.enable_dht);
    }

    #[test]
    fn test_torrent_state() {
        assert_ne!(TorrentState::Downloading, TorrentState::Seeding);
        assert_eq!(TorrentState::Paused, TorrentState::Paused);
    }
}
