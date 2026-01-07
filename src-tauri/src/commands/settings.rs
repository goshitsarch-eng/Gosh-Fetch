use crate::aria2::TrackerUpdater;
use crate::db::Settings;
use crate::{AppState, Result};
use tauri::State;

#[tauri::command]
pub async fn get_settings(_state: State<'_, AppState>) -> Result<Settings> {
    // Settings are stored in the database, but for now return defaults
    // The frontend will use tauri-plugin-sql to read/write settings directly
    Ok(Settings::default())
}

#[tauri::command]
pub async fn update_settings(
    _state: State<'_, AppState>,
    _settings: Settings,
) -> Result<()> {
    // Settings are updated via tauri-plugin-sql from the frontend
    // This command can be used to apply settings to aria2
    Ok(())
}

#[tauri::command]
pub async fn set_user_agent(state: State<'_, AppState>, user_agent: String) -> Result<()> {
    let client = state.get_client().await?;

    let mut options = serde_json::Map::new();
    options.insert(
        "user-agent".to_string(),
        serde_json::Value::String(user_agent),
    );

    client
        .change_global_option(serde_json::Value::Object(options))
        .await?;

    Ok(())
}

#[tauri::command]
pub async fn get_tracker_list() -> Result<Vec<String>> {
    let mut updater = TrackerUpdater::new();
    updater.fetch_trackers().await
}

#[tauri::command]
pub async fn update_tracker_list(state: State<'_, AppState>) -> Result<Vec<String>> {
    let mut updater = TrackerUpdater::new();
    let trackers = updater.fetch_trackers().await?;

    // Apply trackers to aria2 global options
    let client = state.get_client().await?;
    let tracker_string = updater.get_tracker_string();

    let mut options = serde_json::Map::new();
    options.insert(
        "bt-tracker".to_string(),
        serde_json::Value::String(tracker_string),
    );

    client
        .change_global_option(serde_json::Value::Object(options))
        .await?;

    Ok(trackers)
}

#[tauri::command]
pub async fn apply_settings_to_aria2(
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<()> {
    let client = state.get_client().await?;

    let mut options = serde_json::Map::new();

    // Set the download directory
    options.insert(
        "dir".to_string(),
        serde_json::Value::String(settings.download_path.clone()),
    );

    options.insert(
        "max-concurrent-downloads".to_string(),
        serde_json::Value::String(settings.max_concurrent_downloads.to_string()),
    );

    options.insert(
        "split".to_string(),
        serde_json::Value::String(settings.split_count.to_string()),
    );

    options.insert(
        "max-connection-per-server".to_string(),
        serde_json::Value::String(settings.max_connections_per_server.to_string()),
    );

    if settings.download_speed_limit > 0 {
        options.insert(
            "max-overall-download-limit".to_string(),
            serde_json::Value::String(settings.download_speed_limit.to_string()),
        );
    }

    if settings.upload_speed_limit > 0 {
        options.insert(
            "max-overall-upload-limit".to_string(),
            serde_json::Value::String(settings.upload_speed_limit.to_string()),
        );
    }

    options.insert(
        "user-agent".to_string(),
        serde_json::Value::String(settings.user_agent),
    );

    options.insert(
        "bt-max-peers".to_string(),
        serde_json::Value::String(settings.bt_max_peers.to_string()),
    );

    options.insert(
        "seed-ratio".to_string(),
        serde_json::Value::String(settings.bt_seed_ratio.to_string()),
    );

    client
        .change_global_option(serde_json::Value::Object(options))
        .await?;

    Ok(())
}

// User-Agent presets
#[tauri::command]
pub fn get_user_agent_presets() -> Vec<(String, String)> {
    vec![
        (
            "Gosh-Fetch".to_string(),
            "Gosh-Fetch/1.0".to_string(),
        ),
        (
            "Chrome (Windows)".to_string(),
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36".to_string(),
        ),
        (
            "Chrome (macOS)".to_string(),
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36".to_string(),
        ),
        (
            "Firefox (Windows)".to_string(),
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0".to_string(),
        ),
        (
            "Firefox (Linux)".to_string(),
            "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0".to_string(),
        ),
        (
            "Wget".to_string(),
            "Wget/1.21.4".to_string(),
        ),
        (
            "Curl".to_string(),
            "curl/8.5.0".to_string(),
        ),
    ]
}
