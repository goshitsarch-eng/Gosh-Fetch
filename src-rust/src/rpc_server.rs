use crate::commands;
use crate::db::Settings;
use crate::types::{Download, DownloadOptions};
use crate::AppState;
use serde_json::Value;
use std::io::{self, BufRead, Write};
use tokio::sync::broadcast;

pub async fn run_rpc_server(state: AppState, mut event_rx: broadcast::Receiver<Value>) {
    // Spawn event forwarder: reads events from broadcast channel and writes to stdout
    let state_for_stats = state.clone();
    tokio::spawn(async move {
        loop {
            match event_rx.recv().await {
                Ok(event) => {
                    let line = serde_json::to_string(&event).unwrap_or_default();
                    let stdout = io::stdout();
                    let mut handle = stdout.lock();
                    let _ = writeln!(handle, "{}", line);
                    let _ = handle.flush();
                }
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    log::warn!("Event receiver lagged by {} messages", n);
                }
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    });

    // Spawn global stats emitter (every 1 second)
    let state_for_stats2 = state_for_stats.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
            if let Ok(adapter) = state_for_stats2.get_adapter().await {
                let stats = adapter.get_global_stats();
                let download_speed: u64 = stats.download_speed.parse().unwrap_or(0);
                let upload_speed: u64 = stats.upload_speed.parse().unwrap_or(0);
                let num_active: u32 = stats.num_active.parse().unwrap_or(0);
                let num_waiting: u32 = stats.num_waiting.parse().unwrap_or(0);
                let num_stopped: u32 = stats.num_stopped.parse().unwrap_or(0);

                let event = serde_json::json!({
                    "event": "global-stats",
                    "data": {
                        "downloadSpeed": download_speed,
                        "uploadSpeed": upload_speed,
                        "numActive": num_active,
                        "numWaiting": num_waiting,
                        "numStopped": num_stopped,
                    }
                });

                let line = serde_json::to_string(&event).unwrap_or_default();
                let stdout = io::stdout();
                let mut handle = stdout.lock();
                let _ = writeln!(handle, "{}", line);
                let _ = handle.flush();
            }
        }
    });

    // Main RPC loop: read lines from stdin
    let stdin = io::stdin();
    let reader = stdin.lock();

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };

        if line.trim().is_empty() {
            continue;
        }

        let request: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(e) => {
                write_error_response(None, -32700, &format!("Parse error: {}", e));
                continue;
            }
        };

        let id = request.get("id").cloned();
        let method = request.get("method").and_then(|m| m.as_str()).unwrap_or("");
        let params = request.get("params").cloned().unwrap_or(Value::Null);

        let result = handle_method(&state, method, params).await;

        match result {
            Ok(value) => write_success_response(id, value),
            Err(e) => write_error_response(id, e.code(), &e.to_string()),
        }
    }
}

