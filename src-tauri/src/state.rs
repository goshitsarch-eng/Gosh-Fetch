use crate::aria2::{
    create_shared_supervisor, spawn_health_check_loop, Aria2Client, SharedSupervisor,
    SupervisorEvent,
};
use crate::db::Database;
use crate::Result;
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::{mpsc, RwLock};

const DEFAULT_RPC_PORT: u16 = 6800;

#[derive(Clone)]
pub struct AppState {
    supervisor: Arc<RwLock<Option<SharedSupervisor>>>,
    pub db: Arc<RwLock<Option<Database>>>,
    rpc_port: Arc<AtomicU16>,
    rpc_secret: String,
    health_check_handle: Arc<RwLock<Option<tokio::task::JoinHandle<()>>>>,
    /// Close to tray setting - read synchronously in window close handler
    close_to_tray: Arc<AtomicBool>,
}

impl AppState {
    pub fn new() -> Self {
        let secret = generate_secret();
        Self {
            supervisor: Arc::new(RwLock::new(None)),
            db: Arc::new(RwLock::new(None)),
            rpc_port: Arc::new(AtomicU16::new(DEFAULT_RPC_PORT)),
            rpc_secret: secret,
            health_check_handle: Arc::new(RwLock::new(None)),
            close_to_tray: Arc::new(AtomicBool::new(true)), // Default to true
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

    /// Initialize the app state with supervisor and database
    pub async fn initialize(&self, app: &AppHandle) -> Result<()> {
        // Initialize database
        let db = Database::new(app).await?;
        *self.db.write().await = Some(db);

        // Create and start supervisor
        let port = self.rpc_port.load(Ordering::Relaxed);
        let supervisor = create_shared_supervisor(app.clone(), port, self.rpc_secret.clone());

        // Start aria2 via supervisor
        let actual_port;
        {
            let mut sup = supervisor.lock().await;
            sup.start().await?;
            actual_port = sup.get_port();
        }
        self.rpc_port.store(actual_port, Ordering::Relaxed);

        // Store supervisor
        *self.supervisor.write().await = Some(supervisor.clone());

        // Spawn health check loop
        let handle = spawn_health_check_loop(supervisor, None);
        *self.health_check_handle.write().await = Some(handle);

        log::info!("App state initialized with aria2 on port {}", actual_port);
        Ok(())
    }

    /// Initialize with event channel for supervisor events
    pub async fn initialize_with_events(
        &self,
        app: &AppHandle,
    ) -> Result<mpsc::Receiver<SupervisorEvent>> {
        // Initialize database
        let db = Database::new(app).await?;
        *self.db.write().await = Some(db);

        // Create and start supervisor
        let port = self.rpc_port.load(Ordering::Relaxed);
        let supervisor = create_shared_supervisor(app.clone(), port, self.rpc_secret.clone());

        // Start aria2 via supervisor
        let actual_port;
        {
            let mut sup = supervisor.lock().await;
            sup.start().await?;
            actual_port = sup.get_port();
        }
        self.rpc_port.store(actual_port, Ordering::Relaxed);

        // Store supervisor
        *self.supervisor.write().await = Some(supervisor.clone());

        // Create event channel
        let (tx, rx) = mpsc::channel(32);

        // Spawn health check loop with event channel
        let handle = spawn_health_check_loop(supervisor, Some(tx));
        *self.health_check_handle.write().await = Some(handle);

        log::info!(
            "App state initialized with events on port {}",
            actual_port
        );
        Ok(rx)
    }

    /// Stop aria2 gracefully
    pub async fn stop_aria2(&self) -> Result<()> {
        // Stop health check loop
        if let Some(handle) = self.health_check_handle.write().await.take() {
            handle.abort();
        }

        // Stop supervisor
        if let Some(ref supervisor) = *self.supervisor.read().await {
            let mut sup = supervisor.lock().await;
            sup.stop().await?;
        }

        log::info!("aria2 stopped");
        Ok(())
    }

    /// Get the aria2 client
    pub async fn get_client(&self) -> Result<Aria2Client> {
        let supervisor_opt = self.supervisor.read().await;
        let supervisor = supervisor_opt
            .as_ref()
            .ok_or(crate::Error::Aria2NotRunning)?;

        let sup = supervisor.lock().await;
        sup.get_client_clone()
    }

    /// Get the database
    pub async fn get_db(&self) -> Result<Database> {
        self.db
            .read()
            .await
            .clone()
            .ok_or(crate::Error::Database("Database not initialized".into()))
    }

    /// Check if aria2 is running
    pub async fn is_aria2_running(&self) -> bool {
        if let Some(ref supervisor) = *self.supervisor.read().await {
            let sup = supervisor.lock().await;
            sup.is_running()
        } else {
            false
        }
    }

    /// Get supervisor restart count
    pub async fn get_restart_count(&self) -> u32 {
        if let Some(ref supervisor) = *self.supervisor.read().await {
            let sup = supervisor.lock().await;
            sup.get_restart_count()
        } else {
            0
        }
    }

    /// Get the current RPC port
    pub fn get_rpc_port(&self) -> u16 {
        self.rpc_port.load(Ordering::Relaxed)
    }

    /// Restart aria2 (stop and start)
    pub async fn restart_aria2(&self, app: &AppHandle) -> Result<()> {
        log::info!("Restarting aria2...");

        // Stop if running
        self.stop_aria2().await?;

        // Re-initialize (this will create a new supervisor)
        self.initialize(app).await?;

        log::info!("aria2 restarted successfully");
        Ok(())
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

/// Generate a random 32-character hex secret for RPC authentication
fn generate_secret() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: [u8; 16] = rng.gen();
    hex::encode(bytes)
}

/// Persist the secret to a file for security
#[allow(dead_code)]
fn persist_secret(app_data_dir: &std::path::Path, secret: &str) -> std::io::Result<()> {
    let secret_file = app_data_dir.join("rpc.secret");
    std::fs::write(&secret_file, secret)?;

    // Set restrictive permissions on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&secret_file, std::fs::Permissions::from_mode(0o600))?;
    }

    Ok(())
}

/// Load the secret from file, or generate a new one
#[allow(dead_code)]
fn load_or_create_secret(app_data_dir: &std::path::Path) -> std::io::Result<String> {
    let secret_file = app_data_dir.join("rpc.secret");
    if secret_file.exists() {
        std::fs::read_to_string(&secret_file)
    } else {
        let secret = generate_secret();
        persist_secret(app_data_dir, &secret)?;
        Ok(secret)
    }
}
