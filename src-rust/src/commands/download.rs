use crate::types::{Download, DownloadOptions, GlobalStat};
use crate::{AppState, Result};

pub async fn add_download(
    state: &AppState,
    url: String,
    options: Option<DownloadOptions>,
) -> Result<String> {
    let adapter = state.get_adapter().await?;
    let gid = adapter.add_download(url, options).await?;
    log::info!("Added download with GID: {}", gid);
    Ok(gid)
}

pub async fn add_urls(
    state: &AppState,
    urls: Vec<String>,
    options: Option<DownloadOptions>,
) -> Result<Vec<String>> {
    let adapter = state.get_adapter().await?;
    let gids = adapter.add_urls(urls, options).await?;
    Ok(gids)
}

pub async fn pause_download(state: &AppState, gid: String) -> Result<()> {
    let adapter = state.get_adapter().await?;
    adapter.pause(&gid).await?;
    log::info!("Paused download: {}", gid);
    Ok(())
}

pub async fn pause_all(state: &AppState) -> Result<()> {
    let adapter = state.get_adapter().await?;
    adapter.pause_all().await?;
    log::info!("Paused all downloads");
    Ok(())
}

pub async fn resume_download(state: &AppState, gid: String) -> Result<()> {
    let adapter = state.get_adapter().await?;
    adapter.resume(&gid).await?;
    log::info!("Resumed download: {}", gid);
    Ok(())
}

pub async fn resume_all(state: &AppState) -> Result<()> {
    let adapter = state.get_adapter().await?;
    adapter.resume_all().await?;
    log::info!("Resumed all downloads");
    Ok(())
}

pub async fn remove_download(
    state: &AppState,
    gid: String,
    delete_files: bool,
) -> Result<()> {
    let adapter = state.get_adapter().await?;
    adapter.remove(&gid, delete_files).await?;
    log::info!("Removed download: {} (delete_files: {})", gid, delete_files);
    Ok(())
}

pub async fn get_download_status(state: &AppState, gid: String) -> Result<Download> {
    let adapter = state.get_adapter().await?;
    adapter
        .get_status(&gid)
        .ok_or_else(|| crate::Error::NotFound(format!("Download not found: {}", gid)))
}

pub async fn get_all_downloads(state: &AppState) -> Result<Vec<Download>> {
    let adapter = state.get_adapter().await?;
    Ok(adapter.get_all())
}

pub async fn get_active_downloads(state: &AppState) -> Result<Vec<Download>> {
    let adapter = state.get_adapter().await?;
    Ok(adapter.get_active())
}

pub async fn get_global_stats(state: &AppState) -> Result<GlobalStat> {
    let adapter = state.get_adapter().await?;
    Ok(adapter.get_global_stats())
}

pub async fn set_speed_limit(
    state: &AppState,
    download_limit: Option<u64>,
    upload_limit: Option<u64>,
) -> Result<()> {
    let adapter = state.get_adapter().await?;
    adapter.set_speed_limit(download_limit, upload_limit)?;
    Ok(())
}
