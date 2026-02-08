use crate::{AppState, Result};

pub async fn get_engine_version(state: &AppState) -> Result<serde_json::Value> {
    let is_running = state.is_engine_running().await;
    Ok(serde_json::json!({
        "name": "gosh-dl",
        "version": "0.1.0",
        "running": is_running,
    }))
}

pub fn open_download_folder(path: String) -> Result<()> {
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()?;
    }

    Ok(())
}

pub fn open_file_location(file_path: String) -> Result<()> {
    let path = std::path::Path::new(&file_path);
    let folder = if path.is_dir() {
        path
    } else {
        path.parent().unwrap_or(path)
    };

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(folder)
            .spawn()?;
    }

    #[cfg(target_os = "macos")]
    {
        if path.exists() && !path.is_dir() {
            std::process::Command::new("open")
                .arg("-R")
                .arg(&file_path)
                .spawn()?;
        } else {
            std::process::Command::new("open")
                .arg(folder)
                .spawn()?;
        }
    }

    #[cfg(target_os = "windows")]
    {
        if path.exists() && !path.is_dir() {
            std::process::Command::new("explorer")
                .arg("/select,")
                .arg(&file_path)
                .spawn()?;
        } else {
            std::process::Command::new("explorer")
                .arg(folder)
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
