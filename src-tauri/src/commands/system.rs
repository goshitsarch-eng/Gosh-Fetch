use crate::{AppState, Result};
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub async fn get_aria2_version(state: State<'_, AppState>) -> Result<serde_json::Value> {
    let client = state.get_client().await?;
    client.get_version().await
}

#[tauri::command]
pub async fn restart_aria2(state: State<'_, AppState>, app: AppHandle) -> Result<()> {
    // Save session first
    if let Ok(client) = state.get_client().await {
        let _ = client.save_session().await;
    }

    state.restart_aria2(&app).await?;
    Ok(())
}

#[tauri::command]
pub fn show_window(app: AppHandle) -> Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.show()?;
        window.set_focus()?;
    }
    Ok(())
}

#[tauri::command]
pub fn hide_window(app: AppHandle) -> Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide()?;
    }
    Ok(())
}

#[tauri::command]
pub fn quit_app(app: AppHandle) -> Result<()> {
    app.exit(0);
    Ok(())
}

#[tauri::command]
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

#[tauri::command]
pub fn open_file_location(file_path: String) -> Result<()> {
    let path = std::path::Path::new(&file_path);
    let folder = path.parent().unwrap_or(path);

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(folder)
            .spawn()?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&file_path)
            .spawn()?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(&file_path)
            .spawn()?;
    }

    Ok(())
}

#[tauri::command]
pub fn get_default_download_path() -> String {
    dirs::download_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| {
            dirs::home_dir()
                .map(|p| p.join("Downloads").to_string_lossy().to_string())
                .unwrap_or_else(|| "~/Downloads".to_string())
        })
}

#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub fn get_app_info() -> serde_json::Value {
    serde_json::json!({
        "name": "Gosh-Fetch",
        "version": env!("CARGO_PKG_VERSION"),
        "description": "Gosh Fetch the modern download manager powered by aria2",
        "license": "AGPL-3.0",
        "repository": "https://github.com/goshitsarch-eng/Gosh-Fetch",
        "attribution": {
            "aria2": {
                "name": "aria2",
                "url": "https://github.com/aria2/aria2",
                "license": "GNU General Public License Version 2, June 1991",
                "note": "Special thanks to the aria2 project. Gosh-Fetch is not affiliated with the aria2 project."
            },
            "openssl": {
                "name": "OpenSSL",
                "url": "https://www.openssl.org",
                "license": "Apache License, Version 2.0",
                "note": "Special thanks to the OpenSSL project. Used by aria2 for TLS/SSL support."
            }
        }
    })
}
