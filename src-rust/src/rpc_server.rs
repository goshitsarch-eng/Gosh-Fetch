use crate::commands;
use crate::db::Settings;
use crate::types::{Download, DownloadOptions};
use crate::{AppState, Error};
use serde_json::Value;
use std::io::{self, Write};
use std::net::IpAddr;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::{broadcast, mpsc};

const MAX_URL_LENGTH: usize = 8192;

/// Validate a download URL: must be http://, https://, or magnet:
/// Rejects file:// scheme, empty URLs, overly long URLs, and private IP addresses.
fn validate_download_url(url: &str) -> crate::Result<()> {
    if url.is_empty() {
        return Err(Error::InvalidInput("URL cannot be empty".into()));
    }
    if url.len() > MAX_URL_LENGTH {
        return Err(Error::InvalidInput(format!(
            "URL exceeds maximum length of {} characters",
            MAX_URL_LENGTH
        )));
    }

    let lower = url.to_lowercase();
    if lower.starts_with("magnet:") {
        return Ok(());
    }
    if !lower.starts_with("http://") && !lower.starts_with("https://") {
        return Err(Error::InvalidInput(format!(
            "URL must use http://, https://, or magnet: scheme, got: {}",
            url.split("://").next().unwrap_or("unknown")
        )));
    }

    // Parse URL and check for private/loopback IPs
    if let Ok(parsed) = url::Url::parse(url) {
        if let Some(host) = parsed.host_str() {
            if let Ok(ip) = host.parse::<IpAddr>() {
                if is_private_ip(&ip) {
                    return Err(Error::InvalidInput(
                        "URLs targeting private/loopback IP addresses are not allowed".into(),
                    ));
                }
            }
        }
    }

    Ok(())
}

fn is_private_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()             // 127.0.0.0/8
                || v4.is_private()       // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
                || v4.is_link_local()    // 169.254.0.0/16
                || v4.is_unspecified()   // 0.0.0.0
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()             // ::1
                || v6.is_unspecified()   // ::
                // fc00::/7 (unique local)
                || (v6.segments()[0] & 0xfe00) == 0xfc00
        }
    }
}

/// Validate a torrent file path: must end with .torrent and exist on disk.
fn validate_torrent_path(file_path: &str) -> crate::Result<()> {
    if file_path.is_empty() {
        return Err(Error::InvalidInput("Torrent file path cannot be empty".into()));
    }
    if !file_path.to_lowercase().ends_with(".torrent") {
        return Err(Error::InvalidInput(
            "File must have a .torrent extension".into(),
        ));
    }
    if !std::path::Path::new(file_path).exists() {
        return Err(Error::InvalidInput(format!(
            "Torrent file does not exist: {}",
            file_path
        )));
    }
    Ok(())
}

