use crate::db::Database;
use crate::engine_adapter::EngineAdapter;
use crate::types::DownloadState;
use crate::utils::TrackerUpdater;
use crate::Result;
use gosh_dl::{DownloadEngine, DownloadEvent, EngineConfig};
use serde_json::Value;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};

#[derive(Clone)]
pub struct AppState {
    engine: Arc<RwLock<Option<Arc<DownloadEngine>>>>,
    adapter: Arc<RwLock<Option<EngineAdapter>>>,
    pub db: Arc<RwLock<Option<Database>>>,
    close_to_tray: Arc<AtomicBool>,
    event_handle: Arc<RwLock<Option<tokio::task::JoinHandle<()>>>>,
    data_dir: Arc<RwLock<Option<PathBuf>>>,
    tracker_updater: Arc<RwLock<TrackerUpdater>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            engine: Arc::new(RwLock::new(None)),
            adapter: Arc::new(RwLock::new(None)),
            db: Arc::new(RwLock::new(None)),
            close_to_tray: Arc::new(AtomicBool::new(true)),
            event_handle: Arc::new(RwLock::new(None)),
            data_dir: Arc::new(RwLock::new(None)),
            tracker_updater: Arc::new(RwLock::new(TrackerUpdater::new())),
        }
    }

    pub fn get_close_to_tray(&self) -> bool {
        self.close_to_tray.load(Ordering::Relaxed)
    }

    pub fn set_close_to_tray(&self, value: bool) {
        self.close_to_tray.store(value, Ordering::Relaxed);
    }

    pub async fn initialize(
        &self,
        data_dir: PathBuf,
        event_tx: broadcast::Sender<Value>,
    ) -> Result<()> {
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

        // Start event listener - writes to broadcast channel
        let mut events = engine.subscribe();
        let tx = event_tx.clone();
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
                let payload = serde_json::to_value(&event).unwrap_or(Value::Null);
                let msg = serde_json::json!({
                    "event": event_name,
                    "data": payload,
                });
                let _ = tx.send(msg);
            }
        });
        *self.event_handle.write().await = Some(handle);

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

    pub async fn reinitialize(&self, event_tx: broadcast::Sender<Value>) -> Result<()> {
        self.shutdown().await?;
        let data_dir = self.get_data_dir().await?;
        self.initialize(data_dir, event_tx).await
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
