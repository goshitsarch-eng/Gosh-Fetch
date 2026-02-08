use crate::db::Settings;
use crate::types::Download;
use crate::{AppState, Result};

pub async fn db_get_completed_history(state: &AppState) -> Result<Vec<Download>> {
    let db = state.get_db().await?;
    db.get_completed_downloads_async().await
}

pub async fn db_save_download(state: &AppState, download: Download) -> Result<()> {
    let db = state.get_db().await?;
    db.save_download_async(download).await
}

pub async fn db_remove_download(state: &AppState, gid: String) -> Result<()> {
    let db = state.get_db().await?;
    db.remove_download_async(gid).await
}

pub async fn db_clear_history(state: &AppState) -> Result<()> {
    let db = state.get_db().await?;
    db.clear_history_async().await
}

pub async fn db_get_settings(state: &AppState) -> Result<Settings> {
    let db = state.get_db().await?;
    db.get_settings_async().await
}

pub async fn db_save_settings(state: &AppState, settings: Settings) -> Result<()> {
    let db = state.get_db().await?;
    db.save_settings_async(settings).await
}

pub async fn db_load_incomplete(state: &AppState) -> Result<Vec<Download>> {
    let db = state.get_db().await?;
    db.get_incomplete_downloads_async().await
}
