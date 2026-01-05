use crate::aria2::types::*;
use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct Aria2Client {
    stream: Arc<Mutex<TcpStream>>,
    secret: String,
    request_id: Arc<AtomicU64>,
}

#[derive(Debug, Serialize)]
struct JsonRpcRequest {
    jsonrpc: &'static str,
    id: String,
    method: String,
    params: Vec<Value>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcResponse {
    #[allow(dead_code)]
    jsonrpc: String,
    #[allow(dead_code)]
    id: String,
    result: Option<Value>,
    error: Option<JsonRpcError>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcError {
    code: i64,
    message: String,
}

impl Aria2Client {
    pub async fn connect(port: u16, secret: &str) -> Result<Self> {
        let addr = format!("127.0.0.1:{}", port);
        let stream = TcpStream::connect(&addr).await.map_err(|e| {
            Error::Aria2Connection(format!("Failed to connect to aria2 at {}: {}", addr, e))
        })?;

        Ok(Self {
            stream: Arc::new(Mutex::new(stream)),
            secret: format!("token:{}", secret),
            request_id: Arc::new(AtomicU64::new(1)),
        })
    }

    async fn call<T: for<'de> Deserialize<'de>>(
        &self,
        method: &str,
        params: Vec<Value>,
    ) -> Result<T> {
        let id = self.request_id.fetch_add(1, Ordering::SeqCst);

        // Prepend secret token to params
        let mut full_params = vec![json!(self.secret)];
        full_params.extend(params);

        let request = JsonRpcRequest {
            jsonrpc: "2.0",
            id: id.to_string(),
            method: format!("aria2.{}", method),
            params: full_params,
        };

        let request_json = serde_json::to_string(&request)?;
        let http_request = format!(
            "POST /jsonrpc HTTP/1.1\r\n\
             Host: localhost\r\n\
             Content-Type: application/json\r\n\
             Content-Length: {}\r\n\
             Connection: keep-alive\r\n\r\n{}",
            request_json.len(),
            request_json
        );

        let mut stream = self.stream.lock().await;
        stream.write_all(http_request.as_bytes()).await?;

        // Read HTTP response
        let mut buffer = vec![0u8; 65536];
        let n = stream.read(&mut buffer).await?;
        let response_str = String::from_utf8_lossy(&buffer[..n]);

        // Parse HTTP response to get JSON body
        let body = response_str
            .split("\r\n\r\n")
            .nth(1)
            .ok_or_else(|| Error::Aria2("Invalid HTTP response".into()))?;

        let response: JsonRpcResponse = serde_json::from_str(body)?;

        if let Some(error) = response.error {
            return Err(Error::Aria2(format!(
                "RPC error {}: {}",
                error.code, error.message
            )));
        }

        let result = response
            .result
            .ok_or_else(|| Error::Aria2("Empty response".into()))?;

        serde_json::from_value(result).map_err(|e| Error::Aria2(format!("Parse error: {}", e)))
    }

    // Download operations
    pub async fn add_uri(&self, urls: Vec<String>, options: DownloadOptions) -> Result<String> {
        let options_value = serde_json::to_value(&options)?;
        self.call("addUri", vec![json!(urls), options_value]).await
    }

    pub async fn add_torrent(
        &self,
        torrent_base64: &str,
        options: DownloadOptions,
    ) -> Result<String> {
        let options_value = serde_json::to_value(&options)?;
        self.call("addTorrent", vec![json!(torrent_base64), json!([]), options_value])
            .await
    }

    pub async fn add_metalink(
        &self,
        metalink_base64: &str,
        options: DownloadOptions,
    ) -> Result<Vec<String>> {
        let options_value = serde_json::to_value(&options)?;
        self.call("addMetalink", vec![json!(metalink_base64), options_value])
            .await
    }

    // Control operations
    pub async fn pause(&self, gid: &str) -> Result<String> {
        self.call("pause", vec![json!(gid)]).await
    }

    pub async fn pause_all(&self) -> Result<String> {
        self.call("pauseAll", vec![]).await
    }

    pub async fn unpause(&self, gid: &str) -> Result<String> {
        self.call("unpause", vec![json!(gid)]).await
    }

    pub async fn unpause_all(&self) -> Result<String> {
        self.call("unpauseAll", vec![]).await
    }

    pub async fn remove(&self, gid: &str) -> Result<String> {
        self.call("remove", vec![json!(gid)]).await
    }

    pub async fn force_remove(&self, gid: &str) -> Result<String> {
        self.call("forceRemove", vec![json!(gid)]).await
    }

    // Status queries
    pub async fn tell_status(&self, gid: &str) -> Result<DownloadStatus> {
        self.call("tellStatus", vec![json!(gid)]).await
    }

    pub async fn tell_active(&self) -> Result<Vec<DownloadStatus>> {
        self.call("tellActive", vec![]).await
    }

    pub async fn tell_waiting(&self, offset: i32, num: i32) -> Result<Vec<DownloadStatus>> {
        self.call("tellWaiting", vec![json!(offset), json!(num)])
            .await
    }

    pub async fn tell_stopped(&self, offset: i32, num: i32) -> Result<Vec<DownloadStatus>> {
        self.call("tellStopped", vec![json!(offset), json!(num)])
            .await
    }

    pub async fn get_global_stat(&self) -> Result<GlobalStat> {
        self.call("getGlobalStat", vec![]).await
    }

    pub async fn get_files(&self, gid: &str) -> Result<Vec<Aria2File>> {
        self.call("getFiles", vec![json!(gid)]).await
    }

    // Options
    pub async fn change_option(&self, gid: &str, options: DownloadOptions) -> Result<String> {
        let options_value = serde_json::to_value(&options)?;
        self.call("changeOption", vec![json!(gid), options_value])
            .await
    }

    pub async fn change_global_option(&self, options: Value) -> Result<String> {
        self.call("changeGlobalOption", vec![options]).await
    }

    pub async fn get_version(&self) -> Result<Value> {
        self.call("getVersion", vec![]).await
    }

    // Session management
    pub async fn save_session(&self) -> Result<String> {
        self.call("saveSession", vec![]).await
    }

    pub async fn shutdown(&self) -> Result<String> {
        self.call("shutdown", vec![]).await
    }

    // BitTorrent specific
    pub async fn get_peers(&self, gid: &str) -> Result<Vec<Value>> {
        self.call("getPeers", vec![json!(gid)]).await
    }
}
