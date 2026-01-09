-- Downloads table
CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    url TEXT,
    magnet_uri TEXT,
    info_hash TEXT,
    download_type TEXT NOT NULL DEFAULT 'http',
    status TEXT NOT NULL DEFAULT 'waiting',
    total_size INTEGER DEFAULT 0,
    completed_size INTEGER DEFAULT 0,
    download_speed INTEGER DEFAULT 0,
    upload_speed INTEGER DEFAULT 0,
    save_path TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    error_message TEXT,
    selected_files TEXT
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Trackers table
CREATE TABLE IF NOT EXISTS trackers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE NOT NULL,
    enabled INTEGER DEFAULT 1,
    last_checked DATETIME,
    is_working INTEGER DEFAULT 1
);

-- Tracker list metadata
CREATE TABLE IF NOT EXISTS tracker_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_updated DATETIME,
    source_url TEXT DEFAULT 'https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
CREATE INDEX IF NOT EXISTS idx_downloads_created ON downloads(created_at);
CREATE INDEX IF NOT EXISTS idx_downloads_gid ON downloads(gid);

-- Default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('download_path', '~/Downloads'),
    ('max_concurrent_downloads', '5'),
    ('max_connections_per_server', '16'),
    ('split_count', '16'),
    ('download_speed_limit', '0'),
    ('upload_speed_limit', '0'),
    ('user_agent', 'gosh-dl/0.1.0'),
    ('enable_notifications', 'true'),
    ('close_to_tray', 'true'),
    ('theme', 'dark'),
    ('bt_enable_dht', 'true'),
    ('bt_enable_pex', 'true'),
    ('bt_enable_lpd', 'true'),
    ('bt_max_peers', '55'),
    ('bt_seed_ratio', '1.0'),
    ('auto_update_trackers', 'true'),
    ('delete_files_on_remove', 'false');

-- Initialize tracker metadata
INSERT OR IGNORE INTO tracker_meta (id, source_url) VALUES
    (1, 'https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt');
