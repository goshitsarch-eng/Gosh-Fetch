use gosh_fetch_engine::rpc_server;
use gosh_fetch_engine::AppState;
use tokio::sync::broadcast;

#[tokio::main]
async fn main() {
    env_logger::init();

    let data_dir = dirs::data_dir()
        .or_else(|| {
            dirs::home_dir().map(|h| {
                if cfg!(target_os = "macos") {
                    h.join("Library/Application Support")
                } else if cfg!(target_os = "windows") {
                    h.join("AppData/Roaming")
                } else {
                    h.join(".local/share")
                }
            })
        })
        .expect("Could not determine platform data directory")
        .join("com.gosh.fetch");

    let (event_tx, event_rx) = broadcast::channel(256);

    let state = AppState::new();
    if let Err(e) = state.initialize(data_dir, event_tx).await {
        log::error!("Failed to initialize app: {}", e);
        eprintln!("Failed to initialize: {}", e);
        std::process::exit(1);
    }

    log::info!("gosh-fetch-engine started, waiting for RPC commands on stdin");

    rpc_server::run_rpc_server(state, event_rx).await;
}
