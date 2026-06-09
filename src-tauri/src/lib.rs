pub mod api;
pub mod commands;
pub mod constants;
pub mod db;
pub mod engine_adapter;
pub mod error;
pub mod events;
pub mod state;
pub mod tray;
pub mod types;
pub mod utils;
pub mod validation;

pub use error::{Error, Result};
pub use state::AppState;
pub use types::*;
pub use utils::TrackerUpdater;

use state::OpenRequest;
use tauri::{AppHandle, Emitter, Manager};

/// Scan CLI/second-instance arguments for magnet URIs and .torrent paths.
fn open_requests_from_args<I: IntoIterator<Item = String>>(args: I) -> Vec<OpenRequest> {
    args.into_iter()
        .filter_map(|arg| {
            if arg.starts_with("magnet:") {
                Some(OpenRequest::Magnet { uri: arg })
            } else if arg.to_lowercase().ends_with(".torrent") {
                Some(OpenRequest::TorrentFile { path: arg })
            } else {
                None
            }
        })
        .collect()
}

fn deliver_requests(app: &AppHandle, requests: Vec<OpenRequest>) {
    let state = app.state::<AppState>();
    for request in requests {
        state.deliver_open_request(app, request);
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Single instance must be the first plugin registered
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            show_main_window(app);
            deliver_requests(app, open_requests_from_args(argv.into_iter().skip(1)));
        }));
    }

    builder = builder
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init());

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_deep_link::init())
            .plugin(tauri_plugin_window_state::Builder::new().build())
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init())
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                None,
            ));
    }

    builder
        .manage(AppState::new())
        .setup(|app| {
            let handle = app.handle().clone();

            // Initialize database + download engine in the background;
            // commands return EngineNotInitialized until this completes.
            let state = app.state::<AppState>().inner().clone();
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| {
                    // Fallback reproducing the legacy sidecar's resolution
                    dirs::data_dir()
                        .expect("Could not determine platform data directory")
                        .join("com.gosh.fetch")
                });
            log::info!("App data dir: {} (exists: {})", data_dir.display(), data_dir.exists());
            let init_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                match state.initialize(data_dir, init_handle.clone()).await {
                    Ok(()) => {
                        let _ = init_handle.emit(
                            "engine-status",
                            serde_json::json!({ "connected": true, "restarting": false }),
                        );
                    }
                    Err(e) => {
                        log::error!("Engine initialization failed: {}", e);
                        let _ = init_handle.emit(
                            "engine-status",
                            serde_json::json!({ "connected": false, "restarting": false }),
                        );
                    }
                }
            });

            tray::create_tray(&handle)?;
            events::spawn_stats_emitter(handle.clone());

            // magnet: deep links (registered while the app runs)
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let deep_link_handle = handle.clone();
                app.deep_link().on_open_url(move |event| {
                    let requests: Vec<OpenRequest> = event
                        .urls()
                        .iter()
                        .map(|u| u.to_string())
                        .filter(|u| u.starts_with("magnet:"))
                        .map(|uri| OpenRequest::Magnet { uri })
                        .collect();
                    if !requests.is_empty() {
                        show_main_window(&deep_link_handle);
                        deliver_requests(&deep_link_handle, requests);
                    }
                });
            }

            // Cold-start CLI args (e.g. double-clicked .torrent on Win/Linux)
            deliver_requests(&handle, open_requests_from_args(std::env::args().skip(1)));

            // Show the window once setup is done; the frontend may also call
            // show() itself when mounted, this is a fallback.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Close-to-tray: hide the main window instead of closing it
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let state = window.app_handle().state::<AppState>();
                    if state.get_close_to_tray() && !state.is_quitting() {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Downloads
            api::add_download,
            api::add_urls,
            api::pause_download,
            api::pause_all,
            api::resume_download,
            api::resume_all,
            api::cancel_all,
            api::remove_download,
            api::get_download_status,
            api::get_all_downloads,
            api::get_active_downloads,
            api::get_global_stats,
            api::set_speed_limit,
            api::set_priority,
            api::get_schedule_rules,
            api::set_schedule_rules,
            // Torrents
            api::add_torrent_file,
            api::add_magnet,
            api::get_torrent_files,
            api::select_torrent_files,
            api::parse_torrent_file,
            api::parse_magnet_uri,
            api::get_peers,
            // Recursive mirroring
            api::discover_recursive,
            api::add_recursive,
            api::list_recursive_jobs,
            api::get_recursive_job,
            api::cancel_recursive_job,
            api::remove_recursive_job,
            // Settings
            api::get_settings,
            api::update_settings,
            api::set_close_to_tray,
            api::set_user_agent,
            api::get_tracker_list,
            api::update_tracker_list,
            api::apply_settings_to_engine,
            api::get_user_agent_presets,
            // System
            api::get_engine_version,
            api::open_download_folder,
            api::open_file_location,
            api::get_default_download_path,
            api::get_app_version,
            api::get_app_info,
            api::get_disk_space,
            api::perform_system_action,
            api::read_settings_json,
            api::get_pending_open_requests,
            // Database
            api::db_get_completed_history,
            api::db_save_download,
            api::db_remove_download,
            api::db_clear_history,
            api::db_get_settings,
            api::db_save_settings,
            api::db_load_incomplete,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            // macOS: .torrent files / magnet links opened via Finder or
            // protocol handler arrive as Opened events
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Opened { urls } => {
                let requests: Vec<OpenRequest> = urls
                    .iter()
                    .filter_map(|u| {
                        let s = u.to_string();
                        if s.starts_with("magnet:") {
                            Some(OpenRequest::Magnet { uri: s })
                        } else if u.scheme() == "file" {
                            u.to_file_path().ok().and_then(|p| {
                                let path = p.to_string_lossy().to_string();
                                if path.to_lowercase().ends_with(".torrent") {
                                    Some(OpenRequest::TorrentFile { path })
                                } else {
                                    None
                                }
                            })
                        } else {
                            None
                        }
                    })
                    .collect();
                if !requests.is_empty() {
                    show_main_window(app);
                    deliver_requests(app, requests);
                }
            }
            tauri::RunEvent::Exit => {
                // Persist final history snapshot and stop the engine cleanly
                let state = app.state::<AppState>().inner().clone();
                tauri::async_runtime::block_on(async move {
                    if let Err(e) = state.shutdown().await {
                        log::error!("Failed to shut down app state cleanly: {}", e);
                    }
                });
            }
            _ => {}
        });
}
