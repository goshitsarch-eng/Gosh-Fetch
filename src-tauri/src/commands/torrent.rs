use crate::engine_adapter::{PeerInfo, TorrentFileInfo};
use crate::types::{DownloadFile, DownloadOptions, MagnetInfo, TorrentFile, TorrentInfo};
use crate::{AppState, Error, Result};
use tauri::State;

#[tauri::command]
pub async fn add_torrent_file(
    state: State<'_, AppState>,
    file_path: String,
    options: Option<DownloadOptions>,
) -> Result<String> {
    let adapter = state.get_adapter().await?;

    // Read torrent file
    let torrent_data = std::fs::read(&file_path)?;

    let gid = adapter.add_torrent(&torrent_data, options).await?;
    log::info!("Added torrent from file: {} with GID: {}", file_path, gid);

    Ok(gid)
}

#[tauri::command]
pub async fn add_magnet(
    state: State<'_, AppState>,
    magnet_uri: String,
    options: Option<DownloadOptions>,
) -> Result<String> {
    let adapter = state.get_adapter().await?;

    let gid = adapter.add_magnet(&magnet_uri, options).await?;
    log::info!("Added magnet link with GID: {}", gid);

    Ok(gid)
}

#[tauri::command]
pub async fn get_torrent_files(
    state: State<'_, AppState>,
    gid: String,
) -> Result<Vec<DownloadFile>> {
    let adapter = state.get_adapter().await?;

    let files: Vec<TorrentFileInfo> = adapter.get_torrent_files(&gid).unwrap_or_default();

    // Convert TorrentFileInfo to DownloadFile for frontend compatibility
    Ok(files
        .into_iter()
        .enumerate()
        .map(|(i, f)| DownloadFile {
            index: i.to_string(),
            path: f.path.to_string_lossy().to_string(),
            length: f.size.to_string(),
            completed_length: f.completed.to_string(),
            selected: if f.selected { "true" } else { "false" }.to_string(),
            uris: vec![],
        })
        .collect())
}

#[tauri::command]
pub async fn select_torrent_files(
    _state: State<'_, AppState>,
    _gid: String,
    _file_indices: Vec<u32>,
) -> Result<()> {
    // File selection must be done when adding the torrent via DownloadOptions.select_file.
    // Runtime file selection is no longer supported.
    Err(Error::InvalidInput(
        "File selection must be specified when adding the torrent. Use the select_file option in DownloadOptions.".to_string()
    ))
}

#[tauri::command]
pub fn parse_torrent_file(file_path: String) -> Result<TorrentInfo> {
    // Use gosh-dl's metainfo parser
    let torrent_data = std::fs::read(&file_path)?;

    match gosh_dl::torrent::Metainfo::parse(&torrent_data) {
        Ok(metainfo) => {
            let files: Vec<TorrentFile> = metainfo
                .info
                .files
                .iter()
                .enumerate()
                .map(|(i, f)| TorrentFile {
                    index: i,
                    path: f.path.to_string_lossy().to_string(),
                    length: f.length,
                })
                .collect();

            Ok(TorrentInfo {
                name: metainfo.info.name.clone(),
                info_hash: hex::encode(metainfo.info_hash),
                total_size: metainfo.info.total_size,
                files,
                comment: metainfo.comment.clone(),
                creation_date: metainfo.creation_date,
                announce_list: metainfo.announce_list.iter().flatten().cloned().collect(),
            })
        }
        Err(e) => Err(Error::InvalidInput(format!("Failed to parse torrent: {}", e))),
    }
}

#[tauri::command]
pub fn parse_magnet_uri(magnet_uri: String) -> Result<MagnetInfo> {
    // Use gosh-dl's magnet parser
    match gosh_dl::torrent::MagnetUri::parse(&magnet_uri) {
        Ok(magnet) => Ok(MagnetInfo {
            name: magnet.display_name.clone(),
            info_hash: hex::encode(magnet.info_hash),
            trackers: magnet.trackers.clone(),
        }),
        Err(e) => Err(Error::InvalidInput(format!("Failed to parse magnet URI: {}", e))),
    }
}

#[tauri::command]
pub async fn get_peers(state: State<'_, AppState>, gid: String) -> Result<Vec<serde_json::Value>> {
    let adapter = state.get_adapter().await?;

    let peers: Vec<PeerInfo> = adapter.get_peers(&gid).unwrap_or_default();

    // Convert to JSON values for frontend compatibility
    Ok(peers
        .into_iter()
        .map(|p| {
            serde_json::json!({
                "ip": p.ip,
                "port": p.port,
                "client": p.client,
                "downloadSpeed": p.download_speed,
                "uploadSpeed": p.upload_speed,
            })
        })
        .collect())
}
