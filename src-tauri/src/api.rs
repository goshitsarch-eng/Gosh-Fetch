//! Tauri command layer: thin `#[tauri::command]` wrappers around the
//! business logic in `commands/`, applying the same input validation the
//! old JSON-RPC server did. Command names match the legacy RPC method names.

use crate::db::Settings;
use crate::state::OpenRequest;
use crate::types::{Download, DownloadFile, DownloadOptions, GlobalStat, MagnetInfo, TorrentInfo};
use crate::validation::{validate_download_url, validate_torrent_path};
use crate::{commands, AppState, Error, Result};
use tauri::State;

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn add_download(
    state: State<'_, AppState>,
    url: String,
    options: Option<DownloadOptions>,
) -> Result<String> {
    validate_download_url(&url)?;
    commands::add_download(&state, url, options).await
}

#[tauri::command]
pub async fn add_urls(
    state: State<'_, AppState>,
    urls: Vec<String>,
    options: Option<DownloadOptions>,
) -> Result<Vec<String>> {
    for url in &urls {
        validate_download_url(url)?;
    }
    commands::add_urls(&state, urls, options).await
}

#[tauri::command]
pub async fn pause_download(state: State<'_, AppState>, gid: String) -> Result<()> {
    commands::pause_download(&state, gid).await
}

#[tauri::command]
pub async fn pause_all(state: State<'_, AppState>) -> Result<serde_json::Value> {
    commands::pause_all(&state).await
}

#[tauri::command]
pub async fn resume_download(state: State<'_, AppState>, gid: String) -> Result<()> {
    commands::resume_download(&state, gid).await
}

#[tauri::command]
pub async fn resume_all(state: State<'_, AppState>) -> Result<serde_json::Value> {
    commands::resume_all(&state).await
}

#[tauri::command]
pub async fn cancel_all(
    state: State<'_, AppState>,
    delete_files: Option<bool>,
) -> Result<serde_json::Value> {
    commands::cancel_all(&state, delete_files.unwrap_or(false)).await
}

#[tauri::command]
pub async fn remove_download(
    state: State<'_, AppState>,
    gid: String,
    delete_files: Option<bool>,
) -> Result<()> {
    commands::remove_download(&state, gid, delete_files.unwrap_or(false)).await
}

#[tauri::command]
pub async fn get_download_status(state: State<'_, AppState>, gid: String) -> Result<Download> {
    commands::get_download_status(&state, gid).await
}

#[tauri::command]
pub async fn get_all_downloads(state: State<'_, AppState>) -> Result<Vec<Download>> {
    commands::get_all_downloads(&state).await
}

#[tauri::command]
pub async fn get_active_downloads(state: State<'_, AppState>) -> Result<Vec<Download>> {
    commands::get_active_downloads(&state).await
}

#[tauri::command]
pub async fn get_global_stats(state: State<'_, AppState>) -> Result<GlobalStat> {
    commands::get_global_stats(&state).await
}

#[tauri::command]
pub async fn set_speed_limit(
    state: State<'_, AppState>,
    download_limit: Option<u64>,
    upload_limit: Option<u64>,
) -> Result<()> {
    commands::set_speed_limit(&state, download_limit, upload_limit).await
}

#[tauri::command]
pub async fn set_priority(
    state: State<'_, AppState>,
    gid: String,
    priority: String,
) -> Result<()> {
    let engine = state.get_engine().await?;
    let id = crate::engine_adapter::parse_gid_public(&gid)?;
    let priority: gosh_dl::DownloadPriority = priority.parse().map_err(|_| {
        Error::InvalidInput(format!(
            "Invalid priority: {}. Use low, normal, high, or critical.",
            priority
        ))
    })?;
    engine.set_priority(id, priority)?;
    Ok(())
}

#[tauri::command]
pub async fn get_schedule_rules(state: State<'_, AppState>) -> Result<serde_json::Value> {
    let engine = state.get_engine().await?;
    Ok(serde_json::to_value(engine.get_schedule_rules())?)
}

#[tauri::command]
pub async fn set_schedule_rules(
    state: State<'_, AppState>,
    rules: Vec<gosh_dl::ScheduleRule>,
) -> Result<()> {
    let engine = state.get_engine().await?;
    engine.set_schedule_rules(rules);
    Ok(())
}

// ---------------------------------------------------------------------------
// Torrents
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn add_torrent_file(
    state: State<'_, AppState>,
    file_path: String,
    options: Option<DownloadOptions>,
) -> Result<String> {
    validate_torrent_path(&file_path)?;
    commands::add_torrent_file(&state, file_path, options).await
}

#[tauri::command]
pub async fn add_magnet(
    state: State<'_, AppState>,
    magnet_uri: String,
    options: Option<DownloadOptions>,
) -> Result<String> {
    commands::add_magnet(&state, magnet_uri, options).await
}

#[tauri::command]
pub async fn get_torrent_files(
    state: State<'_, AppState>,
    gid: String,
) -> Result<Vec<DownloadFile>> {
    commands::get_torrent_files(&state, gid).await
}

#[tauri::command]
pub async fn select_torrent_files(
    state: State<'_, AppState>,
    gid: String,
    file_indices: Vec<u32>,
) -> Result<()> {
    commands::select_torrent_files(&state, gid, file_indices).await
}

#[tauri::command]
pub fn parse_torrent_file(file_path: String) -> Result<TorrentInfo> {
    validate_torrent_path(&file_path)?;
    commands::parse_torrent_file(file_path)
}

#[tauri::command]
pub fn parse_magnet_uri(magnet_uri: String) -> Result<MagnetInfo> {
    commands::parse_magnet_uri(magnet_uri)
}