async fn handle_method(
    state: &AppState,
    method: &str,
    params: Value,
) -> crate::Result<Value> {
    match method {
        // Download commands
        "add_download" => {
            let url = params.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let options: Option<DownloadOptions> = params.get("options").and_then(|v| serde_json::from_value(v.clone()).ok());
            let gid = commands::add_download(state, url, options).await?;
            Ok(Value::String(gid))
        }
        "add_urls" => {
            let urls: Vec<String> = params.get("urls").and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default();
            let options: Option<DownloadOptions> = params.get("options").and_then(|v| serde_json::from_value(v.clone()).ok());
            let gids = commands::add_urls(state, urls, options).await?;
            Ok(serde_json::to_value(gids)?)
        }
        "pause_download" => {
            let gid = params.get("gid").and_then(|v| v.as_str()).unwrap_or("").to_string();
            commands::pause_download(state, gid).await?;
            Ok(Value::Null)
        }
        "pause_all" => {
            commands::pause_all(state).await?;
            Ok(Value::Null)
        }
        "resume_download" => {
            let gid = params.get("gid").and_then(|v| v.as_str()).unwrap_or("").to_string();
            commands::resume_download(state, gid).await?;
            Ok(Value::Null)
        }
        "resume_all" => {
            commands::resume_all(state).await?;
            Ok(Value::Null)
        }
        "remove_download" => {
            let gid = params.get("gid").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let delete_files = params.get("deleteFiles").or(params.get("delete_files")).and_then(|v| v.as_bool()).unwrap_or(false);
            commands::remove_download(state, gid, delete_files).await?;
            Ok(Value::Null)
        }
        "get_download_status" => {
            let gid = params.get("gid").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let download = commands::get_download_status(state, gid).await?;
            Ok(serde_json::to_value(download)?)
        }
        "get_all_downloads" => {
            let downloads = commands::get_all_downloads(state).await?;
            Ok(serde_json::to_value(downloads)?)
        }
        "get_active_downloads" => {
            let downloads = commands::get_active_downloads(state).await?;
            Ok(serde_json::to_value(downloads)?)
        }
        "get_global_stats" => {
            let stats = commands::get_global_stats(state).await?;
            Ok(serde_json::to_value(stats)?)
        }
        "set_speed_limit" => {
            let dl = params.get("downloadLimit").or(params.get("download_limit")).and_then(|v| v.as_u64());
            let ul = params.get("uploadLimit").or(params.get("upload_limit")).and_then(|v| v.as_u64());
            commands::set_speed_limit(state, dl, ul).await?;
            Ok(Value::Null)
        }

        // Torrent commands
        "add_torrent_file" => {
            let file_path = params.get("filePath").or(params.get("file_path")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let options: Option<DownloadOptions> = params.get("options").and_then(|v| serde_json::from_value(v.clone()).ok());
            let gid = commands::add_torrent_file(state, file_path, options).await?;
            Ok(Value::String(gid))
        }
        "add_magnet" => {
            let magnet_uri = params.get("magnetUri").or(params.get("magnet_uri")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let options: Option<DownloadOptions> = params.get("options").and_then(|v| serde_json::from_value(v.clone()).ok());
            let gid = commands::add_magnet(state, magnet_uri, options).await?;
            Ok(Value::String(gid))
        }
        "get_torrent_files" => {
            let gid = params.get("gid").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let files = commands::get_torrent_files(state, gid).await?;
            Ok(serde_json::to_value(files)?)
        }
        "select_torrent_files" => {
            let gid = params.get("gid").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let indices: Vec<u32> = params.get("fileIndices").or(params.get("file_indices")).and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default();
            commands::select_torrent_files(state, gid, indices).await?;
            Ok(Value::Null)
        }
        "parse_torrent_file" => {
            let file_path = params.get("filePath").or(params.get("file_path")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let info = commands::parse_torrent_file(file_path)?;
            Ok(serde_json::to_value(info)?)
        }
        "parse_magnet_uri" => {
            let magnet_uri = params.get("magnetUri").or(params.get("magnet_uri")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let info = commands::parse_magnet_uri(magnet_uri)?;
            Ok(serde_json::to_value(info)?)
        }
        "get_peers" => {
            let gid = params.get("gid").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let peers = commands::get_peers(state, gid).await?;
            Ok(serde_json::to_value(peers)?)
        }

        // Settings commands
        "get_settings" => {
            let settings = commands::get_settings(state).await?;
            Ok(serde_json::to_value(settings)?)
        }
        "update_settings" => {
            let settings: Settings = serde_json::from_value(params.get("settings").cloned().unwrap_or(params.clone()))?;
            commands::update_settings(state, settings).await?;
            Ok(Value::Null)
        }
        "set_close_to_tray" => {
            let value = params.get("value").and_then(|v| v.as_bool()).unwrap_or(true);
            commands::set_close_to_tray(state, value);
            Ok(Value::Null)
        }
        "set_user_agent" => {
            let user_agent = params.get("userAgent").or(params.get("user_agent")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            commands::set_user_agent(state, user_agent).await?;
            Ok(Value::Null)
        }
        "get_tracker_list" => {
            let trackers = commands::get_tracker_list().await?;
            Ok(serde_json::to_value(trackers)?)
        }
        "update_tracker_list" => {
            let trackers = commands::update_tracker_list(state).await?;
            Ok(serde_json::to_value(trackers)?)
        }
        "apply_settings_to_engine" => {
            let settings: Settings = serde_json::from_value(params.get("settings").cloned().unwrap_or(params.clone()))?;
            commands::apply_settings_to_engine(state, settings).await?;
            Ok(Value::Null)
        }
        "get_user_agent_presets" => {
            let presets = commands::get_user_agent_presets();
            Ok(serde_json::to_value(presets)?)
        }

        // System commands
        "get_engine_version" => {
            let info = commands::get_engine_version(state).await?;
            Ok(info)
        }
        "open_download_folder" => {
            let path = params.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string();
            commands::open_download_folder(path)?;
            Ok(Value::Null)
        }
        "open_file_location" => {
            let file_path = params.get("filePath").or(params.get("file_path")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            commands::open_file_location(file_path)?;
            Ok(Value::Null)
        }
        "get_default_download_path" => {
            let path = commands::get_default_download_path();
            Ok(Value::String(path))
        }
        "get_app_version" => {
            let version = commands::get_app_version();
            Ok(Value::String(version))
        }
        "get_app_info" => {
            let info = commands::get_app_info();
            Ok(info)
        }

        // Database commands
        "db_get_completed_history" => {
            let downloads = commands::db_get_completed_history(state).await?;
            Ok(serde_json::to_value(downloads)?)
        }
        "db_save_download" => {
            let download: Download = serde_json::from_value(params.get("download").cloned().unwrap_or(params.clone()))?;
            commands::db_save_download(state, download).await?;
            Ok(Value::Null)
        }
        "db_remove_download" => {
            let gid = params.get("gid").and_then(|v| v.as_str()).unwrap_or("").to_string();
            commands::db_remove_download(state, gid).await?;
            Ok(Value::Null)
        }
        "db_clear_history" => {
            commands::db_clear_history(state).await?;
            Ok(Value::Null)
        }
        "db_get_settings" => {
            let settings = commands::db_get_settings(state).await?;
            Ok(serde_json::to_value(settings)?)
        }
        "db_save_settings" => {
            let settings: Settings = serde_json::from_value(params.get("settings").cloned().unwrap_or(params.clone()))?;
            commands::db_save_settings(state, settings).await?;
            Ok(Value::Null)
        }
        "db_load_incomplete" => {
            let downloads = commands::db_load_incomplete(state).await?;
            Ok(serde_json::to_value(downloads)?)
        }

        _ => {
            Err(crate::Error::InvalidInput(format!("Unknown method: {}", method)))
        }
    }
}

fn write_success_response(id: Option<Value>, result: Value) {
    let response = serde_json::json!({
        "id": id,
        "result": result,
    });
    let line = serde_json::to_string(&response).unwrap_or_default();
    let stdout = io::stdout();
    let mut handle = stdout.lock();
    let _ = writeln!(handle, "{}", line);
    let _ = handle.flush();
}

fn write_error_response(id: Option<Value>, code: i32, message: &str) {
    let response = serde_json::json!({
        "id": id,
        "error": {
            "code": code,
            "message": message,
        },
    });
    let line = serde_json::to_string(&response).unwrap_or_default();
    let stdout = io::stdout();
    let mut handle = stdout.lock();
    let _ = writeln!(handle, "{}", line);
    let _ = handle.flush();
}
