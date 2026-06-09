//! System tray: icon, context menu, and the speed popup window.
//!
//! Known platform gap vs the Electron version: on Linux (libappindicator)
//! tray click events are not delivered at all, so the popup cannot be
//! toggled there — left click opens the context menu instead. The popup
//! works on macOS and Windows.

use crate::AppState;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl};

const POPUP_WIDTH: f64 = 320.0;
const POPUP_HEIGHT: f64 = 500.0;
const POPUP_MARGIN: f64 = 8.0;

pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open-app", "Open Gosh-Fetch", true, None::<&str>)?;
    let add_url = MenuItem::with_id(app, "add-url", "Add URL...", true, None::<&str>)?;
    let pause_all = MenuItem::with_id(app, "pause-all", "Pause All", true, None::<&str>)?;
    let resume_all = MenuItem::with_id(app, "resume-all", "Resume All", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "open-settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open,
            &add_url,
            &PredefinedMenuItem::separator(app)?,
            &pause_all,
            &resume_all,
            &PredefinedMenuItem::separator(app)?,
            &settings,
            &quit,
        ],
    )?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().cloned().expect("app icon missing"))
        .tooltip("Gosh-Fetch")
        .menu(&menu)
        .on_menu_event(|app, event| handle_tray_action(app, event.id.as_ref()))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                rect,
                ..
            } = event
            {
                toggle_tray_popup(tray.app_handle(), rect);
            }
        });

    // On Linux click events never fire (libappindicator is menu-only), so the
    // menu must open on left click. On macOS/Windows left click toggles the
    // popup and right click opens the menu.
    builder = builder.show_menu_on_left_click(cfg!(target_os = "linux"));

    builder.build(app)?;
    Ok(())
}

fn handle_tray_action(app: &AppHandle, action: &str) {
    match action {
        "open-app" => {
            show_main_window(app);
            hide_popup(app);
        }
        "add-url" => {
            show_main_window(app);
            let _ = app.emit("navigate", "/");
            let _ = app.emit("open-add-modal", serde_json::json!({}));
            hide_popup(app);
        }
        "pause-all" => {
            let state = app.state::<AppState>().inner().clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(adapter) = state.get_adapter().await {
                    adapter.pause_all().await;
                }
            });
        }
        "resume-all" => {
            let state = app.state::<AppState>().inner().clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(adapter) = state.get_adapter().await {
                    adapter.resume_all().await;
                }
            });
        }
        "open-settings" => {
            show_main_window(app);
            let _ = app.emit("navigate", "/settings");
            hide_popup(app);
        }
        "quit" => {
            let state = app.state::<AppState>();
            state.set_quitting(true);
            app.exit(0);
        }
        _ => {}
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn hide_popup(app: &AppHandle) {
    if let Some(popup) = app.get_webview_window("tray-popup") {
        let _ = popup.hide();
    }
}

/// Toggle the tray popup window, positioning it adjacent to the tray icon
/// on the nearest screen edge, clamped to the monitor work area.
fn toggle_tray_popup(app: &AppHandle, rect: tauri::Rect) {
    let popup = match app.get_webview_window("tray-popup") {
        Some(w) => w,
        None => match create_tray_popup(app) {
            Ok(w) => w,
            Err(e) => {
                log::warn!("Failed to create tray popup: {}", e);
                return;
            }
        },
    };

    if popup.is_visible().unwrap_or(false) {
        let _ = popup.hide();
        return;
    }

    if let Some(pos) = compute_popup_position(app, &rect) {
        let _ = popup.set_position(pos);
    }
    let _ = popup.show();
    let _ = popup.set_focus();
}

fn create_tray_popup(app: &AppHandle) -> tauri::Result<tauri::WebviewWindow> {
    let popup = tauri::WebviewWindowBuilder::new(
        app,
        "tray-popup",
        WebviewUrl::App("index.html#/tray".into()),
    )
    .title("Gosh-Fetch")
    .inner_size(POPUP_WIDTH, POPUP_HEIGHT)
    .decorations(false)
    .resizable(false)
    .skip_taskbar(true)
    .always_on_top(true)
    .visible(false)
    .build()?;

    // Hide when it loses focus, like the Electron popup did
    let handle = popup.clone();
    popup.on_window_event(move |event| {
        if let tauri::WindowEvent::Focused(false) = event {
            let _ = handle.hide();
        }
    });

    Ok(popup)
}

fn compute_popup_position(app: &AppHandle, rect: &tauri::Rect) -> Option<tauri::Position> {
    let tray_pos = match rect.position {
        tauri::Position::Physical(p) => (p.x as f64, p.y as f64),
        tauri::Position::Logical(p) => (p.x, p.y),
    };
    let tray_size = match rect.size {
        tauri::Size::Physical(s) => (s.width as f64, s.height as f64),
        tauri::Size::Logical(s) => (s.width, s.height),
    };

    let tray_center = (
        tray_pos.0 + tray_size.0 / 2.0,
        tray_pos.1 + tray_size.1 / 2.0,
    );

    let monitor = app
        .monitor_from_point(tray_center.0, tray_center.1)
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten())?;

    let scale = monitor.scale_factor();
    let bounds: LogicalPosition<f64> = monitor.position().to_logical(scale);
    let size: LogicalSize<f64> = monitor.size().to_logical(scale);
    // Tray rect comes in physical pixels; convert to logical for positioning
    let (tray_x, tray_y) = match rect.position {
        tauri::Position::Physical(p) => (p.x as f64 / scale, p.y as f64 / scale),
        tauri::Position::Logical(p) => (p.x, p.y),
    };
    let (tray_w, tray_h) = match rect.size {
        tauri::Size::Physical(s) => (s.width as f64 / scale, s.height as f64 / scale),
        tauri::Size::Logical(s) => (s.width, s.height),
    };

    // Distance of tray icon to each monitor edge → nearest edge decides
    // which side the popup opens on (taskbar position heuristic).
    let dist_top = (tray_y - bounds.y).abs();
    let dist_bottom = (bounds.y + size.height - (tray_y + tray_h)).abs();
    let dist_left = (tray_x - bounds.x).abs();
    let dist_right = (bounds.x + size.width - (tray_x + tray_w)).abs();

    let mut x = tray_x + tray_w / 2.0 - POPUP_WIDTH / 2.0;
    let mut y = tray_y + tray_h / 2.0 - POPUP_HEIGHT / 2.0;

    let min_dist = dist_top.min(dist_bottom).min(dist_left).min(dist_right);
    if min_dist == dist_top {
        y = tray_y + tray_h + POPUP_MARGIN;
    } else if min_dist == dist_bottom {
        y = tray_y - POPUP_HEIGHT - POPUP_MARGIN;
    } else if min_dist == dist_left {
        x = tray_x + tray_w + POPUP_MARGIN;
    } else {
        x = tray_x - POPUP_WIDTH - POPUP_MARGIN;
    }

    let clamp = |v: f64, min: f64, max: f64| if max < min { min } else { v.max(min).min(max) };
    x = clamp(
        x,
        bounds.x + POPUP_MARGIN,
        bounds.x + size.width - POPUP_WIDTH - POPUP_MARGIN,
    );
    y = clamp(
        y,
        bounds.y + POPUP_MARGIN,
        bounds.y + size.height - POPUP_HEIGHT - POPUP_MARGIN,
    );

    Some(tauri::Position::Logical(LogicalPosition::new(x, y)))
}
