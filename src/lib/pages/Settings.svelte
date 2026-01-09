<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { open } from '@tauri-apps/plugin-dialog';
  import Database from '@tauri-apps/plugin-sql';
  import { onMount } from 'svelte';

  let downloadPath = $state('');
  let maxConcurrent = $state(5);
  let maxConnections = $state(16);
  let splitCount = $state(16);
  let downloadSpeedLimit = $state(0);
  let uploadSpeedLimit = $state(0);
  let userAgent = $state('gosh-dl/0.1.0');
  let enableNotifications = $state(true);
  let closeToTray = $state(true);
  let autoUpdateTrackers = $state(true);
  let deleteFilesOnRemove = $state(false);

  let userAgentPresets = $state<[string, string][]>([]);
  let isSaving = $state(false);
  let saveMessage = $state<string | null>(null);

  interface SettingRow {
    key: string;
    value: string;
  }

  async function loadSettingsFromDb() {
    try {
      const db = await Database.load('sqlite:gosh-fetch.db');
      const rows = await db.select<SettingRow[]>('SELECT key, value FROM settings');

      for (const row of rows) {
        switch (row.key) {
          case 'download_path':
            downloadPath = row.value === '~/Downloads'
              ? await invoke<string>('get_default_download_path')
              : row.value;
            break;
          case 'max_concurrent_downloads':
            maxConcurrent = parseInt(row.value) || 5;
            break;
          case 'max_connections_per_server':
            maxConnections = parseInt(row.value) || 16;
            break;
          case 'split_count':
            splitCount = parseInt(row.value) || 16;
            break;
          case 'download_speed_limit':
            downloadSpeedLimit = parseInt(row.value) || 0;
            break;
          case 'upload_speed_limit':
            uploadSpeedLimit = parseInt(row.value) || 0;
            break;
          case 'user_agent':
            userAgent = row.value;
            break;
          case 'enable_notifications':
            enableNotifications = row.value === 'true';
            break;
          case 'close_to_tray':
            closeToTray = row.value === 'true';
            // Sync with backend state
            await invoke('set_close_to_tray', { value: closeToTray });
            break;
          case 'auto_update_trackers':
            autoUpdateTrackers = row.value === 'true';
            break;
          case 'delete_files_on_remove':
            deleteFilesOnRemove = row.value === 'true';
            break;
        }
      }
    } catch (e) {
      console.error('Failed to load settings from database:', e);
      // Fallback to default download path
      downloadPath = await invoke<string>('get_default_download_path');
    }
  }

  async function saveSettingsToDb() {
    const db = await Database.load('sqlite:gosh-fetch.db');

    const settings: Record<string, string> = {
      download_path: downloadPath,
      max_concurrent_downloads: maxConcurrent.toString(),
      max_connections_per_server: maxConnections.toString(),
      split_count: splitCount.toString(),
      download_speed_limit: downloadSpeedLimit.toString(),
      upload_speed_limit: uploadSpeedLimit.toString(),
      user_agent: userAgent,
      enable_notifications: enableNotifications.toString(),
      close_to_tray: closeToTray.toString(),
      auto_update_trackers: autoUpdateTrackers.toString(),
      delete_files_on_remove: deleteFilesOnRemove.toString(),
    };

    for (const [key, value] of Object.entries(settings)) {
      await db.execute(
        'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime("now"))',
        [key, value]
      );
    }
  }

  onMount(async () => {
    try {
      userAgentPresets = await invoke<[string, string][]>('get_user_agent_presets');
      await loadSettingsFromDb();
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  });

  async function handleBrowseDownloadPath() {
    const selected = await open({
      directory: true,
      multiple: false,
    });

    if (selected && typeof selected === 'string') {
      downloadPath = selected;
    }
  }

  async function handleSave() {
    isSaving = true;
    saveMessage = null;

    try {
      // Save to database first
      await saveSettingsToDb();

      // Sync close_to_tray with backend state
      await invoke('set_close_to_tray', { value: closeToTray });

      // Apply to download engine
      await invoke('apply_settings_to_engine', {
        settings: {
          download_path: downloadPath,
          max_concurrent_downloads: maxConcurrent,
          max_connections_per_server: maxConnections,
          split_count: splitCount,
          download_speed_limit: downloadSpeedLimit,
          upload_speed_limit: uploadSpeedLimit,
          user_agent: userAgent,
          enable_notifications: enableNotifications,
          close_to_tray: closeToTray,
          theme: 'dark',
          bt_enable_dht: true,
          bt_enable_pex: true,
          bt_enable_lpd: true,
          bt_max_peers: 55,
          bt_seed_ratio: 1.0,
          auto_update_trackers: autoUpdateTrackers,
          delete_files_on_remove: deleteFilesOnRemove,
        },
      });
      saveMessage = 'Settings saved successfully';
    } catch (e) {
      saveMessage = `Failed to save: ${e}`;
    } finally {
      isSaving = false;
    }
  }

  async function handleUpdateTrackers() {
    try {
      const trackers = await invoke<string[]>('update_tracker_list');
      saveMessage = `Updated ${trackers.length} trackers`;
    } catch (e) {
      saveMessage = `Failed to update trackers: ${e}`;
    }
  }

  function formatSpeedLimit(bytes: number): string {
    if (bytes === 0) return 'Unlimited';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB/s`;
  }
</script>

<div class="page">
  <header class="page-header">
    <h1>Settings</h1>
  </header>

  <div class="settings-content">
    <section class="settings-section">
      <h2>General</h2>

      <div class="setting-item">
        <div class="setting-info">
          <label>Download Location</label>
          <p>Where downloaded files will be saved</p>
        </div>
        <div class="setting-control file-control">
          <input type="text" bind:value={downloadPath} readonly />
          <button class="btn btn-secondary" onclick={handleBrowseDownloadPath}>
            Browse
          </button>
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <label>Notifications</label>
          <p>Show notification when downloads complete</p>
        </div>
        <div class="setting-control">
          <input type="checkbox" bind:checked={enableNotifications} />
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <label>Close to Tray</label>
          <p>Minimize to system tray instead of quitting</p>
        </div>
        <div class="setting-control">
          <input type="checkbox" bind:checked={closeToTray} />
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <label>Delete Files on Remove</label>
          <p>Delete downloaded files when removing a task (default)</p>
        </div>
        <div class="setting-control">
          <input type="checkbox" bind:checked={deleteFilesOnRemove} />
        </div>
      </div>
    </section>

    <section class="settings-section">
      <h2>Connection</h2>

      <div class="setting-item">
        <div class="setting-info">
          <label>Concurrent Downloads</label>
          <p>{maxConcurrent} simultaneous downloads</p>
        </div>
        <div class="setting-control">
          <input
            type="range"
            min="1"
            max="20"
            bind:value={maxConcurrent}
          />
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <label>Connections per Server</label>
          <p>{maxConnections} connections per download</p>
        </div>
        <div class="setting-control">
          <input
            type="range"
            min="1"
            max="16"
            bind:value={maxConnections}
          />
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <label>Split Count</label>
          <p>{splitCount} segments per file</p>
        </div>
        <div class="setting-control">
          <input
            type="range"
            min="1"
            max="64"
            bind:value={splitCount}
          />
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <label>Download Speed Limit</label>
          <p>{formatSpeedLimit(downloadSpeedLimit)} (0 = unlimited)</p>
        </div>
        <div class="setting-control">
          <input
            type="range"
            min="0"
            max="104857600"
            step="1048576"
            bind:value={downloadSpeedLimit}
          />
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <label>Upload Speed Limit</label>
          <p>{formatSpeedLimit(uploadSpeedLimit)} (0 = unlimited)</p>
        </div>
        <div class="setting-control">
          <input
            type="range"
            min="0"
            max="104857600"
            step="1048576"
            bind:value={uploadSpeedLimit}
          />
        </div>
      </div>
    </section>

    <section class="settings-section">
      <h2>User Agent</h2>

      <div class="setting-item">
        <div class="setting-info">
          <label>User Agent</label>
          <p>Identify as a different client</p>
        </div>
        <div class="setting-control user-agent-control">
          <select bind:value={userAgent}>
            {#each userAgentPresets as [name, value]}
              <option {value}>{name}</option>
            {/each}
          </select>
        </div>
      </div>
    </section>

    <section class="settings-section">
      <h2>BitTorrent</h2>

      <div class="setting-item">
        <div class="setting-info">
          <label>Auto-Update Tracker List</label>
          <p>Automatically fetch updated trackers daily</p>
        </div>
        <div class="setting-control">
          <input type="checkbox" bind:checked={autoUpdateTrackers} />
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <label>Update Trackers Now</label>
          <p>Fetch the latest tracker list from ngosang/trackerslist</p>
        </div>
        <div class="setting-control">
          <button class="btn btn-secondary" onclick={handleUpdateTrackers}>
            Update Trackers
          </button>
        </div>
      </div>
    </section>

    <div class="settings-footer">
      {#if saveMessage}
        <span class="save-message" class:error={saveMessage.startsWith('Failed')}>
          {saveMessage}
        </span>
      {/if}
      <button class="btn btn-primary" onclick={handleSave} disabled={isSaving}>
        {isSaving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  </div>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .page-header {
    padding: var(--space-lg);
    border-bottom: 1px solid var(--border-primary);
    background: var(--bg-secondary);
  }

  .page-header h1 {
    font-size: 20px;
    margin: 0;
  }

  .settings-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-lg);
  }

  .settings-section {
    margin-bottom: var(--space-xl);
  }

  .settings-section h2 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: var(--space-md);
    padding-bottom: var(--space-sm);
    border-bottom: 1px solid var(--border-secondary);
  }

  .setting-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-md);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-sm);
  }

  .setting-info {
    flex: 1;
  }

  .setting-info label {
    display: block;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: var(--space-xs);
  }

  .setting-info p {
    font-size: 12px;
    color: var(--text-muted);
    margin: 0;
  }

  .setting-control {
    flex-shrink: 0;
    margin-left: var(--space-lg);
  }

  .setting-control input[type="number"] {
    width: 80px;
    text-align: center;
  }

  .setting-control input[type="range"] {
    width: 200px;
  }

  .file-control {
    display: flex;
    gap: var(--space-sm);
    flex: 1;
    max-width: 400px;
  }

  .file-control input {
    flex: 1;
    font-size: 12px;
  }

  .user-agent-control select {
    width: 200px;
  }

  .settings-footer {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-lg);
    border-top: 1px solid var(--border-primary);
    background: var(--bg-secondary);
  }

  .save-message {
    font-size: 13px;
    color: var(--color-success);
  }

  .save-message.error {
    color: var(--color-destructive);
  }
</style>
