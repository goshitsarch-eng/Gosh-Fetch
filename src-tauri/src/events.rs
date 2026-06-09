//! Background event emitters: 1s global stats + tray data feed.

use crate::AppState;
use tauri::{AppHandle, Emitter, Manager};

/// Format a speed in bytes/sec for the tray tooltip.
pub fn format_speed(bytes_per_sec: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    if bytes_per_sec >= GB {
        format!("{:.1} GB/s", bytes_per_sec as f64 / GB as f64)
    } else if bytes_per_sec >= MB {
        format!("{:.1} MB/s", bytes_per_sec as f64 / MB as f64)
    } else if bytes_per_sec >= KB {
        format!("{:.1} KB/s", bytes_per_sec as f64 / KB as f64)
    } else {
        format!("{} B/s", bytes_per_sec)
    }
}

/// Spawn the 1-second global stats emitter. Emits `global-stats` to all
/// windows, updates the tray tooltip, and pushes `tray-update` with active
/// download details for the tray popup.
pub fn spawn_stats_emitter(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
            let state = app.state::<AppState>();
            let Ok(adapter) = state.get_adapter().await else {
                continue;
            };
            let stats = adapter.get_global_stats();

            let _ = app.emit(
                "global-stats",
                serde_json::json!({
                    "downloadSpeed": stats.download_speed,
                    "uploadSpeed": stats.upload_speed,
                    "numActive": stats.num_active,
                    "numWaiting": stats.num_waiting,
                    "numStopped": stats.num_stopped,
                }),
            );

            // Tray tooltip (no-op on Linux where libappindicator has no tooltip)
            if let Some(tray) = app.tray_by_id("main-tray") {
                let tooltip = format!(
                    "Gosh-Fetch\n↓ {}  ↑ {}\n{} active",
                    format_speed(stats.download_speed),
                    format_speed(stats.upload_speed),
                    stats.num_active
                );
                let _ = tray.set_tooltip(Some(&tooltip));
            }

            // Feed the tray popup window if it exists
            if app.get_webview_window("tray-popup").is_some() {
                let active = adapter.get_active();
                let _ = app.emit_to(
                    "tray-popup",
                    "tray-update",
                    serde_json::json!({
                        "downloadSpeed": stats.download_speed,
                        "uploadSpeed": stats.upload_speed,
                        "activeDownloads": active.iter().map(|d| serde_json::json!({
                            "name": d.name,
                            "completedSize": d.completed_size,
                            "totalSize": d.total_size,
                            "downloadSpeed": d.download_speed,
                        })).collect::<Vec<_>>(),
                    }),
                );
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_speed() {
        assert_eq!(format_speed(512), "512 B/s");
        assert_eq!(format_speed(2048), "2.0 KB/s");
        assert_eq!(format_speed(3 * 1024 * 1024), "3.0 MB/s");
        assert_eq!(format_speed(2 * 1024 * 1024 * 1024), "2.0 GB/s");
    }
}
