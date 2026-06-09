//! Recursive HTTP directory mirroring commands (gosh-dl 0.5.0+).

use crate::types::DownloadOptions;
use crate::validation::validate_http_url;
use crate::{AppState, Error, Result};
use gosh_dl::{RecursiveManifest, RecursiveOptions, TrackedRecursiveJob};

fn parse_job_id(id: &str) -> Result<uuid::Uuid> {
    uuid::Uuid::parse_str(id)
        .map_err(|_| Error::InvalidInput(format!("Invalid recursive job id: {}", id)))
}

/// Dry-run discovery: returns the manifest of files that a mirror job would download.
pub async fn discover_recursive(
    state: &AppState,
    url: String,
    options: Option<DownloadOptions>,
    recursive: Option<RecursiveOptions>,
) -> Result<RecursiveManifest> {
    validate_http_url(&url)?;
    let adapter = state.get_adapter().await?;
    Ok(adapter
        .discover_recursive(&url, options, recursive.unwrap_or_default())
        .await?)
}

/// Start a mirror job. Returns `{ job, status }` for the tracked record.
pub async fn add_recursive(
    state: &AppState,
    url: String,
    options: Option<DownloadOptions>,
    recursive: Option<RecursiveOptions>,
) -> Result<serde_json::Value> {
    validate_http_url(&url)?;
    let adapter = state.get_adapter().await?;
    let job = adapter
        .add_recursive(&url, options, recursive.unwrap_or_default())
        .await?;
    log::info!(
        "Started recursive mirror job {} for {} ({} files)",
        job.id,
        job.root_url,
        job.child_ids.len()
    );
    let engine = state.get_engine().await?;
    let status = engine.recursive_job_status(&job.as_job());
    Ok(serde_json::json!({ "job": job, "status": status }))
}

/// List all tracked mirror jobs, each paired with its aggregate status.
pub async fn list_recursive_jobs(state: &AppState) -> Result<Vec<serde_json::Value>> {
    let engine = state.get_engine().await?;
    Ok(engine
        .list_recursive_jobs()
        .into_iter()
        .map(|job: TrackedRecursiveJob| {
            let status = engine.recursive_job_status(&job.as_job());
            serde_json::json!({ "job": job, "status": status })
        })
        .collect())
}

/// Get a single mirror job with its aggregate status.
pub async fn get_recursive_job(state: &AppState, id: String) -> Result<serde_json::Value> {
    let engine = state.get_engine().await?;
    let job_id = parse_job_id(&id)?;
    let job = engine
        .recursive_job(job_id)
        .ok_or_else(|| Error::NotFound(format!("Recursive job not found: {}", id)))?;
    let status = engine.recursive_job_status(&job.as_job());
    Ok(serde_json::json!({ "job": job, "status": status }))
}

/// Cancel all child downloads of a mirror job (keeps the job record).
pub async fn cancel_recursive_job(
    state: &AppState,
    id: String,
    delete_files: bool,
) -> Result<()> {
    let engine = state.get_engine().await?;
    engine
        .cancel_recursive_job(parse_job_id(&id)?, delete_files)
        .await?;
    log::info!("Cancelled recursive job {} (delete_files: {})", id, delete_files);
    Ok(())
}

/// Remove a mirror job record and cancel any remaining children.
pub async fn remove_recursive_job(
    state: &AppState,
    id: String,
    delete_files: bool,
) -> Result<()> {
    let engine = state.get_engine().await?;
    engine
        .remove_recursive_job(parse_job_id(&id)?, delete_files)
        .await?;
    log::info!("Removed recursive job {} (delete_files: {})", id, delete_files);
    Ok(())
}
