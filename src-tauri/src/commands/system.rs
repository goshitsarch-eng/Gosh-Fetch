use crate::constants::{ENGINE_NAME, ENGINE_VERSION};
use crate::{AppState, Error, Result};
use std::path::PathBuf;

/// Validate and canonicalize a filesystem path.
/// Rejects empty paths, URL schemes, and paths that don't exist on disk.
fn validate_path(path: &str) -> Result<PathBuf> {
    if path.is_empty() {
        return Err(Error::InvalidInput("Path cannot be empty".into()));
    }
    if path.contains("://") {
        return Err(Error::InvalidInput("URL schemes are not allowed in file paths".into()));
    }
    let p = PathBuf::from(path);
    let canonical = p.canonicalize().map_err(|_| {
        Error::InvalidInput(format!("Path does not exist or is inaccessible: {}", path))
    })?;
    Ok(canonical)
}

pub async fn get_engine_version(state: &AppState) -> Result<serde_json::Value> {
    let is_running = state.is_engine_running().await;
    Ok(serde_json::json!({
        "name": ENGINE_NAME,
        "version": ENGINE_VERSION,
        "running": is_running,
    }))
}

pub fn open_download_folder(path: String) -> Result<()> {
    let validated = validate_path(&path)?;
    let path_str = validated.to_string_lossy();

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(path_str.as_ref())
            .spawn()?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path_str.as_ref())
            .spawn()?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(path_str.as_ref())
            .spawn()?;
    }

    Ok(())
}

pub fn open_file_location(file_path: String) -> Result<()> {
    let validated = validate_path(&file_path)?;
    let folder = if validated.is_dir() {
        validated.clone()
    } else {
        validated.parent().unwrap_or(&validated).to_path_buf()
    };

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&folder)
            .spawn()?;
    }

    #[cfg(target_os = "macos")]
    {
        if validated.exists() && !validated.is_dir() {
            std::process::Command::new("open")
                .arg("-R")
                .arg(&validated)
                .spawn()?;
        } else {
            std::process::Command::new("open")
                .arg(&folder)
                .spawn()?;
        }
    }

    #[cfg(target_os = "windows")]
    {
        if validated.exists() && !validated.is_dir() {
            std::process::Command::new("explorer")
                .arg("/select,")
                .arg(&validated)
                .spawn()?;
        } else {
            std::process::Command::new("explorer")
                .arg(&folder)
                .spawn()?;
        }
    }

    Ok(())
}

pub fn get_default_download_path() -> String {
    dirs::download_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| {
            dirs::home_dir()
                .map(|p| p.join("Downloads").to_string_lossy().to_string())
                .unwrap_or_else(|| "~/Downloads".to_string())
        })
}

pub fn get_app_version(app: &tauri::AppHandle) -> String {
    // The resolved Tauri config version (tauri.conf.json points at
    // package.json, the single source of truth for the app version).
    app.package_info().version.to_string()
}

/// Free/total disk space for a path (defaults to the user's download dir).
pub fn get_disk_space(path: Option<String>) -> Result<serde_json::Value> {
    let target = match path {
        Some(p) if !p.is_empty() => validate_path(&p)?,
        _ => PathBuf::from(get_default_download_path()),
    };
    let free = fs4::available_space(&target)?;
    let total = fs4::total_space(&target)?;
    Ok(serde_json::json!({ "total": total, "free": free }))
}

fn run_system_command(command: &str, args: &[&str]) -> Result<()> {
    let status = std::process::Command::new(command).args(args).status()?;
    if !status.success() {
        return Err(Error::InvalidInput(format!(
            "{} exited with status {}",
            command, status
        )));
    }
    Ok(())
}

/// Perform a system action after downloads complete: "sleep" or "shutdown".
pub fn perform_system_action(action: &str, force_close_apps: bool) -> Result<()> {
    match action {
        "sleep" => {
            #[cfg(target_os = "macos")]
            return run_system_command("pmset", &["sleepnow"]);
            #[cfg(target_os = "linux")]
            return run_system_command("systemctl", &["suspend"]);
            #[cfg(target_os = "windows")]
            return run_system_command(
                "rundll32.exe",
                &["powrprof.dll,SetSuspendState", "0,1,0"],
            );
            #[allow(unreachable_code)]
            Err(Error::InvalidInput("Unsupported platform".into()))
        }
        "shutdown" => {
            #[cfg(target_os = "macos")]
            {
                let _ = force_close_apps;
                return run_system_command(
                    "osascript",
                    &["-e", "tell application \"System Events\" to shut down"],
                );
            }
            #[cfg(target_os = "linux")]
            {
                let _ = force_close_apps;
                return run_system_command("systemctl", &["poweroff"]);
            }
            #[cfg(target_os = "windows")]
            {
                let mut args = vec!["/s", "/t", "0"];
                if force_close_apps {
                    args.push("/f");
                }
                return run_system_command("shutdown", &args);
            }
            #[allow(unreachable_code)]
            Err(Error::InvalidInput("Unsupported platform".into()))
        }
        other => Err(Error::InvalidInput(format!(
            "Unknown system action: {}",
            other
        ))),
    }
}

/// Read and parse a settings JSON file selected by the user (import flow).
pub fn read_settings_json(path: String) -> Result<serde_json::Value> {
    let validated = validate_path(&path)?;
    if validated.extension().and_then(|e| e.to_str()) != Some("json") {
        return Err(Error::InvalidInput("File must have a .json extension".into()));
    }
    let content = std::fs::read_to_string(&validated)?;
    Ok(serde_json::from_str(&content)?)
}

pub fn get_app_info(app: &tauri::AppHandle) -> serde_json::Value {
    serde_json::json!({
        "name": "Gosh-Fetch",
        "version": get_app_version(app),
        "description": "Gosh Fetch - the modern download manager powered by gosh-dl",
        "license": "AGPL-3.0",
        "repository": "https://github.com/goshitsarch-eng/Gosh-Fetch",
        "engine": {
            "name": ENGINE_NAME,
            "version": ENGINE_VERSION,
            "url": "https://github.com/goshitsarch-eng/gosh-dl",
            "license": "MIT",
            "description": "A fast, safe, and reliable download engine written in Rust"
        }
    })
}