#[tauri::command]
pub async fn get_peers(
    state: State<'_, AppState>,
    gid: String,
) -> Result<Vec<serde_json::Value>> {
    commands::get_peers(&state, gid).await
}

// ---------------------------------------------------------------------------
// Recursive mirroring
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn discover_recursive(
    state: State<'_, AppState>,
    url: String,
    options: Option<DownloadOptions>,
    recursive: Option<gosh_dl::RecursiveOptions>,
) -> Result<gosh_dl::RecursiveManifest> {
    commands::discover_recursive(&state, url, options, recursive).await
}

#[tauri::command]
pub async fn add_recursive(
    state: State<'_, AppState>,
    url: String,
    options: Option<DownloadOptions>,
    recursive: Option<gosh_dl::RecursiveOptions>,
) -> Result<serde_json::Value> {
    commands::add_recursive(&state, url, options, recursive).await
}

#[tauri::command]
pub async fn list_recursive_jobs(state: State<'_, AppState>) -> Result<Vec<serde_json::Value>> {
    commands::list_recursive_jobs(&state).await
}

#[tauri::command]
pub async fn get_recursive_job(
    state: State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value> {
    commands::get_recursive_job(&state, id).await
}

#[tauri::command]
pub async fn cancel_recursive_job(
    state: State<'_, AppState>,
    id: String,
    delete_files: Option<bool>,
) -> Result<()> {
    commands::cancel_recursive_job(&state, id, delete_files.unwrap_or(false)).await
}

#[tauri::command]
pub async fn remove_recursive_job(
    state: State<'_, AppState>,
    id: String,
    delete_files: Option<bool>,
) -> Result<()> {
    commands::remove_recursive_job(&state, id, delete_files.unwrap_or(false)).await
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings> {
    commands::get_settings(&state).await
}

#[tauri::command]
pub async fn update_settings(state: State<'_, AppState>, settings: Settings) -> Result<()> {
    commands::update_settings(&state, settings).await
}

#[tauri::command]
pub fn set_close_to_tray(state: State<'_, AppState>, value: bool) {
    commands::set_close_to_tray(&state, value);
}

#[tauri::command]
pub async fn set_user_agent(state: State<'_, AppState>, user_agent: String) -> Result<()> {
    commands::set_user_agent(&state, user_agent).await
}

#[tauri::command]
pub async fn get_tracker_list(state: State<'_, AppState>) -> Result<Vec<String>> {
    commands::get_tracker_list(&state).await
}

#[tauri::command]
pub async fn update_tracker_list(state: State<'_, AppState>) -> Result<Vec<String>> {
    commands::update_tracker_list(&state).await
}

#[tauri::command]
pub async fn apply_settings_to_engine(
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<()> {
    commands::apply_settings_to_engine(&state, settings).await
}

#[tauri::command]
pub fn get_user_agent_presets() -> Vec<(String, String)> {
    commands::get_user_agent_presets()
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_engine_version(state: State<'_, AppState>) -> Result<serde_json::Value> {
    commands::get_engine_version(&state).await
}

#[tauri::command]
pub fn open_download_folder(path: String) -> Result<()> {
    commands::open_download_folder(path)
}

#[tauri::command]
pub fn open_file_location(file_path: String) -> Result<()> {
    commands::open_file_location(file_path)
}

#[tauri::command]
pub fn get_default_download_path() -> String {
    commands::get_default_download_path()
}

#[tauri::command]
pub fn get_app_version() -> String {
    commands::get_app_version()
}

#[tauri::command]
pub fn get_app_info() -> serde_json::Value {
    commands::get_app_info()
}

#[tauri::command]
pub fn get_disk_space(path: Option<String>) -> Result<serde_json::Value> {
    commands::get_disk_space(path)
}

#[tauri::command]
pub fn perform_system_action(action: String, force_close_apps: Option<bool>) -> Result<()> {
    commands::perform_system_action(&action, force_close_apps.unwrap_or(false))
}

#[tauri::command]
pub fn read_settings_json(path: String) -> Result<serde_json::Value> {
    commands::read_settings_json(path)
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn db_get_completed_history(state: State<'_, AppState>) -> Result<Vec<Download>> {
    commands::db_get_completed_history(&state).await
}

#[tauri::command]
pub async fn db_save_download(state: State<'_, AppState>, download: Download) -> Result<()> {
    commands::db_save_download(&state, download).await
}

#[tauri::command]
pub async fn db_remove_download(state: State<'_, AppState>, gid: String) -> Result<()> {
    commands::db_remove_download(&state, gid).await
}

#[tauri::command]
pub async fn db_clear_history(state: State<'_, AppState>) -> Result<()> {
    commands::db_clear_history(&state).await
}

#[tauri::command]
pub async fn db_get_settings(state: State<'_, AppState>) -> Result<Settings> {
    commands::db_get_settings(&state).await
}

#[tauri::command]
pub async fn db_save_settings(state: State<'_, AppState>, settings: Settings) -> Result<()> {
    commands::db_save_settings(&state, settings).await
}

#[tauri::command]
pub async fn db_load_incomplete(state: State<'_, AppState>) -> Result<Vec<Download>> {
    commands::db_load_incomplete(&state).await
}

/// Called once by the frontend when its event listeners are wired up.
/// Marks the frontend ready and returns any magnet/.torrent open requests
/// that arrived before that (cold start via file association / deep link).
#[tauri::command]
pub fn get_pending_open_requests(state: State<'_, AppState>) -> Vec<OpenRequest> {
    state.take_pending_open_requests()
}
