use crate::AppState;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime,
};

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = create_tray_menu(app)?;

    let _tray = TrayIconBuilder::with_id("main")
        .icon(get_tray_icon(app)?)
        .tooltip("Gosh-Fetch")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            handle_menu_event(app, event.id.as_ref());
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                toggle_window_visibility(app);
            }
        })
        .build(app)?;

    // Start speed meter updater
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        speed_meter_loop(app_handle).await;
    });

    Ok(())
}

fn create_tray_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let show_hide = MenuItem::with_id(app, "show_hide", "Show/Hide Window", true, None::<&str>)?;
    let separator1 = PredefinedMenuItem::separator(app)?;
    let pause_all = MenuItem::with_id(app, "pause_all", "Pause All", true, None::<&str>)?;
    let resume_all = MenuItem::with_id(app, "resume_all", "Resume All", true, None::<&str>)?;
    let separator2 = PredefinedMenuItem::separator(app)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let separator3 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    Menu::with_items(
        app,
        &[
            &show_hide,
            &separator1,
            &pause_all,
            &resume_all,
            &separator2,
            &settings,
            &separator3,
            &quit,
        ],
    )
}

fn handle_menu_event(app: &AppHandle, event_id: &str) {
    match event_id {
        "show_hide" => {
            toggle_window_visibility(app);
        }
        "pause_all" => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Some(state) = app.try_state::<AppState>() {
                    if let Ok(adapter) = state.get_adapter().await {
                        let _ = adapter.pause_all().await;
                    }
                }
            });
        }
        "resume_all" => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Some(state) = app.try_state::<AppState>() {
                    if let Ok(adapter) = state.get_adapter().await {
                        let _ = adapter.resume_all().await;
                    }
                }
            });
        }
        "settings" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
                // Emit event to navigate to settings
                let _ = window.emit("navigate", "settings");
            }
        }
        "quit" => {
            // Shutdown download engine before quitting
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Some(state) = app.try_state::<AppState>() {
                    let _ = state.shutdown().await;
                }
                app.exit(0);
            });
        }
        _ => {}
    }
}

fn toggle_window_visibility(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn get_tray_icon(_app: &AppHandle) -> tauri::Result<Image<'static>> {
    // Load tray icon from embedded bytes
    // Using 22x22 for standard displays, Tauri will handle scaling
    let icon_bytes = include_bytes!("../../icons/tray-icon.png");
    Image::from_bytes(icon_bytes).map_err(|e| tauri::Error::Anyhow(e.into()))
}

async fn speed_meter_loop(app: AppHandle) {
    loop {
        if let Some(state) = app.try_state::<AppState>() {
            if let Ok(adapter) = state.get_adapter().await {
                let stats = adapter.get_global_stats();
                let download_speed: u64 = stats.download_speed.parse().unwrap_or(0);
                let upload_speed: u64 = stats.upload_speed.parse().unwrap_or(0);
                let num_active: u32 = stats.num_active.parse().unwrap_or(0);

                let tooltip = format!(
                    "Gosh-Fetch\n↓ {}  ↑ {}\n{} active",
                    format_speed(download_speed),
                    format_speed(upload_speed),
                    num_active
                );

                // Update tray tooltip
                if let Some(tray) = app.tray_by_id("main") {
                    let _ = tray.set_tooltip(Some(&tooltip));
                }

                // Emit stats to frontend
                let _ = app.emit(
                    "global-stats",
                    serde_json::json!({
                        "downloadSpeed": download_speed,
                        "uploadSpeed": upload_speed,
                        "numActive": num_active,
                        "numWaiting": stats.num_waiting.parse::<u32>().unwrap_or(0),
                        "numStopped": stats.num_stopped.parse::<u32>().unwrap_or(0),
                    }),
                );
            }
        }

        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    }
}

fn format_speed(bytes_per_sec: u64) -> String {
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
