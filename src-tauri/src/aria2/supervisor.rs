use crate::aria2::{Aria2Client, Aria2Process};
use crate::{Error, Result};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tokio::sync::Mutex;

const MAX_RESTART_ATTEMPTS: u32 = 3;
const HEALTH_CHECK_INTERVAL: Duration = Duration::from_secs(5);
const RESTART_COOLDOWN: Duration = Duration::from_secs(30);

/// Supervises the aria2 process, providing health checks and auto-restart
pub struct Aria2Supervisor {
    app_handle: AppHandle,
    process: Option<Aria2Process>,
    client: Option<Aria2Client>,
    port: u16,
    secret: String,
    restart_count: u32,
    last_restart: Option<Instant>,
    last_health_check: Instant,
    is_shutting_down: bool,
}

impl Aria2Supervisor {
    /// Create a new supervisor (does not start aria2 yet)
    pub fn new(app_handle: AppHandle, port: u16, secret: String) -> Self {
        Self {
            app_handle,
            process: None,
            client: None,
            port,
            secret,
            restart_count: 0,
            last_restart: None,
            last_health_check: Instant::now(),
            is_shutting_down: false,
        }
    }

    /// Start aria2 and establish RPC connection
    pub async fn start(&mut self) -> Result<()> {
        if self.is_shutting_down {
            return Err(Error::Aria2("Supervisor is shutting down".into()));
        }

        log::info!("Starting aria2 supervisor");

        // Start the aria2 process
        let process = Aria2Process::start(&self.app_handle, self.port, &self.secret).await?;
        let actual_port = process.get_port();
        self.port = actual_port;
        self.process = Some(process);

        // Wait for aria2 to initialize
        tokio::time::sleep(Duration::from_millis(500)).await;

        // Retry connection a few times
        let mut last_error = None;
        for attempt in 1..=5 {
            match Aria2Client::connect(actual_port, &self.secret).await {
                Ok(client) => {
                    self.client = Some(client);
                    self.last_health_check = Instant::now();
                    log::info!("aria2 started successfully on port {}", actual_port);
                    return Ok(());
                }
                Err(e) => {
                    log::warn!("Connection attempt {} failed: {}", attempt, e);
                    last_error = Some(e);
                    tokio::time::sleep(Duration::from_millis(200 * attempt as u64)).await;
                }
            }
        }

        // Connection failed, stop the process
        if let Some(mut proc) = self.process.take() {
            let _ = proc.stop().await;
        }

        Err(last_error.unwrap_or_else(|| Error::Aria2Connection("Failed to connect".into())))
    }

    /// Graceful shutdown with session save
    pub async fn stop(&mut self) -> Result<()> {
        self.is_shutting_down = true;
        log::info!("Stopping aria2 supervisor");

        // Try to save session before shutting down
        if let Some(ref client) = self.client {
            match client.save_session().await {
                Ok(_) => log::info!("Session saved successfully"),
                Err(e) => log::warn!("Failed to save session: {}", e),
            }

            // Try graceful shutdown via RPC first
            match client.shutdown().await {
                Ok(_) => {
                    log::info!("aria2 shutdown via RPC");
                    tokio::time::sleep(Duration::from_millis(500)).await;
                }
                Err(e) => log::warn!("RPC shutdown failed: {}", e),
            }
        }

        self.client = None;

        // Force kill if still running
        if let Some(mut proc) = self.process.take() {
            proc.stop().await?;
        }

        log::info!("aria2 stopped");
        Ok(())
    }

    /// Check if aria2 is responsive
    pub async fn health_check(&mut self) -> Result<()> {
        let client = self
            .client
            .as_ref()
            .ok_or(Error::Aria2NotRunning)?;

        // Try to get version as a simple health check
        client.get_version().await?;
        self.last_health_check = Instant::now();
        Ok(())
    }

