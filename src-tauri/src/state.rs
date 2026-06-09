use crate::db::Database;
use crate::engine_adapter::EngineAdapter;
use crate::types::DownloadState;
use crate::utils::TrackerUpdater;
use crate::Result;
use gosh_dl::{DownloadEngine, DownloadEvent, EngineConfig, RecursiveJobEvent};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;

/// A magnet URI or .torrent file received from the OS (deep link, file
/// association, second instance) before the frontend was ready to handle it.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum OpenRequest {
    #[serde(rename_all = "camelCase")]
    Magnet { uri: String },
    #[serde(rename_all = "camelCase")]
    TorrentFile { path: String },
}

#[derive(Clone)]
pub struct AppState {
    engine: Arc<RwLock<Option<Arc<DownloadEngine>>>>,
    adapter: Arc<RwLock<Option<EngineAdapter>>>,
    pub db: Arc<RwLock<Option<Database>>>,
    close_to_tray: Arc<AtomicBool>,
    quitting: Arc<AtomicBool>,
    event_handle: Arc<RwLock<Option<tokio::task::JoinHandle<()>>>>,
    recursive_event_handle: Arc<RwLock<Option<tokio::task::JoinHandle<()>>>>,
    data_dir: Arc<RwLock<Option<PathBuf>>>,
    tracker_updater: Arc<RwLock<TrackerUpdater>>,
    frontend_ready: Arc<AtomicBool>,
    pending_opens: Arc<Mutex<Vec<OpenRequest>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            engine: Arc::new(RwLock::new(None)),
            adapter: Arc::new(RwLock::new(None)),
            db: Arc::new(RwLock::new(None)),
            close_to_tray: Arc::new(AtomicBool::new(true)),
            quitting: Arc::new(AtomicBool::new(false)),
            event_handle: Arc::new(RwLock::new(None)),
            recursive_event_handle: Arc::new(RwLock::new(None)),
            data_dir: Arc::new(RwLock::new(None)),
            tracker_updater: Arc::new(RwLock::new(TrackerUpdater::new())),
            frontend_ready: Arc::new(AtomicBool::new(false)),
            pending_opens: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn get_close_to_tray(&self) -> bool {
        self.close_to_tray.load(Ordering::Relaxed)
    }

    pub fn set_close_to_tray(&self, value: bool) {
        self.close_to_tray.store(value, Ordering::Relaxed);
    }

    /// True once the user chose Quit (tray menu / app exit), so the
    /// close-to-tray handler must not intercept window close anymore.
    pub fn is_quitting(&self) -> bool {
        self.quitting.load(Ordering::Relaxed)
    }

    pub fn set_quitting(&self, value: bool) {
        self.quitting.store(value, Ordering::Relaxed);
    }

    /// Deliver an OS open request (magnet / .torrent). Emits to the frontend
    /// when it is ready, otherwise queues it for `get_pending_open_requests`.
    pub fn deliver_open_request(&self, app: &AppHandle, request: OpenRequest) {
        if self.frontend_ready.load(Ordering::Relaxed) {
            let (event, payload) = match &request {
                OpenRequest::Magnet { uri } => ("open-magnet", serde_json::json!({ "uri": uri })),
                OpenRequest::TorrentFile { path } => {
                    ("open-torrent-file", serde_json::json!({ "path": path }))
                }
            };
            let _ = app.emit(event, payload);
        } else {
            self.pending_opens.lock().unwrap().push(request);
        }
    }

    /// Mark the frontend ready and drain any queued open requests.
    pub fn take_pending_open_requests(&self) -> Vec<OpenRequest> {
        self.frontend_ready.store(true, Ordering::Relaxed);
        std::mem::take(&mut *self.pending_opens.lock().unwrap())
    }

