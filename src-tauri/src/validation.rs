//! Input validation for URLs and torrent paths, shared by all commands.

use crate::Error;
use std::net::IpAddr;

const MAX_URL_LENGTH: usize = 8192;

/// Validate a download URL: must be http://, https://, or magnet:
/// Rejects file:// scheme, empty URLs, overly long URLs, and private IP addresses.
pub fn validate_download_url(url: &str) -> crate::Result<()> {
    if url.is_empty() {
        return Err(Error::InvalidInput("URL cannot be empty".into()));
    }
    if url.len() > MAX_URL_LENGTH {
        return Err(Error::InvalidInput(format!(
            "URL exceeds maximum length of {} characters",
            MAX_URL_LENGTH
        )));
    }

    let lower = url.to_lowercase();
    if lower.starts_with("magnet:") {
        return Ok(());
    }
    if !lower.starts_with("http://") && !lower.starts_with("https://") {
        return Err(Error::InvalidInput(format!(
            "URL must use http://, https://, or magnet: scheme, got: {}",
            url.split("://").next().unwrap_or("unknown")
        )));
    }

    // Parse URL and check for private/loopback IPs
    if let Ok(parsed) = url::Url::parse(url) {
        if let Some(host) = parsed.host_str() {
            if let Ok(ip) = host.parse::<IpAddr>() {
                if is_private_ip(&ip) {
                    return Err(Error::InvalidInput(
                        "URLs targeting private/loopback IP addresses are not allowed".into(),
                    ));
                }
            }
        }
    }

    Ok(())
}

/// Validate a URL for recursive HTTP mirroring: http/https only (no magnet).
pub fn validate_http_url(url: &str) -> crate::Result<()> {
    if url.to_lowercase().starts_with("magnet:") {
        return Err(Error::InvalidInput(
            "Recursive mirroring requires an http:// or https:// URL".into(),
        ));
    }
    validate_download_url(url)
}

fn is_private_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()             // 127.0.0.0/8
                || v4.is_private()       // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
                || v4.is_link_local()    // 169.254.0.0/16
                || v4.is_unspecified()   // 0.0.0.0
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()             // ::1
                || v6.is_unspecified()   // ::
                // fc00::/7 (unique local)
                || (v6.segments()[0] & 0xfe00) == 0xfc00
        }
    }
}

/// Validate a torrent file path: must end with .torrent and exist on disk.
pub fn validate_torrent_path(file_path: &str) -> crate::Result<()> {
    if file_path.is_empty() {
        return Err(Error::InvalidInput("Torrent file path cannot be empty".into()));
    }
    if !file_path.to_lowercase().ends_with(".torrent") {
        return Err(Error::InvalidInput(
            "File must have a .torrent extension".into(),
        ));
    }
    if !std::path::Path::new(file_path).exists() {
        return Err(Error::InvalidInput(format!(
            "Torrent file does not exist: {}",
            file_path
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_download_url_valid() {
        assert!(validate_download_url("https://example.com/file.zip").is_ok());
        assert!(validate_download_url("http://example.com/file.zip").is_ok());
        assert!(validate_download_url("magnet:?xt=urn:btih:abc123").is_ok());
    }

    #[test]
    fn test_validate_download_url_empty() {
        assert!(validate_download_url("").is_err());
    }

    #[test]
    fn test_validate_download_url_bad_scheme() {
        assert!(validate_download_url("file:///etc/passwd").is_err());
        assert!(validate_download_url("ftp://example.com/file").is_err());
        assert!(validate_download_url("javascript:alert(1)").is_err());
    }

    #[test]
    fn test_validate_download_url_too_long() {
        let long_url = format!("https://example.com/{}", "a".repeat(MAX_URL_LENGTH));
        assert!(validate_download_url(&long_url).is_err());
    }

    #[test]
    fn test_validate_download_url_private_ips() {
        assert!(validate_download_url("http://127.0.0.1/file").is_err());
        assert!(validate_download_url("http://192.168.1.1/file").is_err());
        assert!(validate_download_url("http://10.0.0.1/file").is_err());
        assert!(validate_download_url("http://172.16.0.1/file").is_err());
        assert!(validate_download_url("http://0.0.0.0/file").is_err());
    }

    #[test]
    fn test_validate_http_url_rejects_magnet() {
        assert!(validate_http_url("magnet:?xt=urn:btih:abc123").is_err());
        assert!(validate_http_url("https://example.com/dir/").is_ok());
    }

    #[test]
    fn test_is_private_ip() {
        assert!(is_private_ip(&"127.0.0.1".parse().unwrap()));
        assert!(is_private_ip(&"10.0.0.1".parse().unwrap()));
        assert!(is_private_ip(&"192.168.0.1".parse().unwrap()));
        assert!(is_private_ip(&"172.16.0.1".parse().unwrap()));
        assert!(is_private_ip(&"169.254.1.1".parse().unwrap()));
        assert!(is_private_ip(&"::1".parse().unwrap()));

        assert!(!is_private_ip(&"8.8.8.8".parse().unwrap()));
        assert!(!is_private_ip(&"1.1.1.1".parse().unwrap()));
    }

    #[test]
    fn test_validate_torrent_path_empty() {
        assert!(validate_torrent_path("").is_err());
    }

    #[test]
    fn test_validate_torrent_path_wrong_extension() {
        assert!(validate_torrent_path("/tmp/file.zip").is_err());
    }

    #[test]
    fn test_validate_torrent_path_nonexistent() {
        assert!(validate_torrent_path("/nonexistent/path/file.torrent").is_err());
    }
}
