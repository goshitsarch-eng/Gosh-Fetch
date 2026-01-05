use crate::{Error, Result};
use chrono::{DateTime, Utc};

const TRACKER_LIST_URL: &str =
    "https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt";

pub struct TrackerUpdater {
    last_update: Option<DateTime<Utc>>,
    trackers: Vec<String>,
}

impl TrackerUpdater {
    pub fn new() -> Self {
        Self {
            last_update: None,
            trackers: Vec::new(),
        }
    }

    pub fn needs_update(&self) -> bool {
        match self.last_update {
            None => true,
            Some(last) => {
                let now = Utc::now();
                let duration = now.signed_duration_since(last);
                duration.num_hours() >= 24
            }
        }
    }

    pub async fn fetch_trackers(&mut self) -> Result<Vec<String>> {
        log::info!("Fetching tracker list from {}", TRACKER_LIST_URL);

        let response = reqwest::get(TRACKER_LIST_URL)
            .await
            .map_err(|e| Error::Network(format!("Failed to fetch trackers: {}", e)))?;

        if !response.status().is_success() {
            return Err(Error::Network(format!(
                "Failed to fetch trackers: HTTP {}",
                response.status()
            )));
        }

        let text = response
            .text()
            .await
            .map_err(|e| Error::Network(format!("Failed to read response: {}", e)))?;

        let trackers: Vec<String> = text
            .lines()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(String::from)
            .collect();

        log::info!("Fetched {} trackers", trackers.len());

        self.trackers = trackers.clone();
        self.last_update = Some(Utc::now());

        Ok(trackers)
    }

    pub fn get_trackers(&self) -> &[String] {
        &self.trackers
    }

    pub fn get_tracker_string(&self) -> String {
        self.trackers.join(",")
    }
}

impl Default for TrackerUpdater {
    fn default() -> Self {
        Self::new()
    }
}