pub async fn run_rpc_server(state: AppState, mut event_rx: broadcast::Receiver<Value>) {
    // Create a unified stdout channel to eliminate contention between writers
    let (stdout_tx, mut stdout_rx) = mpsc::unbounded_channel::<String>();

    // Dedicated stdout writer task
    tokio::spawn(async move {
        while let Some(line) = stdout_rx.recv().await {
            let stdout = io::stdout();
            let mut handle = stdout.lock();
            let _ = writeln!(handle, "{}", line);
            let _ = handle.flush();
        }
    });

    // Spawn event forwarder: reads events from broadcast channel and sends to stdout channel
    let event_tx = stdout_tx.clone();
    tokio::spawn(async move {
        loop {
            match event_rx.recv().await {
                Ok(event) => {
                    let line = serde_json::to_string(&event).unwrap_or_default();
                    let _ = event_tx.send(line);
                }
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    log::warn!("Event receiver lagged by {} messages", n);
                }
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    });

    // Spawn global stats emitter (every 1 second)
    let stats_state = state.clone();
    let stats_tx = stdout_tx.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
            if let Ok(adapter) = stats_state.get_adapter().await {
                let stats = adapter.get_global_stats();

                let event = serde_json::json!({
                    "event": "global-stats",
                    "data": {
                        "downloadSpeed": stats.download_speed,
                        "uploadSpeed": stats.upload_speed,
                        "numActive": stats.num_active,
                        "numWaiting": stats.num_waiting,
                        "numStopped": stats.num_stopped,
                    }
                });

                let line = serde_json::to_string(&event).unwrap_or_default();
                let _ = stats_tx.send(line);
            }
        }
    });

    // Main RPC loop: read lines from async stdin
    let stdin = tokio::io::stdin();
    let reader = BufReader::new(stdin);
    let mut lines = reader.lines();

    while let Ok(Some(line)) = lines.next_line().await {
        if line.trim().is_empty() {
            continue;
        }

        let request: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(e) => {
                send_error_response(&stdout_tx, None, -32700, &format!("Parse error: {}", e));
                continue;
            }
        };

        let id = request.get("id").cloned();
        let method = request
            .get("method")
            .and_then(|m| m.as_str())
            .unwrap_or("")
            .to_string();
        let params = request.get("params").cloned().unwrap_or(Value::Null);

        // Spawn each request handler as a separate task for concurrent processing
        let req_state = state.clone();
        let req_tx = stdout_tx.clone();
        tokio::spawn(async move {
            let result = handle_method(&req_state, &method, params).await;
            match result {
                Ok(value) => send_success_response(&req_tx, id, value),
                Err(e) => send_error_response(&req_tx, id, e.code(), &e.to_string()),
            }
        });
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
            validate_download_url(&url)?;
            let options: Option<DownloadOptions> = params.get("options").and_then(|v| serde_json::from_value(v.clone()).ok());
            let gid = commands::add_download(state, url, options).await?;
            Ok(Value::String(gid))
        }
        "add_urls" => {
            let urls: Vec<String> = params.get("urls").and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default();
            for url in &urls {
                validate_download_url(url)?;
            }
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
            validate_torrent_path(&file_path)?;
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
            validate_torrent_path(&file_path)?;
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
            let trackers = commands::get_tracker_list(state).await?;
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

        // Priority and scheduling
        "set_priority" => {
            let gid = params.get("gid").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let priority_str = params.get("priority").and_then(|v| v.as_str()).unwrap_or("normal").to_string();
            let engine = state.get_engine().await?;
            let id = crate::engine_adapter::parse_gid_public(&gid)?;
            let priority: gosh_dl::DownloadPriority = priority_str.parse().map_err(|_| {
                Error::InvalidInput(format!("Invalid priority: {}. Use low, normal, high, or critical.", priority_str))
            })?;
            engine.set_priority(id, priority)?;
            Ok(Value::Null)
        }
        "get_schedule_rules" => {
            let engine = state.get_engine().await?;
            let rules = engine.get_schedule_rules();
            Ok(serde_json::to_value(rules)?)
        }
        "set_schedule_rules" => {
            let rules: Vec<gosh_dl::ScheduleRule> = serde_json::from_value(
                params.get("rules").cloned().unwrap_or(Value::Array(vec![]))
            )?;
            let engine = state.get_engine().await?;
            engine.set_schedule_rules(rules);
            Ok(Value::Null)
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

fn send_success_response(tx: &mpsc::UnboundedSender<String>, id: Option<Value>, result: Value) {
    let response = serde_json::json!({
        "id": id,
        "result": result,
    });
    let line = serde_json::to_string(&response).unwrap_or_default();
    let _ = tx.send(line);
}

fn send_error_response(tx: &mpsc::UnboundedSender<String>, id: Option<Value>, code: i32, message: &str) {
    let response = serde_json::json!({
        "id": id,
        "error": {
            "code": code,
            "message": message,
        },
    });
    let line = serde_json::to_string(&response).unwrap_or_default();
    let _ = tx.send(line);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_download_url_valid() {
        assert!(validate_download_url("https://example.com/file.zip").is_ok());
        assert!(validate_download_url("http://example.com/file.zip").is_ok());
        assert!(validate_download_url("magnet:?xt=urn:btih:abc123").is_ok());
    }

    #[test]
    fn test_validate_download_url_empty() {
        assert!(validate_download_url("").is_err());
    }

    #[test]
    fn test_validate_download_url_bad_scheme() {
        assert!(validate_download_url("file:///etc/passwd").is_err());
        assert!(validate_download_url("ftp://example.com/file").is_err());
        assert!(validate_download_url("javascript:alert(1)").is_err());
    }

    #[test]
    fn test_validate_download_url_too_long() {
        let long_url = format!("https://example.com/{}", "a".repeat(MAX_URL_LENGTH));
        assert!(validate_download_url(&long_url).is_err());
    }

    #[test]
    fn test_validate_download_url_private_ips() {
        assert!(validate_download_url("http://127.0.0.1/file").is_err());
        assert!(validate_download_url("http://192.168.1.1/file").is_err());
        assert!(validate_download_url("http://10.0.0.1/file").is_err());
        assert!(validate_download_url("http://172.16.0.1/file").is_err());
        assert!(validate_download_url("http://0.0.0.0/file").is_err());
    }

    #[test]
    fn test_is_private_ip() {
        assert!(is_private_ip(&"127.0.0.1".parse().unwrap()));
        assert!(is_private_ip(&"10.0.0.1".parse().unwrap()));
        assert!(is_private_ip(&"192.168.0.1".parse().unwrap()));
        assert!(is_private_ip(&"172.16.0.1".parse().unwrap()));
        assert!(is_private_ip(&"169.254.1.1".parse().unwrap()));
        assert!(is_private_ip(&"::1".parse().unwrap()));

        assert!(!is_private_ip(&"8.8.8.8".parse().unwrap()));
        assert!(!is_private_ip(&"1.1.1.1".parse().unwrap()));
    }

    #[test]
    fn test_validate_torrent_path_empty() {
        assert!(validate_torrent_path("").is_err());
    }

    #[test]
    fn test_validate_torrent_path_wrong_extension() {
        assert!(validate_torrent_path("/tmp/file.zip").is_err());
    }

    #[test]
    fn test_validate_torrent_path_nonexistent() {
        assert!(validate_torrent_path("/nonexistent/path/file.torrent").is_err());
    }
}
