use crate::aria2::{Aria2File, DownloadOptions, MagnetInfo, TorrentInfo};
use crate::{AppState, Error, Result};
use base64::Engine;
use tauri::State;

#[tauri::command]
pub async fn add_torrent_file(
    state: State<'_, AppState>,
    file_path: String,
    options: Option<DownloadOptions>,
) -> Result<String> {
    let client = state.get_client().await?;

    // Read and encode torrent file
    let torrent_data = std::fs::read(&file_path)?;
    let torrent_base64 = base64::engine::general_purpose::STANDARD.encode(&torrent_data);

    let opts = options.unwrap_or_default();
    let gid = client.add_torrent(&torrent_base64, opts).await?;

    log::info!("Added torrent from file: {} with GID: {}", file_path, gid);
    Ok(gid)
}

#[tauri::command]
pub async fn add_magnet(
    state: State<'_, AppState>,
    magnet_uri: String,
    options: Option<DownloadOptions>,
) -> Result<String> {
    let client = state.get_client().await?;
    let opts = options.unwrap_or_default();

    let gid = client.add_uri(vec![magnet_uri.clone()], opts).await?;
    log::info!("Added magnet link with GID: {}", gid);

    Ok(gid)
}

#[tauri::command]
pub async fn get_torrent_files(
    state: State<'_, AppState>,
    gid: String,
) -> Result<Vec<Aria2File>> {
    let client = state.get_client().await?;
    client.get_files(&gid).await
}

#[tauri::command]
pub async fn select_torrent_files(
    state: State<'_, AppState>,
    gid: String,
    file_indices: Vec<u32>,
) -> Result<()> {
    let client = state.get_client().await?;

    // Convert indices to comma-separated string (1-indexed for aria2)
    let select_file = file_indices
        .iter()
        .map(|i| (i + 1).to_string())
        .collect::<Vec<_>>()
        .join(",");

    let options = DownloadOptions {
        select_file: Some(select_file),
        ..Default::default()
    };

    client.change_option(&gid, options).await?;
    log::info!("Selected files {:?} for torrent {}", file_indices, gid);

    Ok(())
}

#[tauri::command]
pub fn parse_torrent_file(file_path: String) -> Result<TorrentInfo> {
    use std::io::Read;

    let mut file = std::fs::File::open(&file_path)?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)?;

    // Parse bencode (simplified - in production use a proper bencode parser)
    // For now, return basic info
    let name = std::path::Path::new(&file_path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    // Calculate info hash (simplified)
    let info_hash = {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        buffer.hash(&mut hasher);
        format!("{:016x}", hasher.finish())
    };

    Ok(TorrentInfo {
        name,
        info_hash,
        total_size: buffer.len() as u64 * 100, // Placeholder
        files: vec![],
        comment: None,
        creation_date: None,
        announce_list: vec![],
    })
}

#[tauri::command]
pub fn parse_magnet_uri(magnet_uri: String) -> Result<MagnetInfo> {
    // Parse magnet URI
    if !magnet_uri.starts_with("magnet:?") {
        return Err(Error::InvalidInput("Invalid magnet URI".into()));
    }

    let query = &magnet_uri[8..];
    let params: std::collections::HashMap<String, String> = query
        .split('&')
        .filter_map(|pair| {
            let mut parts = pair.splitn(2, '=');
            Some((parts.next()?.to_string(), parts.next()?.to_string()))
        })
        .collect();

    // Extract info hash
    let info_hash = params
        .get("xt")
        .and_then(|xt| xt.strip_prefix("urn:btih:"))
        .map(String::from)
        .ok_or_else(|| Error::InvalidInput("Missing info hash in magnet URI".into()))?;

    // Extract display name
    let name = params.get("dn").map(|s| urlencoding::decode(s).unwrap_or_default().to_string());

    // Extract trackers
    let trackers: Vec<String> = params
        .iter()
        .filter(|(k, _)| *k == "tr")
        .map(|(_, v)| urlencoding::decode(v).unwrap_or_default().to_string())
        .collect();

    Ok(MagnetInfo {
        name,
        info_hash,
        trackers,
    })
}

#[tauri::command]
pub async fn get_peers(state: State<'_, AppState>, gid: String) -> Result<Vec<serde_json::Value>> {
    let client = state.get_client().await?;
    client.get_peers(&gid).await
}
