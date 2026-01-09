use crate::db::{Database, Settings};
use crate::engine_adapter::EngineAdapter;
use crate::Result;
use gosh_dl::{DownloadEngine, DownloadEvent, EngineConfig};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct AppState {
    engine: Arc<RwLock<Option<Arc<DownloadEngine>>>>,
    adapter: Arc<RwLock<Option<EngineAdapter>>>,
    pub db: Arc<RwLock<Option<Database>>>,
    /// Close to tray setting - read synchronously in window close handler
    close_to_tray: Arc<AtomicBool>,
    /// Event listener handle
    event_handle: Arc<RwLock<Option<tokio::task::JoinHandle<()>>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            engine: Arc::new(RwLock::new(None)),
            adapter: Arc::new(RwLock::new(None)),
            db: Arc::new(RwLock::new(None)),
            close_to_tray: Arc::new(AtomicBool::new(true)),
            event_handle: Arc::new(RwLock::new(None)),
        }
    }

    /// Get the close to tray setting (synchronous)
    pub fn get_close_to_tray(&self) -> bool {
        self.close_to_tray.load(Ordering::Relaxed)
    }

    /// Set the close to tray setting
    pub fn set_close_to_tray(&self, value: bool) {
        self.close_to_tray.store(value, Ordering::Relaxed);
    }

    /// Initialize the app state with download engine and database
    pub async fn initialize(&self, app: &AppHandle) -> Result<()> {
        // Initialize database
        let db = Database::new(app).await?;
        *self.db.write().await = Some(db);

        // Use default settings - frontend will apply stored settings via apply_settings_to_engine
        let settings = Settings::default();

        // Build engine config from default settings
        let mut config = EngineConfig::default();
        config.download_dir = PathBuf::from(&settings.download_path);
        config.max_concurrent_downloads = settings.max_concurrent_downloads as usize;
        config.max_connections_per_download = settings.max_connections_per_server as usize;
        config.user_agent = settings.user_agent.clone();
        config.enable_dht = settings.bt_enable_dht;
        config.enable_pex = settings.bt_enable_pex;
        config.enable_lpd = settings.bt_enable_lpd;
        config.max_peers = settings.bt_max_peers as usize;
        config.seed_ratio = settings.bt_seed_ratio;

        // Enable engine storage for HTTP segment persistence (pause/resume)
        if let Some(data_dir) = app.path().app_data_dir().ok() {
            config.database_path = Some(data_dir.join("engine.db"));
        }

        if settings.download_speed_limit > 0 {
            config.global_download_limit = Some(settings.download_speed_limit);
        }
        if settings.upload_speed_limit > 0 {
            config.global_upload_limit = Some(settings.upload_speed_limit);
        }

        // Create and start the download engine
        let engine = DownloadEngine::new(config).await?;

        // Create adapter
        let adapter = EngineAdapter::new(engine.clone());

        // Store engine and adapter
        *self.engine.write().await = Some(engine.clone());
        *self.adapter.write().await = Some(adapter);

        // Start event listener to emit events to frontend
        let app_handle = app.clone();
        let mut events = engine.subscribe();
        let handle = tokio::spawn(async move {
            while let Ok(event) = events.recv().await {
                // Emit events to frontend
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
                let _ = app_handle.emit(event_name, &event);
            }
        });
        *self.event_handle.write().await = Some(handle);

        log::info!("App state initialized with gosh-dl engine");
        Ok(())
    }

    /// Get the engine adapter for download operations
    pub async fn get_adapter(&self) -> Result<EngineAdapter> {
        self.adapter
            .read()
            .await
            .clone()
            .ok_or(crate::Error::EngineNotInitialized)
    }

    /// Get the raw engine (for advanced operations)
    pub async fn get_engine(&self) -> Result<Arc<DownloadEngine>> {
        self.engine
            .read()
            .await
            .clone()
            .ok_or(crate::Error::EngineNotInitialized)
    }

    /// Get the database
    pub async fn get_db(&self) -> Result<Database> {
        self.db
            .read()
            .await
            .clone()
            .ok_or(crate::Error::Database("Database not initialized".into()))
    }

    /// Shutdown the download engine gracefully
    pub async fn shutdown(&self) -> Result<()> {
        // Stop event listener
        if let Some(handle) = self.event_handle.write().await.take() {
            handle.abort();
        }

        // Shutdown engine
        if let Some(ref engine) = *self.engine.read().await {
            engine.shutdown().await?;
        }

        log::info!("Download engine shut down");
        Ok(())
    }

    /// Check if engine is running
    pub async fn is_engine_running(&self) -> bool {
        self.engine.read().await.is_some()
    }

    /// Update engine configuration
    pub async fn update_config(&self, config: EngineConfig) -> Result<()> {
        if let Some(ref engine) = *self.engine.read().await {
            engine.set_config(config)?;
        }
        Ok(())
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