    pub async fn initialize(&self, data_dir: PathBuf, app: AppHandle) -> Result<()> {
        *self.data_dir.write().await = Some(data_dir.clone());

        // Initialize database
        let db = Database::new(&data_dir)?;
        *self.db.write().await = Some(db.clone());

        // Load saved settings from DB, falling back to defaults for a fresh install
        let settings = db.get_settings().unwrap_or_default();

        let mut config = EngineConfig::default();
        config.download_dir = PathBuf::from(&settings.download_path);
        config.max_concurrent_downloads = settings.max_concurrent_downloads as usize;
        config.max_connections_per_download = settings
            .max_connections_per_server
            .max(settings.split_count) as usize;
        config.user_agent = settings.user_agent.clone();
        config.enable_dht = settings.bt_enable_dht;
        config.enable_pex = settings.bt_enable_pex;
        config.enable_lpd = settings.bt_enable_lpd;
        config.max_peers = settings.bt_max_peers as usize;
        config.seed_ratio = settings.bt_seed_ratio;
        config.database_path = Some(data_dir.join("engine.db"));

        if settings.download_speed_limit > 0 {
            config.global_download_limit = Some(settings.download_speed_limit);
        }
        if settings.upload_speed_limit > 0 {
            config.global_upload_limit = Some(settings.upload_speed_limit);
        }

        // Proxy
        if !settings.proxy_url.is_empty() {
            config.http.proxy_url = Some(settings.proxy_url.clone());
        }

        // Timeouts and retries
        config.http.connect_timeout = settings.connect_timeout;
        config.http.read_timeout = settings.read_timeout;
        config.http.max_retries = settings.max_retries as usize;

        // File allocation mode
        config.torrent.allocation_mode = match settings.allocation_mode.as_str() {
            "full" => gosh_dl::AllocationMode::Full,
            "sparse" => gosh_dl::AllocationMode::Sparse,
            _ => gosh_dl::AllocationMode::None,
        };

        let engine = DownloadEngine::new(config).await?;
        let adapter = EngineAdapter::new(engine.clone());

        *self.engine.write().await = Some(engine.clone());
        *self.adapter.write().await = Some(adapter);

        // Forward engine events to the webview
        let mut events = engine.subscribe();
        let event_app = app.clone();
        let handle = tokio::spawn(async move {
            while let Ok(event) = events.recv().await {
                let event_name = match &event {
                    DownloadEvent::Added { .. } => "download:added",
                    DownloadEvent::Started { .. } => "download:started",
                    DownloadEvent::Progress { .. } => "download:progress",
                    DownloadEvent::StateChanged { .. } => "download:state-changed",
                    DownloadEvent::Completed { .. } => "download:completed",
                    DownloadEvent::Failed { .. } => "download:failed",
                    DownloadEvent::Removed { .. } => "download:removed",
                    DownloadEvent::Paused { .. } => "download:paused",
                    DownloadEvent::Resumed { .. } => "download:resumed",
                };
                let payload = serde_json::to_value(&event).unwrap_or(serde_json::Value::Null);
                let _ = event_app.emit(event_name, payload);
            }
        });
        *self.event_handle.write().await = Some(handle);

        // Forward recursive mirroring job events to the webview
        let mut recursive_events = engine.subscribe_recursive_jobs();
        let recursive_app = app.clone();
        let recursive_handle = tokio::spawn(async move {
            while let Ok(event) = recursive_events.recv().await {
                let (event_name, payload) = match &event {
                    RecursiveJobEvent::Added { job, status } => (
                        "recursive:added",
                        serde_json::json!({ "job": job, "status": status }),
                    ),
                    RecursiveJobEvent::Updated { job, status } => (
                        "recursive:updated",
                        serde_json::json!({ "job": job, "status": status }),
                    ),
                    RecursiveJobEvent::Removed { id } => (
                        "recursive:removed",
                        serde_json::json!({ "id": id }),
                    ),
                };
                let _ = recursive_app.emit(event_name, payload);
            }
        });
        *self.recursive_event_handle.write().await = Some(recursive_handle);

        log::info!("App state initialized with gosh-dl engine");
        Ok(())
    }

    pub async fn get_adapter(&self) -> Result<EngineAdapter> {
        self.adapter
            .read()
            .await
            .clone()
            .ok_or(crate::Error::EngineNotInitialized)
    }

    pub async fn get_engine(&self) -> Result<Arc<DownloadEngine>> {
        self.engine
            .read()
            .await
            .clone()
            .ok_or(crate::Error::EngineNotInitialized)
    }

    pub async fn get_db(&self) -> Result<Database> {
        self.db
            .read()
            .await
            .clone()
            .ok_or(crate::Error::Database("Database not initialized".into()))
    }

    pub fn get_tracker_updater(&self) -> Arc<RwLock<TrackerUpdater>> {
        self.tracker_updater.clone()
    }

    pub async fn shutdown(&self) -> Result<()> {
        // Persist a final history snapshot so completed items survive app restarts.
        // We intentionally avoid writing incomplete states here because incomplete
        // restoration is handled by the engine's own storage layer.
        if let (Some(adapter), Some(db)) = (
            self.adapter.read().await.clone(),
            self.db.read().await.clone(),
        ) {
            let downloads = adapter.get_all();
            for download in downloads {
                if download.status != DownloadState::Complete {
                    continue;
                }
                if let Err(e) = db.save_download_async(download).await {
                    log::warn!("Failed to persist download snapshot during shutdown: {}", e);
                }
            }
        }

        if let Some(handle) = self.event_handle.write().await.take() {
            handle.abort();
        }
        if let Some(handle) = self.recursive_event_handle.write().await.take() {
            handle.abort();
        }
        if let Some(ref engine) = *self.engine.read().await {
            engine.shutdown().await?;
        }
        log::info!("Download engine shut down");
        Ok(())
    }

    pub async fn is_engine_running(&self) -> bool {
        self.engine.read().await.is_some()
    }

    pub async fn update_config(&self, config: EngineConfig) -> Result<()> {
        if let Some(ref engine) = *self.engine.read().await {
            engine.set_config(config)?;
        }
        Ok(())
    }

    pub async fn get_data_dir(&self) -> Result<PathBuf> {
        self.data_dir
            .read()
            .await
            .clone()
            .ok_or(crate::Error::Database("Data dir not set".into()))
    }

    pub async fn reinitialize(&self, app: AppHandle) -> Result<()> {
        self.shutdown().await?;
        let data_dir = self.get_data_dir().await?;
        self.initialize(data_dir, app).await
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
