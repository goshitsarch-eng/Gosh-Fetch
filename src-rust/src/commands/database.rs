use crate::db::Settings;
use crate::types::Download;
use crate::{AppState, Result};

pub async fn db_get_completed_history(state: &AppState) -> Result<Vec<Download>> {
    let db = state.get_db().await?;
    db.get_completed_downloads()
}

pub async fn db_save_download(state: &AppState, download: Download) -> Result<()> {
    let db = state.get_db().await?;
    db.save_download(&download)
}

pub async fn db_remove_download(state: &AppState, gid: String) -> Result<()> {
    let db = state.get_db().await?;
    db.remove_download(&gid)
}

pub async fn db_clear_history(state: &AppState) -> Result<()> {
    let db = state.get_db().await?;
    db.clear_history()
}

pub async fn db_get_settings(state: &AppState) -> Result<Settings> {
    let db = state.get_db().await?;
    db.get_settings()
}

pub async fn db_save_settings(state: &AppState, settings: Settings) -> Result<()> {
    let db = state.get_db().await?;
    db.save_settings(&settings)
}

pub async fn db_load_incomplete(state: &AppState) -> Result<Vec<Download>> {
    let db = state.get_db().await?;
    db.get_incomplete_downloads()
}
