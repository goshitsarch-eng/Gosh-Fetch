use crate::types::{Download, DownloadOptions, GlobalStat};
use crate::{AppState, Result};
use tauri::State;

#[tauri::command]
pub async fn add_download(
    state: State<'_, AppState>,
    url: String,
    options: Option<DownloadOptions>,
) -> Result<String> {
    let adapter = state.get_adapter().await?;
    let gid = adapter.add_download(url, options).await?;
    log::info!("Added download with GID: {}", gid);
    Ok(gid)
}

#[tauri::command]
pub async fn add_urls(
    state: State<'_, AppState>,
    urls: Vec<String>,
    options: Option<DownloadOptions>,
) -> Result<Vec<String>> {
    let adapter = state.get_adapter().await?;
    let gids = adapter.add_urls(urls, options).await?;
    Ok(gids)
}

#[tauri::command]
pub async fn pause_download(state: State<'_, AppState>, gid: String) -> Result<()> {
    let adapter = state.get_adapter().await?;
    adapter.pause(&gid).await?;
    log::info!("Paused download: {}", gid);
    Ok(())
}

#[tauri::command]
pub async fn pause_all(state: State<'_, AppState>) -> Result<()> {
    let adapter = state.get_adapter().await?;
    adapter.pause_all().await?;
    log::info!("Paused all downloads");
    Ok(())
}

#[tauri::command]
pub async fn resume_download(state: State<'_, AppState>, gid: String) -> Result<()> {
    let adapter = state.get_adapter().await?;
    adapter.resume(&gid).await?;
    log::info!("Resumed download: {}", gid);
    Ok(())
}

#[tauri::command]
pub async fn resume_all(state: State<'_, AppState>) -> Result<()> {
    let adapter = state.get_adapter().await?;
    adapter.resume_all().await?;
    log::info!("Resumed all downloads");
    Ok(())
}

#[tauri::command]
pub async fn remove_download(
    state: State<'_, AppState>,
    gid: String,
    delete_files: bool,
) -> Result<()> {
    let adapter = state.get_adapter().await?;
    adapter.remove(&gid, delete_files).await?;
    log::info!("Removed download: {} (delete_files: {})", gid, delete_files);
    Ok(())
}

#[tauri::command]
pub async fn get_download_status(state: State<'_, AppState>, gid: String) -> Result<Download> {
    let adapter = state.get_adapter().await?;
    adapter
        .get_status(&gid)
        .ok_or_else(|| crate::Error::NotFound(format!("Download not found: {}", gid)))
}

#[tauri::command]
pub async fn get_all_downloads(state: State<'_, AppState>) -> Result<Vec<Download>> {
    let adapter = state.get_adapter().await?;
    Ok(adapter.get_all())
}

#[tauri::command]
pub async fn get_active_downloads(state: State<'_, AppState>) -> Result<Vec<Download>> {
    let adapter = state.get_adapter().await?;
    Ok(adapter.get_active())
}

#[tauri::command]
pub async fn get_global_stats(state: State<'_, AppState>) -> Result<GlobalStat> {
    let adapter = state.get_adapter().await?;
    Ok(adapter.get_global_stats())
}

#[tauri::command]
pub async fn set_speed_limit(
    state: State<'_, AppState>,
    download_limit: Option<u64>,
    upload_limit: Option<u64>,
) -> Result<()> {
    let adapter = state.get_adapter().await?;
    adapter.set_speed_limit(download_limit, upload_limit)?;
    Ok(())
}
