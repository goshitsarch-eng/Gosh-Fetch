# gosh-dl Technical Specification

A native Rust download engine supporting HTTP/HTTPS and BitTorrent protocols.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Core API](#core-api)
3. [HTTP Implementation](#http-implementation)
4. [BitTorrent Implementation](#bittorrent-implementation)
5. [Storage Layer](#storage-layer)
6. [Configuration](#configuration)

---

## Architecture

### Design Principles

- **Library-first**: Reusable crate, not tied to any specific application
- **Async-native**: Built on Tokio for efficient concurrent operations
- **Type-safe**: Strong typing throughout, minimal runtime errors
- **Observable**: Event-driven architecture for progress tracking

### Module Structure

```
src/
├── lib.rs                 # Public API, re-exports
├── engine.rs              # DownloadEngine - main coordinator
├── types.rs               # Core types (DownloadId, Status, Progress)
├── error.rs               # Typed error hierarchy
├── config.rs              # EngineConfig and sub-configs
│
├── http/                  # HTTP download engine
│   ├── mod.rs             # HttpDownloader
│   ├── segment.rs         # Segmented download logic
│   ├── connection.rs      # Connection pooling, rate limiting
│   └── resume.rs          # Resume detection
│
├── torrent/               # BitTorrent engine
│   ├── mod.rs             # TorrentDownloader
│   ├── bencode.rs         # Bencode parser
│   ├── metainfo.rs        # Torrent file parser
│   ├── magnet.rs          # Magnet URI parser
│   ├── tracker.rs         # HTTP/UDP tracker clients
│   ├── peer.rs            # Peer wire protocol
│   ├── piece.rs           # Piece management
│   ├── dht.rs             # DHT client (BEP 5)
│   ├── pex.rs             # Peer Exchange (BEP 11)
│   ├── lpd.rs             # Local Peer Discovery (BEP 14)
│   └── choking.rs         # Choking algorithm
│
└── storage/               # Persistence layer
    ├── mod.rs             # Storage trait + MemoryStorage
    └── sqlite.rs          # SQLite backend
```

---

## Core API

### DownloadEngine

```rust
impl DownloadEngine {
    // Lifecycle
    pub async fn new(config: EngineConfig) -> Result<Arc<Self>>;
    pub async fn shutdown(&self) -> Result<()>;

    // Downloads
    pub async fn add_http(&self, url: &str, opts: DownloadOptions) -> Result<DownloadId>;
    pub async fn add_torrent(&self, data: &[u8], opts: DownloadOptions) -> Result<DownloadId>;
    pub async fn add_magnet(&self, uri: &str, opts: DownloadOptions) -> Result<DownloadId>;

    // Control
    pub async fn pause(&self, id: DownloadId) -> Result<()>;
    pub async fn resume(&self, id: DownloadId) -> Result<()>;
    pub async fn cancel(&self, id: DownloadId, delete_files: bool) -> Result<()>;

    // Status
    pub fn status(&self, id: DownloadId) -> Option<DownloadStatus>;
    pub fn list(&self) -> Vec<DownloadStatus>;
    pub fn active(&self) -> Vec<DownloadStatus>;
    pub fn waiting(&self) -> Vec<DownloadStatus>;
    pub fn stopped(&self) -> Vec<DownloadStatus>;
    pub fn global_stats(&self) -> GlobalStats;

    // Events
    pub fn subscribe(&self) -> broadcast::Receiver<DownloadEvent>;

    // Configuration
    pub fn set_config(&self, config: EngineConfig) -> Result<()>;
    pub fn get_config(&self) -> EngineConfig;
}
```

### Events

```rust
pub enum DownloadEvent {
    Added { id: DownloadId },
    Started { id: DownloadId },
    Progress { id: DownloadId, progress: DownloadProgress },
    StateChanged { id: DownloadId, old_state: DownloadState, new_state: DownloadState },
    Completed { id: DownloadId },
    Failed { id: DownloadId, error: String, retryable: bool },
    Removed { id: DownloadId },
    Paused { id: DownloadId },
    Resumed { id: DownloadId },
}
```

### Error Hierarchy

```rust
pub enum EngineError {
    Network { kind: NetworkErrorKind, message: String, retryable: bool },
    Storage { kind: StorageErrorKind, path: PathBuf, message: String },
    Protocol { kind: ProtocolErrorKind, message: String },
    InvalidInput { field: &'static str, message: String },
    ResourceLimit { resource: &'static str, limit: usize },
    NotFound(String),
    AlreadyExists(String),
    InvalidState { action: &'static str, current_state: String },
    Shutdown,
    Database(String),
    Internal(String),
}

pub enum NetworkErrorKind {
    DnsResolution, ConnectionRefused, ConnectionReset, Timeout,
    Tls, HttpStatus(u16), Unreachable, TooManyRedirects, Other,
}

pub enum StorageErrorKind {
    NotFound, PermissionDenied, DiskFull, PathTraversal,
    AlreadyExists, InvalidPath, Io,
}

pub enum ProtocolErrorKind {
    InvalidUrl, RangeNotSupported, InvalidResponse, InvalidTorrent,
    InvalidMagnet, HashMismatch, TrackerError, PeerProtocol, BencodeParse,
    DhtError, PexError, LpdError,
}
```

---

## HTTP Implementation

### Segmented Downloads

Supports up to 16 parallel connections per download with automatic fallback for servers that don't support range requests.

```rust
pub struct SegmentedDownload {
    id: DownloadId,
    url: String,
    segments: Vec<Segment>,
    file: Arc<Mutex<File>>,
    total_size: u64,
    supports_range: bool,
    etag: Option<String>,
}

pub struct Segment {
    pub index: usize,
    pub start: u64,
    pub end: u64,
    pub downloaded: u64,
    pub state: SegmentState,
}

pub enum SegmentState {
    Pending,
    Downloading,
    Completed,
    Failed { error: String, retries: u32 },
}
```

**Segment calculation:**
```rust
fn calculate_segments(total_size: u64, max_connections: usize, min_segment_size: u64) -> usize {
    let ideal = max_connections;
    let min_segments = (total_size / min_segment_size) as usize;
    ideal.min(min_segments).max(1)
}
```

### Download Flow

```
HEAD Request → Content-Length, Accept-Ranges, ETag
    ↓
Calculate Segments (e.g., 100MB ÷ 16 = 6.25MB each)
    ↓
Spawn N tasks with Range headers
    ↓
Each task writes to correct file offset
    ↓
Aggregate progress from all segments
    ↓
Rename .part file on completion
```

### Resume Detection

Resume is validated using ETag/Last-Modified headers. If server content has changed, download restarts from beginning.

### Speed Limiting

Uses token bucket algorithm via `governor` crate:

```rust
pub struct SpeedLimiter {
    limiter: Option<RateLimiter>,
}

impl SpeedLimiter {
    pub fn new(bytes_per_second: Option<u64>) -> Self;
    pub async fn acquire(&self, bytes: u64);
}
```

### Retry Policy

Exponential backoff with jitter:

```rust
pub struct RetryPolicy {
    max_attempts: u32,
    initial_delay_ms: u64,
    max_delay_ms: u64,
    jitter_factor: f64,  // ±25% randomness
}
```

---

## BitTorrent Implementation

### Bencode Format

```
Integers:   i<number>e        Example: i42e
Strings:    <length>:<data>   Example: 4:spam
Lists:      l<items>e         Example: l4:spami42ee
Dicts:      d<pairs>e         Example: d3:cow3:moo4:spam4:eggse
```

```rust
pub enum BencodeValue {
    Integer(i64),
    Bytes(Vec<u8>),
    List(Vec<BencodeValue>),
    Dict(BTreeMap<Vec<u8>, BencodeValue>),
}

impl BencodeValue {
    pub fn parse(data: &[u8]) -> Result<(Self, &[u8])>;
    pub fn encode(&self) -> Vec<u8>;
    pub fn as_string(&self) -> Option<&str>;
    pub fn as_int(&self) -> Option<i64>;
    pub fn as_bytes(&self) -> Option<&[u8]>;
    pub fn as_list(&self) -> Option<&[BencodeValue]>;
    pub fn as_dict(&self) -> Option<&BTreeMap<Vec<u8>, BencodeValue>>;
}
```

### Metainfo (Torrent Files)

```rust
pub struct Metainfo {
    pub info_hash: [u8; 20],
    pub info: Info,
    pub announce: Option<String>,
    pub announce_list: Vec<Vec<String>>,
    pub creation_date: Option<i64>,
    pub comment: Option<String>,
    pub created_by: Option<String>,
}

pub struct Info {
    pub name: String,
    pub piece_length: u64,
    pub pieces: Vec<[u8; 20]>,  // SHA-1 hashes
    pub files: Vec<FileInfo>,
    pub total_size: u64,
}

pub struct FileInfo {
    pub path: PathBuf,
    pub length: u64,
    pub offset: u64,  // Offset in concatenated file stream
}
```

### Magnet URIs

Format: `magnet:?xt=urn:btih:<hash>&dn=<name>&tr=<tracker>`

```rust
pub struct MagnetUri {
    pub info_hash: [u8; 20],
    pub display_name: Option<String>,
    pub trackers: Vec<String>,
    pub web_seeds: Vec<String>,
    pub exact_length: Option<u64>,
}
```

### Tracker Protocol

**HTTP Tracker (BEP 3):**
```rust
pub struct AnnounceRequest {
    pub info_hash: [u8; 20],
    pub peer_id: [u8; 20],
    pub port: u16,
    pub uploaded: u64,
    pub downloaded: u64,
    pub left: u64,
    pub event: AnnounceEvent,  // Started, Stopped, Completed, None
    pub compact: bool,
}

pub struct AnnounceResponse {
    pub interval: u32,
    pub min_interval: Option<u32>,
    pub peers: Vec<PeerAddr>,
    pub complete: Option<u32>,    // Seeders
    pub incomplete: Option<u32>,  // Leechers
}
```

**UDP Tracker (BEP 15):** Connection handshake followed by announce.

### Peer Wire Protocol

**Handshake (68 bytes):**
```
<pstrlen=19><pstr="BitTorrent protocol"><reserved=8 bytes><info_hash=20><peer_id=20>
```

**Messages:**
```rust
pub enum PeerMessage {
    KeepAlive,
    Choke,
    Unchoke,
    Interested,
    NotInterested,
    Have { piece_index: u32 },
    Bitfield { bitfield: Vec<u8> },
    Request { index: u32, begin: u32, length: u32 },
    Piece { index: u32, begin: u32, block: Vec<u8> },
    Cancel { index: u32, begin: u32, length: u32 },
    Port { port: u16 },  // DHT port
    Extended { id: u8, payload: Vec<u8> },  // BEP 10
}
```

### Piece Manager

```rust
pub struct PieceManager {
    metainfo: Arc<Metainfo>,
    have: BitVec,
    pending: HashMap<u32, PendingPiece>,
    verified: AtomicU64,
}

impl PieceManager {
    pub fn need_piece(&self, index: u32) -> bool;
    pub fn select_piece(&self, peer_has: &BitVec) -> Option<u32>;  // Rarest-first
    pub fn add_block(&mut self, index: u32, offset: u32, data: Vec<u8>) -> Result<()>;
    pub fn verify_piece(&mut self, index: u32) -> Result<bool>;  // SHA-1 verification
    pub fn progress(&self) -> f64;
}
```

**Endgame Mode:** When few pieces remain, request same blocks from multiple peers and cancel duplicates on receipt.

### DHT (BEP 5)

Uses `mainline` crate for Mainline DHT:

```rust
pub struct DhtClient {
    dht: Dht,
}

impl DhtClient {
    pub async fn new(bootstrap_nodes: &[String]) -> Result<Self>;
    pub async fn announce(&self, info_hash: [u8; 20], port: u16) -> Result<()>;
    pub async fn get_peers(&self, info_hash: [u8; 20]) -> Result<Vec<SocketAddr>>;
}
```

### PEX (BEP 11)

Peer Exchange via BEP 10 extension protocol:

```rust
pub struct PexManager {
    known_peers: HashSet<SocketAddr>,
    added_since_last: Vec<SocketAddr>,
    dropped_since_last: Vec<SocketAddr>,
}

impl PexManager {
    pub fn process_pex(&mut self, added: &[u8], dropped: &[u8]);
    pub fn generate_pex(&mut self) -> (Vec<u8>, Vec<u8>);
}
```

### LPD (BEP 14)

Local Peer Discovery via UDP multicast to `239.192.152.143:6771`:

```
BT-SEARCH * HTTP/1.1\r\n
Host: 239.192.152.143:6771\r\n
Port: <port>\r\n
Infohash: <hex info_hash>\r\n
\r\n
```

### Choking Algorithm

Recalculates every 10 seconds, rotates optimistic unchoke every 30 seconds:

1. Sort peers by download rate (reciprocity)
2. Unchoke top 4 peers
3. Keep 1 slot for optimistic unchoke (random peer)

---

## Storage Layer

### Storage Trait

```rust
#[async_trait]
pub trait Storage: Send + Sync {
    async fn save_download(&self, status: &DownloadStatus) -> Result<()>;
    async fn load_download(&self, id: DownloadId) -> Result<Option<DownloadStatus>>;
    async fn load_all(&self) -> Result<Vec<DownloadStatus>>;
    async fn delete_download(&self, id: DownloadId) -> Result<()>;
    async fn save_segments(&self, id: DownloadId, segments: &[Segment]) -> Result<()>;
    async fn load_segments(&self, id: DownloadId) -> Result<Vec<Segment>>;
}
```

### SQLite Schema

```sql
CREATE TABLE IF NOT EXISTS downloads (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,                     -- 'http', 'torrent', 'magnet'
    state TEXT NOT NULL,                    -- JSON: DownloadState
    url TEXT,
    magnet_uri TEXT,
    info_hash TEXT,
    name TEXT NOT NULL,
    save_dir TEXT NOT NULL,
    filename TEXT,
    total_size INTEGER,
    completed_size INTEGER DEFAULT 0,
    etag TEXT,
    last_modified TEXT,
    supports_range INTEGER DEFAULT 0,
    piece_length INTEGER,
    pieces_have BLOB,
    user_agent TEXT,
    referer TEXT,
    headers_json TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    download_id TEXT NOT NULL,
    segment_index INTEGER NOT NULL,
    start_byte INTEGER NOT NULL,
    end_byte INTEGER NOT NULL,
    downloaded INTEGER DEFAULT 0,
    state TEXT NOT NULL,
    error_message TEXT,
    retries INTEGER DEFAULT 0,
    FOREIGN KEY (download_id) REFERENCES downloads(id) ON DELETE CASCADE,
    UNIQUE (download_id, segment_index)
);

CREATE INDEX IF NOT EXISTS idx_downloads_state ON downloads(state);
CREATE INDEX IF NOT EXISTS idx_downloads_kind ON downloads(kind);
CREATE INDEX IF NOT EXISTS idx_segments_download ON segments(download_id);

PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
```

---

## Configuration

```rust
pub struct EngineConfig {
    pub download_dir: PathBuf,
    pub max_concurrent_downloads: usize,        // Default: 5
    pub max_connections_per_download: usize,    // Default: 16
    pub min_segment_size: u64,                  // Default: 1 MiB
    pub global_download_limit: Option<u64>,     // bytes/sec
    pub global_upload_limit: Option<u64>,       // bytes/sec
    pub user_agent: String,
    pub enable_dht: bool,                       // Default: true
    pub enable_pex: bool,                       // Default: true
    pub enable_lpd: bool,                       // Default: true
    pub max_peers: usize,                       // Default: 55
    pub seed_ratio: f64,                        // Default: 1.0
    pub database_path: Option<PathBuf>,
    pub http: HttpConfig,
    pub torrent: TorrentConfig,
}

pub struct HttpConfig {
    pub connect_timeout: u64,                   // Default: 30 seconds
    pub read_timeout: u64,                      // Default: 60 seconds
    pub max_redirects: usize,                   // Default: 10
    pub max_retries: usize,                     // Default: 3
    pub retry_delay_ms: u64,                    // Default: 1000
    pub max_retry_delay_ms: u64,                // Default: 30000
    pub accept_invalid_certs: bool,             // Default: false
}

pub struct TorrentConfig {
    pub listen_port_range: (u16, u16),          // Default: (6881, 6889)
    pub dht_bootstrap_nodes: Vec<String>,
    pub tracker_update_interval: u64,           // Default: 1800 seconds
    pub peer_timeout: u64,                      // Default: 120 seconds
    pub max_pending_requests: usize,            // Default: 16
    pub enable_endgame: bool,                   // Default: true
}
```

---

## License

MIT License - see [LICENSE](LICENSE) for details.
