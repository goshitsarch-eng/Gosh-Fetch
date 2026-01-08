use crate::{AppState, Result};
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub async fn get_engine_version(state: State<'_, AppState>) -> Result<serde_json::Value> {
    let is_running = state.is_engine_running().await;
    Ok(serde_json::json!({
        "name": "gosh-dl",
        "version": "0.1.0",
        "running": is_running,
    }))
}

// Keep old name for backwards compatibility
#[tauri::command]
pub async fn get_aria2_version(state: State<'_, AppState>) -> Result<serde_json::Value> {
    get_engine_version(state).await
}

#[tauri::command]
pub async fn restart_engine(state: State<'_, AppState>, app: AppHandle) -> Result<()> {
    // Shutdown and reinitialize engine
    state.shutdown().await?;
    state.initialize(&app).await?;
    log::info!("Download engine restarted");
    Ok(())
}

// Keep old name for backwards compatibility
#[tauri::command]
pub async fn restart_aria2(state: State<'_, AppState>, app: AppHandle) -> Result<()> {
    restart_engine(state, app).await
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
