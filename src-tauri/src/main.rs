// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use gosh_fetch::{commands, tray, AppState};
use tauri::Manager;

fn main() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::new())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Setup system tray
            tray::setup_tray(&app_handle)?;

            // Initialize app state (database, aria2)
            let state = app.state::<AppState>();
            let state_clone = (*state).clone();
            let handle = app_handle.clone();

            tauri::async_runtime::spawn(async move {
                if let Err(e) = state_clone.initialize(&handle).await {
                    log::error!("Failed to initialize app: {}", e);
                }
            });

            // Handle window close event - minimize to tray or quit based on setting
            let handle_for_close = app_handle.clone();
            if let Some(main_window) = app.get_webview_window("main") {
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        // Check the close_to_tray setting from AppState
                        let close_to_tray = handle_for_close
                            .try_state::<AppState>()
                            .map(|state| state.get_close_to_tray())
                            .unwrap_or(true);

                        if close_to_tray {
                            // Prevent the window from being closed, hide it instead
                            api.prevent_close();
                            if let Some(window) = handle_for_close.get_webview_window("main") {
                                let _ = window.hide();
                            }
                        }
                        // If close_to_tray is false, allow the close to proceed normally
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Download commands
            commands::add_download,
            commands::add_urls,
            commands::pause_download,
            commands::pause_all,
            commands::resume_download,
            commands::resume_all,
            commands::remove_download,
            commands::get_download_status,
            commands::get_all_downloads,
            commands::get_active_downloads,
            commands::get_global_stats,
            commands::set_speed_limit,
            // Torrent commands
            commands::add_torrent_file,
            commands::add_magnet,
            commands::get_torrent_files,
            commands::select_torrent_files,
            commands::parse_torrent_file,
            commands::parse_magnet_uri,
            commands::get_peers,
            // Settings commands
            commands::get_settings,
            commands::update_settings,
            commands::set_close_to_tray,
            commands::set_user_agent,
            commands::get_tracker_list,
            commands::update_tracker_list,
            commands::apply_settings_to_aria2,
            commands::get_user_agent_presets,
            // System commands
            commands::get_aria2_version,
            commands::restart_aria2,
            commands::show_window,
            commands::hide_window,
            commands::quit_app,
            commands::open_download_folder,
            commands::open_file_location,
            commands::get_default_download_path,
            commands::get_app_version,
            commands::get_app_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
