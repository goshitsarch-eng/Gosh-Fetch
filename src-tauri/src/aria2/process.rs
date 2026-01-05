use crate::{Error, Result};
use std::net::TcpListener;
use std::process::Stdio;
use tauri::AppHandle;
use tauri::Manager;
use tokio::process::{Child, Command};

pub struct Aria2Process {
    child: Option<Child>,
    port: u16,
}

/// Check if a port is available for binding
fn is_port_available(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

/// Find an available port starting from the given port
/// Returns the first available port in the range [start, start+100)
pub fn find_available_port(start: u16) -> Result<u16> {
    for port in start..start.saturating_add(100) {
        if is_port_available(port) {
            return Ok(port);
        }
    }
    Err(Error::Aria2(format!(
        "No available ports in range {}-{}",
        start,
        start.saturating_add(99)
    )))
}

impl Aria2Process {
    /// Start aria2 daemon with the specified port and secret
    /// If the port is not available, finds an available port automatically
    pub async fn start(app: &AppHandle, preferred_port: u16, secret: &str) -> Result<Self> {
        // Validate port availability, find alternative if needed
        let port = if is_port_available(preferred_port) {
            preferred_port
        } else {
            log::warn!(
                "Port {} is not available, searching for alternative",
                preferred_port
            );
            find_available_port(preferred_port)?
        };

        let resource_path = app
            .path()
            .resource_dir()
            .map_err(|e| Error::Io(std::io::Error::new(std::io::ErrorKind::NotFound, e)))?;

        // Determine the binary path based on platform
        let binary_name = if cfg!(target_os = "windows") {
            "aria2c.exe"
        } else {
            "aria2c"
        };

        let aria2_path = resource_path.join("binaries").join(binary_name);

        // If not in resources, try sidecar path
        let aria2_path = if aria2_path.exists() {
            aria2_path
        } else {
            // Try the sidecar path
            let sidecar_path = app
                .path()
                .resource_dir()
                .map_err(|e| Error::Io(std::io::Error::new(std::io::ErrorKind::NotFound, e)))?
                .join(binary_name);
            if sidecar_path.exists() {
                sidecar_path
            } else {
                // Fallback to system aria2c
                std::path::PathBuf::from(binary_name)
            }
        };

        // Get app data directory for session file
        let app_data = app
            .path()
            .app_data_dir()
            .map_err(|e| Error::Io(std::io::Error::new(std::io::ErrorKind::NotFound, e)))?;
        std::fs::create_dir_all(&app_data)?;
        let session_file = app_data.join("aria2.session");

        // Create empty session file if it doesn't exist
        if !session_file.exists() {
            std::fs::File::create(&session_file)?;
        }

        let mut args = vec![
            "--enable-rpc=true".to_string(),
            format!("--rpc-listen-port={}", port),
            format!("--rpc-secret={}", secret),
            "--rpc-listen-all=false".to_string(),
            // Download settings
            "--max-concurrent-downloads=20".to_string(),
            "--split=16".to_string(),
            "--max-connection-per-server=16".to_string(),
            "--min-split-size=1M".to_string(),
            "--continue=true".to_string(),
            // BitTorrent settings
            "--enable-dht=true".to_string(),
            "--enable-dht6=true".to_string(),
            "--enable-peer-exchange=true".to_string(),
            "--bt-enable-lpd=true".to_string(),
            "--bt-max-peers=55".to_string(),
            "--bt-request-peer-speed-limit=50K".to_string(),
            // UPnP and NAT-PMP
            "--enable-upnp=true".to_string(),
            // Session persistence
            format!("--save-session={}", session_file.display()),
            format!("--input-file={}", session_file.display()),
            "--save-session-interval=60".to_string(),
            // Misc
            "--auto-file-renaming=true".to_string(),
            "--allow-overwrite=false".to_string(),
            "--disk-cache=64M".to_string(),
            "--file-allocation=falloc".to_string(),
            "--log-level=warn".to_string(),
        ];

        // On Unix, add stop-with-process to auto-cleanup when parent dies
        #[cfg(unix)]
        {
            args.push(format!("--stop-with-process={}", std::process::id()));
        }

        log::info!("Starting aria2c at {:?} with port {}", aria2_path, port);

        let child = Command::new(&aria2_path)
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| {
                log::error!("Failed to start aria2c: {}", e);
                Error::Aria2(format!("Failed to start aria2c: {}", e))
            })?;

        Ok(Self {
            child: Some(child),
            port,
        })
    }

    pub async fn stop(&mut self) -> Result<()> {
        if let Some(mut child) = self.child.take() {
            log::info!("Stopping aria2c process");
            child.kill().await?;
            child.wait().await?;
        }
        Ok(())
    }

    pub fn is_running(&self) -> bool {
        self.child.is_some()
    }

    pub fn get_port(&self) -> u16 {
        self.port
    }
}

impl Drop for Aria2Process {
    fn drop(&mut self) {
        if let Some(mut child) = self.child.take() {
            // Try to kill the process synchronously
            let _ = child.start_kill();
        }
    }
}