    /// Ensure aria2 is running, restart if dead
    pub async fn ensure_running(&mut self) -> Result<()> {
        if self.is_shutting_down {
            return Err(Error::Aria2("Supervisor is shutting down".into()));
        }

        // Check if we're in restart cooldown
        if let Some(last) = self.last_restart {
            if last.elapsed() < RESTART_COOLDOWN && self.restart_count >= MAX_RESTART_ATTEMPTS {
                return Err(Error::Aria2(
                    "Too many restart attempts, waiting for cooldown".into(),
                ));
            }
            // Reset counter after cooldown
            if last.elapsed() >= RESTART_COOLDOWN {
                self.restart_count = 0;
            }
        }

        // Try health check
        if self.health_check().await.is_ok() {
            return Ok(());
        }

        // Health check failed, attempt restart
        log::warn!(
            "aria2 health check failed, attempting restart ({}/{})",
            self.restart_count + 1,
            MAX_RESTART_ATTEMPTS
        );

        // Clean up old state
        self.client = None;
        if let Some(mut proc) = self.process.take() {
            let _ = proc.stop().await;
        }

        // Attempt restart
        self.restart_count += 1;
        self.last_restart = Some(Instant::now());

        self.start().await
    }

    /// Get the current aria2 client
    pub fn get_client(&self) -> Result<&Aria2Client> {
        self.client.as_ref().ok_or(Error::Aria2NotRunning)
    }

    /// Get a clone of the client
    pub fn get_client_clone(&self) -> Result<Aria2Client> {
        self.client.clone().ok_or(Error::Aria2NotRunning)
    }

    /// Check if aria2 is currently running
    pub fn is_running(&self) -> bool {
        self.client.is_some() && self.process.as_ref().map_or(false, |p| p.is_running())
    }

    /// Get the current port
    pub fn get_port(&self) -> u16 {
        self.port
    }

    /// Get restart count
    pub fn get_restart_count(&self) -> u32 {
        self.restart_count
    }
}

/// Shared supervisor state for use across the application
pub type SharedSupervisor = Arc<Mutex<Aria2Supervisor>>;

/// Create a shared supervisor instance
pub fn create_shared_supervisor(
    app_handle: AppHandle,
    port: u16,
    secret: String,
) -> SharedSupervisor {
    Arc::new(Mutex::new(Aria2Supervisor::new(app_handle, port, secret)))
}

/// Start the background health check loop
pub fn spawn_health_check_loop(
    supervisor: SharedSupervisor,
    event_tx: Option<tokio::sync::mpsc::Sender<SupervisorEvent>>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(HEALTH_CHECK_INTERVAL).await;

            let mut sup = supervisor.lock().await;

            // Don't check if shutting down
            if sup.is_shutting_down {
                break;
            }

            match sup.ensure_running().await {
                Ok(_) => {
                    // Health check passed or restart successful
                    if let Some(ref tx) = event_tx {
                        let _ = tx.send(SupervisorEvent::HealthCheckPassed).await;
                    }
                }
                Err(e) => {
                    log::error!("Supervisor ensure_running failed: {}", e);
                    if let Some(ref tx) = event_tx {
                        let _ = tx
                            .send(SupervisorEvent::HealthCheckFailed {
                                error: e.to_string(),
                                restart_count: sup.restart_count,
                            })
                            .await;
                    }

                    // Check if we've exhausted restart attempts
                    if sup.restart_count >= MAX_RESTART_ATTEMPTS {
                        log::error!(
                            "aria2 failed to restart after {} attempts",
                            MAX_RESTART_ATTEMPTS
                        );
                        if let Some(ref tx) = event_tx {
                            let _ = tx.send(SupervisorEvent::MaxRestartsReached).await;
                        }
                    }
                }
            }
        }
    })
}

/// Events emitted by the supervisor for the frontend
#[derive(Debug, Clone)]
pub enum SupervisorEvent {
    HealthCheckPassed,
    HealthCheckFailed {
        error: String,
        restart_count: u32,
    },
    Restarting {
        attempt: u32,
    },
    MaxRestartsReached,
    Stopped,
}
