// Settings keys are snake_case on purpose: they mirror the SQLite settings
// table and the Rust Settings struct.
export interface Settings {
  download_path: string;
  max_concurrent_downloads: number;
  max_connections_per_server: number;
  split_count: number;
  download_speed_limit: number;
  upload_speed_limit: number;
  user_agent: string;
  enable_notifications: boolean;
  close_to_tray: boolean;
  theme: string;
  bt_enable_dht: boolean;
  bt_enable_pex: boolean;
  bt_enable_lpd: boolean;
  bt_max_peers: number;
  bt_seed_ratio: number;
  auto_update_trackers: boolean;
  delete_files_on_remove: boolean;
  proxy_url: string;
  connect_timeout: number;
  read_timeout: number;
  max_retries: number;
  allocation_mode: string;
}
