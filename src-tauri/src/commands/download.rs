use crate::aria2::{Download, DownloadOptions, GlobalStat};
use crate::db::parse_download_status;
use crate::{AppState, Result};
use tauri::State;

#[tauri::command]
pub async fn add_download(
    state: State<'_, AppState>,
    url: String,
    options: Option<DownloadOptions>,
) -> Result<String> {
    let client = state.get_client().await?;
    let opts = options.unwrap_or_default();

    let gid = client.add_uri(vec![url], opts).await?;
    log::info!("Added download with GID: {}", gid);

    Ok(gid)
}

#[tauri::command]
pub async fn add_urls(
    state: State<'_, AppState>,
    urls: Vec<String>,
    options: Option<DownloadOptions>,
) -> Result<Vec<String>> {
    let client = state.get_client().await?;
    let opts = options.unwrap_or_default();

    let mut gids = Vec::new();
    for url in urls {
        let gid = client.add_uri(vec![url], opts.clone()).await?;
        gids.push(gid);
    }

    Ok(gids)
}

#[tauri::command]
pub async fn pause_download(state: State<'_, AppState>, gid: String) -> Result<()> {
    let client = state.get_client().await?;
    client.pause(&gid).await?;
    log::info!("Paused download: {}", gid);
    Ok(())
}

#[tauri::command]
pub async fn pause_all(state: State<'_, AppState>) -> Result<()> {
    let client = state.get_client().await?;
    client.pause_all().await?;
    log::info!("Paused all downloads");
    Ok(())
}

#[tauri::command]
pub async fn resume_download(state: State<'_, AppState>, gid: String) -> Result<()> {
    let client = state.get_client().await?;
    client.unpause(&gid).await?;
    log::info!("Resumed download: {}", gid);
    Ok(())
}

#[tauri::command]
pub async fn resume_all(state: State<'_, AppState>) -> Result<()> {
    let client = state.get_client().await?;
    client.unpause_all().await?;
    log::info!("Resumed all downloads");
    Ok(())
}

#[tauri::command]
pub async fn remove_download(
    state: State<'_, AppState>,
    gid: String,
    delete_files: bool,
) -> Result<()> {
    let client = state.get_client().await?;

    // Get file info before removing if we need to delete files
    let files = if delete_files {
        client.get_files(&gid).await.ok()
    } else {
        None
    };

    // Remove from aria2
    match client.remove(&gid).await {
        Ok(_) => {}
        Err(_) => {
            // Try force remove if normal remove fails
            client.force_remove(&gid).await?;
        }
    }

    // Delete files if requested
    if delete_files {
        if let Some(files) = files {
            for file in files {
                if let Err(e) = std::fs::remove_file(&file.path) {
                    log::warn!("Failed to delete file {}: {}", file.path, e);
                }
            }
        }
    }

    log::info!("Removed download: {} (delete_files: {})", gid, delete_files);
    Ok(())
}

#[tauri::command]
pub async fn get_download_status(state: State<'_, AppState>, gid: String) -> Result<Download> {
    let client = state.get_client().await?;
    let status = client.tell_status(&gid).await?;
    Ok(parse_download_status(&status, None))
}

#[tauri::command]
pub async fn get_all_downloads(state: State<'_, AppState>) -> Result<Vec<Download>> {
    let client = state.get_client().await?;

    let mut downloads = Vec::new();

    // Get active downloads
    let active = client.tell_active().await.unwrap_or_default();
    for status in active {
        downloads.push(parse_download_status(&status, None));
    }

    // Get waiting downloads
    let waiting = client.tell_waiting(0, 100).await.unwrap_or_default();
    for status in waiting {
        downloads.push(parse_download_status(&status, None));
    }

    // Get stopped/completed downloads
    let stopped = client.tell_stopped(0, 100).await.unwrap_or_default();
    for status in stopped {
        downloads.push(parse_download_status(&status, None));
    }

    Ok(downloads)
}

#[tauri::command]
pub async fn get_active_downloads(state: State<'_, AppState>) -> Result<Vec<Download>> {
    let client = state.get_client().await?;
    let active = client.tell_active().await?;

    Ok(active
        .into_iter()
        .map(|s| parse_download_status(&s, None))
        .collect())
}

#[tauri::command]
pub async fn get_global_stats(state: State<'_, AppState>) -> Result<GlobalStat> {
    let client = state.get_client().await?;
    client.get_global_stat().await
}

#[tauri::command]
pub async fn set_speed_limit(
    state: State<'_, AppState>,
    download_limit: Option<u64>,
    upload_limit: Option<u64>,
) -> Result<()> {
    let client = state.get_client().await?;

    let mut options = serde_json::Map::new();

    if let Some(limit) = download_limit {
        options.insert(
            "max-overall-download-limit".to_string(),
            serde_json::Value::String(limit.to_string()),
        );
    }

    if let Some(limit) = upload_limit {
        options.insert(
            "max-overall-upload-limit".to_string(),
            serde_json::Value::String(limit.to_string()),
        );
    }

    client
        .change_global_option(serde_json::Value::Object(options))
        .await?;

    Ok(())
}
