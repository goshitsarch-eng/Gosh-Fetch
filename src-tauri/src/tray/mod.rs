use crate::AppState;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime,
};

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = create_tray_menu(app)?;

    let _tray = TrayIconBuilder::new()
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
                    if let Ok(client) = state.get_client().await {
                        let _ = client.pause_all().await;
                    }
                }
            });
        }
        "resume_all" => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Some(state) = app.try_state::<AppState>() {
                    if let Ok(client) = state.get_client().await {
                        let _ = client.unpause_all().await;
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
            // Save session and stop aria2 before quitting
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Some(state) = app.try_state::<AppState>() {
                    if let Ok(client) = state.get_client().await {
                        let _ = client.save_session().await;
                    }
                    let _ = state.stop_aria2().await;
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
    // Create a simple 16x16 green icon
    // In production, load from resources
    let size = 16u32;
    let mut rgba = vec![0u8; (size * size * 4) as usize];

    // Draw a simple down arrow / download icon
    for y in 0..size {
        for x in 0..size {
            let idx = ((y * size + x) * 4) as usize;
            // Green color for the icon
            let is_arrow = (y >= 4 && y <= 10 && x >= 6 && x <= 9) // stem
                || (y >= 8 && y <= 12 && x >= 3 && x <= 12 && (y as i32 - 8) >= (x as i32 - 8).abs() - 4); // arrowhead

            if is_arrow {
                rgba[idx] = 35;      // R
                rgba[idx + 1] = 134; // G  (green #238636)
                rgba[idx + 2] = 54;  // B
                rgba[idx + 3] = 255; // A
            } else {
                rgba[idx + 3] = 0; // Transparent
            }
        }
    }

    Ok(Image::new_owned(rgba, size, size))
}

async fn speed_meter_loop(app: AppHandle) {
    loop {
        if let Some(state) = app.try_state::<AppState>() {
            if let Ok(client) = state.get_client().await {
                if let Ok(stats) = client.get_global_stat().await {
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
