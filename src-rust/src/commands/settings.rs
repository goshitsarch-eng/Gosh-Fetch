use crate::db::Settings;
use crate::utils::TrackerUpdater;
use crate::{AppState, Result};
use std::path::PathBuf;

pub async fn get_settings(state: &AppState) -> Result<Settings> {
    let db = state.get_db().await?;
    db.get_settings()
}

pub async fn update_settings(
    state: &AppState,
    settings: Settings,
) -> Result<()> {
    let db = state.get_db().await?;
    db.save_settings(&settings)
}

pub fn set_close_to_tray(state: &AppState, value: bool) {
    state.set_close_to_tray(value);
}

pub async fn set_user_agent(state: &AppState, user_agent: String) -> Result<()> {
    let engine = state.get_engine().await?;
    let mut config = engine.get_config();
    config.user_agent = user_agent;
    engine.set_config(config)?;
    Ok(())
}

pub async fn get_tracker_list() -> Result<Vec<String>> {
    let mut updater = TrackerUpdater::new();
    updater.fetch_trackers().await
}

pub async fn update_tracker_list(state: &AppState) -> Result<Vec<String>> {
    let mut updater = TrackerUpdater::new();
    let trackers = updater.fetch_trackers().await?;
    let _engine = state.get_engine().await?;
    Ok(trackers)
}

pub async fn apply_settings_to_engine(
    state: &AppState,
    settings: Settings,
) -> Result<()> {
    let engine = state.get_engine().await?;
    let mut config = engine.get_config();

    config.download_dir = PathBuf::from(&settings.download_path);
    config.max_concurrent_downloads = settings.max_concurrent_downloads as usize;
    config.max_connections_per_download = settings.max_connections_per_server as usize;

    if settings.download_speed_limit > 0 {
        config.global_download_limit = Some(settings.download_speed_limit);
    } else {
        config.global_download_limit = None;
    }

    if settings.upload_speed_limit > 0 {
        config.global_upload_limit = Some(settings.upload_speed_limit);
    } else {
        config.global_upload_limit = None;
    }

    config.user_agent = settings.user_agent;
    config.enable_dht = settings.bt_enable_dht;
    config.enable_pex = settings.bt_enable_pex;
    config.enable_lpd = settings.bt_enable_lpd;
    config.max_peers = settings.bt_max_peers as usize;
    config.seed_ratio = settings.bt_seed_ratio;

    engine.set_config(config)?;
    Ok(())
}

pub fn get_user_agent_presets() -> Vec<(String, String)> {
    vec![
        ("gosh-dl".to_string(), "gosh-dl/0.1.0".to_string()),
        ("Chrome (Windows)".to_string(), "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36".to_string()),
        ("Chrome (macOS)".to_string(), "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36".to_string()),
        ("Firefox (Windows)".to_string(), "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0".to_string()),
        ("Firefox (Linux)".to_string(), "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0".to_string()),
        ("Wget".to_string(), "Wget/1.21.4".to_string()),
        ("Curl".to_string(), "curl/8.5.0".to_string()),
    ]
}
