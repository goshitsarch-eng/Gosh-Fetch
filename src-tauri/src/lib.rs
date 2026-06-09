pub mod commands;
pub mod constants;
pub mod db;
pub mod engine_adapter;
pub mod error;
pub mod rpc_server;
pub mod state;
pub mod types;
pub mod utils;

pub use error::{Error, Result};
pub use state::AppState;
pub use types::*;
pub use utils::TrackerUpdater;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
