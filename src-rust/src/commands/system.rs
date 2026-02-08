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
        "name": "gosh-dl",
        "version": "0.1.0",
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

pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

pub fn get_app_info() -> serde_json::Value {
    serde_json::json!({
        "name": "Gosh-Fetch",
        "version": env!("CARGO_PKG_VERSION"),
        "description": "Gosh Fetch - the modern download manager powered by gosh-dl",
        "license": "AGPL-3.0",
        "repository": "https://github.com/goshitsarch-eng/Gosh-Fetch",
        "engine": {
            "name": "gosh-dl",
            "version": "0.1.0",
            "url": "https://github.com/goshitsarch-eng/gosh-dl",
            "license": "MIT",
            "description": "A fast, safe, and reliable download engine written in Rust"
        }
    })
}
