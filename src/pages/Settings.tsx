import React, { useEffect, useState, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Save } from 'lucide-react';
import { selectTheme, setTheme } from '../store/themeSlice';
import { api } from '../lib/api';
import type { Settings as SettingsType } from '../lib/api';
import type { AppDispatch } from '../store/store';
import './Settings.css';

export default function Settings() {
  const dispatch = useDispatch<AppDispatch>();
  const theme = useSelector(selectTheme);
  const [downloadPath, setDownloadPath] = useState('');
  const [maxConcurrent, setMaxConcurrent] = useState(5);
  const [maxConnections, setMaxConnections] = useState(16);
  const [splitCount, setSplitCount] = useState(16);
  const [downloadSpeedLimit, setDownloadSpeedLimit] = useState(0);
  const [uploadSpeedLimit, setUploadSpeedLimit] = useState(0);
  const [userAgent, setUserAgent] = useState('gosh-dl/0.1.0');
  const [enableNotifications, setEnableNotifications] = useState(true);
  const [closeToTray, setCloseToTray] = useState(true);
  const [autoUpdateTrackers, setAutoUpdateTrackers] = useState(true);
  const [deleteFilesOnRemove, setDeleteFilesOnRemove] = useState(false);
  const [proxyUrl, setProxyUrl] = useState('');
  const [connectTimeout, setConnectTimeout] = useState(30);
  const [readTimeout, setReadTimeout] = useState(60);
  const [maxRetries, setMaxRetries] = useState(3);
  const [allocationMode, setAllocationMode] = useState('sparse');
  const [userAgentPresets, setUserAgentPresets] = useState<[string, string][]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const savedSnapshot = useRef<string>('');

  function getSnapshot() {
    return JSON.stringify({
      downloadPath, maxConcurrent, maxConnections, splitCount,
      downloadSpeedLimit, uploadSpeedLimit, userAgent,
      enableNotifications, closeToTray, autoUpdateTrackers,
      deleteFilesOnRemove, proxyUrl, connectTimeout, readTimeout,
      maxRetries, allocationMode, theme,
    });
  }

  useEffect(() => {
    const snap = getSnapshot();
    if (savedSnapshot.current && snap !== savedSnapshot.current) {
      setIsDirty(true);
    }
  }, [
    downloadPath, maxConcurrent, maxConnections, splitCount,
    downloadSpeedLimit, uploadSpeedLimit, userAgent,
    enableNotifications, closeToTray, autoUpdateTrackers,
    deleteFilesOnRemove, proxyUrl, connectTimeout, readTimeout,
    maxRetries, allocationMode, theme,
  ]);

  useEffect(() => {
    (async () => {
      try {
        const presets = await api.getUserAgentPresets();
        setUserAgentPresets(presets);

        const settings = await api.dbGetSettings();
        if (settings.download_path === '~/Downloads') {
          setDownloadPath(await api.getDefaultDownloadPath());
        } else {
          setDownloadPath(settings.download_path);
        }
        setMaxConcurrent(settings.max_concurrent_downloads);
        setMaxConnections(settings.max_connections_per_server);
        setSplitCount(settings.split_count);
        setDownloadSpeedLimit(settings.download_speed_limit);
        setUploadSpeedLimit(settings.upload_speed_limit);
        setUserAgent(settings.user_agent);
        setEnableNotifications(settings.enable_notifications);
        setCloseToTray(settings.close_to_tray);
        setAutoUpdateTrackers(settings.auto_update_trackers);
        setDeleteFilesOnRemove(settings.delete_files_on_remove);
        setProxyUrl(settings.proxy_url);
        setConnectTimeout(settings.connect_timeout);
        setReadTimeout(settings.read_timeout);
        setMaxRetries(settings.max_retries);
        setAllocationMode(settings.allocation_mode);

        await api.setCloseToTray(settings.close_to_tray);

        // Set snapshot after loading
        setTimeout(() => {
          savedSnapshot.current = JSON.stringify({
            downloadPath: settings.download_path === '~/Downloads' ? '' : settings.download_path,
            maxConcurrent: settings.max_concurrent_downloads,
            maxConnections: settings.max_connections_per_server,
            splitCount: settings.split_count,
            downloadSpeedLimit: settings.download_speed_limit,
            uploadSpeedLimit: settings.upload_speed_limit,
            userAgent: settings.user_agent,
            enableNotifications: settings.enable_notifications,
            closeToTray: settings.close_to_tray,
            autoUpdateTrackers: settings.auto_update_trackers,
            deleteFilesOnRemove: settings.delete_files_on_remove,
            proxyUrl: settings.proxy_url,
            connectTimeout: settings.connect_timeout,
            readTimeout: settings.read_timeout,
            maxRetries: settings.max_retries,
            allocationMode: settings.allocation_mode,
            theme,
          });
        }, 100);
      } catch (e) {
        console.error('Failed to load settings:', e);
        try { setDownloadPath(await api.getDefaultDownloadPath()); } catch {}
      }
    })();
  }, []);

  async function handleBrowseDownloadPath() {
    const selected = await window.electronAPI.selectDirectory();
    if (selected) setDownloadPath(selected);
  }

  async function handleSave() {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const settings: SettingsType = {
        download_path: downloadPath,
        max_concurrent_downloads: maxConcurrent,
        max_connections_per_server: maxConnections,
        split_count: splitCount,
        download_speed_limit: downloadSpeedLimit,
        upload_speed_limit: uploadSpeedLimit,
        user_agent: userAgent,
        enable_notifications: enableNotifications,
        close_to_tray: closeToTray,
        theme,
        bt_enable_dht: true,
        bt_enable_pex: true,
        bt_enable_lpd: true,
        bt_max_peers: 55,
        bt_seed_ratio: 1.0,
        auto_update_trackers: autoUpdateTrackers,
        delete_files_on_remove: deleteFilesOnRemove,
        proxy_url: proxyUrl,
        connect_timeout: connectTimeout,
        read_timeout: readTimeout,
        max_retries: maxRetries,
        allocation_mode: allocationMode,
      };

      await api.dbSaveSettings(settings);
      await api.setCloseToTray(closeToTray);
      await api.applySettingsToEngine(settings);
      setSaveMessage('Settings saved successfully');
      savedSnapshot.current = getSnapshot();
      setIsDirty(false);
    } catch (e) {
      setSaveMessage(`Failed to save: ${e}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdateTrackers() {
    try {
      const trackers = await api.updateTrackerList();
      setSaveMessage(`Updated ${trackers.length} trackers`);
    } catch (e) {
      setSaveMessage(`Failed to update trackers: ${e}`);
    }
  }

  function formatSpeedLimit(bytes: number): string {
    if (bytes === 0) return 'Unlimited';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB/s`;
  }

  function handleThemeChange(newTheme: 'dark' | 'light') {
    dispatch(setTheme(newTheme));
  }

  return (
    <div className="page">
      <header className="page-header"><h1>Settings</h1></header>
      <div className="settings-content">
        <section className="settings-section">
          <h2>Appearance</h2>
          <div className="setting-item">
            <div className="setting-info"><label>Theme</label><p>Choose between dark and light mode</p></div>
            <div className="setting-control">
              <select value={theme} onChange={(e) => handleThemeChange(e.target.value as 'dark' | 'light')}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h2>General</h2>
          <div className="setting-item">
            <div className="setting-info"><label>Download Location</label><p>Where downloaded files will be saved</p></div>
            <div className="setting-control file-control">
              <input type="text" value={downloadPath} readOnly />
              <button className="btn btn-secondary" onClick={handleBrowseDownloadPath}>Browse</button>
            </div>
          </div>
          <div className="setting-item">
            <div className="setting-info"><label>Notifications</label><p>Show notification when downloads complete</p></div>
            <div className="setting-control"><input type="checkbox" checked={enableNotifications} onChange={(e) => setEnableNotifications(e.target.checked)} /></div>
          </div>
          <div className="setting-item">
            <div className="setting-info"><label>Close to Tray</label><p>Minimize to system tray instead of quitting</p></div>
            <div className="setting-control"><input type="checkbox" checked={closeToTray} onChange={(e) => setCloseToTray(e.target.checked)} /></div>
          </div>
          <div className="setting-item">
            <div className="setting-info"><label>Delete Files on Remove</label><p>Delete downloaded files when removing a task (default)</p></div>
            <div className="setting-control"><input type="checkbox" checked={deleteFilesOnRemove} onChange={(e) => setDeleteFilesOnRemove(e.target.checked)} /></div>
          </div>
        </section>

        <section className="settings-section">
          <h2>Connection</h2>
          <div className="setting-item">
            <div className="setting-info"><label>Concurrent Downloads</label><p>{maxConcurrent} simultaneous downloads</p></div>
            <div className="setting-control"><input type="range" min={1} max={20} value={maxConcurrent} onChange={(e) => setMaxConcurrent(Number(e.target.value))} aria-label="Concurrent downloads" aria-valuemin={1} aria-valuemax={20} aria-valuenow={maxConcurrent} aria-valuetext={`${maxConcurrent} downloads`} /></div>
          </div>
          <div className="setting-item">
            <div className="setting-info"><label>Connections per Server</label><p>{maxConnections} connections per download</p></div>
            <div className="setting-control"><input type="range" min={1} max={16} value={maxConnections} onChange={(e) => setMaxConnections(Number(e.target.value))} aria-label="Connections per server" aria-valuemin={1} aria-valuemax={16} aria-valuenow={maxConnections} aria-valuetext={`${maxConnections} connections`} /></div>
          </div>
          <div className="setting-item">
            <div className="setting-info"><label>Split Count</label><p>{splitCount} segments per file</p></div>
            <div className="setting-control"><input type="range" min={1} max={64} value={splitCount} onChange={(e) => setSplitCount(Number(e.target.value))} aria-label="Split count" aria-valuemin={1} aria-valuemax={64} aria-valuenow={splitCount} aria-valuetext={`${splitCount} segments`} /></div>
          </div>
          <div className="setting-item">
            <div className="setting-info"><label>Download Speed Limit</label><p>{formatSpeedLimit(downloadSpeedLimit)} (0 = unlimited)</p></div>
            <div className="setting-control"><input type="range" min={0} max={104857600} step={1048576} value={downloadSpeedLimit} onChange={(e) => setDownloadSpeedLimit(Number(e.target.value))} aria-label="Download speed limit" aria-valuemin={0} aria-valuemax={104857600} aria-valuenow={downloadSpeedLimit} aria-valuetext={formatSpeedLimit(downloadSpeedLimit)} /></div>
          </div>
          <div className="setting-item">
            <div className="setting-info"><label>Upload Speed Limit</label><p>{formatSpeedLimit(uploadSpeedLimit)} (0 = unlimited)</p></div>
            <div className="setting-control"><input type="range" min={0} max={104857600} step={1048576} value={uploadSpeedLimit} onChange={(e) => setUploadSpeedLimit(Number(e.target.value))} aria-label="Upload speed limit" aria-valuemin={0} aria-valuemax={104857600} aria-valuenow={uploadSpeedLimit} aria-valuetext={formatSpeedLimit(uploadSpeedLimit)} /></div>
          </div>
        </section>

        <section className="settings-section">
          <h2>Network</h2>
          <div className="setting-item">
            <div className="setting-info"><label>Proxy URL</label><p>HTTP/SOCKS proxy (leave empty for direct connection)</p></div>
            <div className="setting-control"><input type="text" value={proxyUrl} onChange={(e) => setProxyUrl(e.target.value)} placeholder="socks5://127.0.0.1:1080" /></div>
          </div>
          <div className="setting-item">
            <div className="setting-info"><label>Connect Timeout</label><p>{connectTimeout} seconds</p></div>
            <div className="setting-control"><input type="range" min={5} max={120} value={connectTimeout} onChange={(e) => setConnectTimeout(Number(e.target.value))} aria-label="Connect timeout" aria-valuemin={5} aria-valuemax={120} aria-valuenow={connectTimeout} aria-valuetext={`${connectTimeout} seconds`} /></div>
          </div>
          <div className="setting-item">
            <div className="setting-info"><label>Read Timeout</label><p>{readTimeout} seconds</p></div>
            <div className="setting-control"><input type="range" min={10} max={300} value={readTimeout} onChange={(e) => setReadTimeout(Number(e.target.value))} aria-label="Read timeout" aria-valuemin={10} aria-valuemax={300} aria-valuenow={readTimeout} aria-valuetext={`${readTimeout} seconds`} /></div>
          </div>
          <div className="setting-item">
            <div className="setting-info"><label>Max Retries</label><p>{maxRetries} retry attempts on failure</p></div>
            <div className="setting-control"><input type="range" min={0} max={10} value={maxRetries} onChange={(e) => setMaxRetries(Number(e.target.value))} aria-label="Max retries" aria-valuemin={0} aria-valuemax={10} aria-valuenow={maxRetries} aria-valuetext={`${maxRetries} retries`} /></div>
          </div>
          <div className="setting-item">
            <div className="setting-info"><label>File Allocation</label><p>How disk space is allocated for downloads</p></div>
            <div className="setting-control">
              <select value={allocationMode} onChange={(e) => setAllocationMode(e.target.value)}>
                <option value="none">None</option>
                <option value="sparse">Sparse</option>
                <option value="full">Full (pre-allocate)</option>
              </select>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h2>User Agent</h2>
          <div className="setting-item">
            <div className="setting-info"><label>User Agent</label><p>Identify as a different client</p></div>
            <div className="setting-control user-agent-control">
              <select value={userAgent} onChange={(e) => setUserAgent(e.target.value)}>
                {userAgentPresets.map(([name, value]) => <option key={value} value={value}>{name}</option>)}
              </select>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h2>BitTorrent</h2>
          <div className="setting-item">
            <div className="setting-info"><label>Auto-Update Tracker List</label><p>Automatically fetch updated trackers daily</p></div>
            <div className="setting-control"><input type="checkbox" checked={autoUpdateTrackers} onChange={(e) => setAutoUpdateTrackers(e.target.checked)} /></div>
          </div>
          <div className="setting-item">
            <div className="setting-info"><label>Update Trackers Now</label><p>Fetch the latest tracker list from ngosang/trackerslist</p></div>
            <div className="setting-control"><button className="btn btn-secondary" onClick={handleUpdateTrackers}>Update Trackers</button></div>
          </div>
        </section>

        <div className="settings-footer">
          {isDirty && <span className="unsaved-indicator">Unsaved changes</span>}
          {saveMessage && <span className={`save-message${saveMessage.startsWith('Failed') ? ' error' : ''}`}>{saveMessage}</span>}
          <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
            <Save size={14} />
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
