<script lang="ts">
  import { listen, emit } from '@tauri-apps/api/event';
  import { invoke } from '@tauri-apps/api/core';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
  import { exit } from '@tauri-apps/plugin-process';

  interface TrayDownload {
    name: string;
    completedSize: number;
    totalSize: number;
    downloadSpeed: number;
  }

  interface TrayUpdatePayload {
    downloadSpeed: number;
    uploadSpeed: number;
    activeDownloads: TrayDownload[];
  }

  let downloadSpeed = $state(0);
  let uploadSpeed = $state(0);
  let activeDownloads = $state<TrayDownload[]>([]);

  const displayDownloads = $derived(activeDownloads.slice(0, 3));

  $effect(() => {
    const unlistenPromise = listen<TrayUpdatePayload>('tray-update', (event) => {
      downloadSpeed = event.payload.downloadSpeed || 0;
      uploadSpeed = event.payload.uploadSpeed || 0;
      activeDownloads = event.payload.activeDownloads || [];
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  });

  // --- Utility functions (ported from src-electron/tray-popup.html) ---

  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;

  function formatSpeed(bytesPerSec: number): string {
    if (bytesPerSec === 0) return '0 B/s';
    if (bytesPerSec >= GB) return (bytesPerSec / GB).toFixed(1) + ' GB/s';
    if (bytesPerSec >= MB) return (bytesPerSec / MB).toFixed(1) + ' MB/s';
    if (bytesPerSec >= KB) return (bytesPerSec / KB).toFixed(1) + ' KB/s';
    return bytesPerSec + ' B/s';
  }

  function formatEta(bytesRemaining: number, speed: number): string {
    if (speed === 0 || bytesRemaining <= 0) return '--';
    const seconds = Math.floor(bytesRemaining / speed);
    if (seconds < 60) return seconds + 's';
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      return mins + 'm remaining';
    }
    if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return hours + 'h ' + mins + 'm';
    }
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    return days + 'd ' + hours + 'h';
  }

  function getProgressColor(percent: number): string {
    if (percent < 30) return 'amber';
    if (percent > 65) return 'green';
    return 'blue';
  }

  function getPercent(d: TrayDownload): number {
    const total = d.totalSize || 0;
    const completed = d.completedSize || 0;
    const percentRaw = total > 0 ? Math.round((completed / total) * 100) : 0;
    return Math.max(0, Math.min(100, Number(percentRaw) || 0));
  }

  function truncateName(name: string, maxLen: number): string {
    if (!name) return 'Unknown';
    if (name.length <= maxLen) return name;
    const ext = name.lastIndexOf('.');
    if (ext > 0 && name.length - ext <= 8) {
      const extPart = name.slice(ext);
      const available = maxLen - extPart.length - 3;
      if (available > 4) {
        return name.slice(0, available) + '...' + extPart;
      }
    }
    return name.slice(0, maxLen - 3) + '...';
  }

  // --- Actions ---

  async function showMainWindow() {
    const main = await WebviewWindow.getByLabel('main');
    if (main) {
      await main.show();
      await main.unminimize();
      await main.setFocus();
    }
  }

  async function hidePopup() {
    await getCurrentWindow().hide();
  }

  async function openApp() {
    await showMainWindow();
    await hidePopup();
  }

  async function openSettings() {
    await showMainWindow();
    await emit('navigate', '/settings');
    await hidePopup();
  }

  async function addUrl() {
    await showMainWindow();
    await emit('navigate', '/');
    await emit('open-add-modal', {});
    await hidePopup();
  }

  async function pauseAll() {
    try {
      await invoke('pause_all');
    } catch {
      /* ignore */
    }
  }

  async function resumeAll() {
    try {
      await invoke('resume_all');
    } catch {
      /* ignore */
    }
  }

  async function quitApp() {
    await exit(0);
  }
</script>

<div class="tray-container">
  <!-- Header: Global Speed -->
  <div class="tray-header">
    <div class="speed-stats">
      <span class="speed-label">Global Speed</span>
      <div class="speed-row">
        <span class="speed-value upload">
          <span class="material-symbols-outlined icon arrow">arrow_upward</span>
          <span>{formatSpeed(uploadSpeed)}</span>
        </span>
        <span class="speed-value download">
          <span class="material-symbols-outlined icon arrow">arrow_downward</span>
          <span>{formatSpeed(downloadSpeed)}</span>
        </span>
      </div>
    </div>
    <button class="icon-btn" onclick={openSettings} title="Settings">
      <span class="material-symbols-outlined icon">settings</span>
    </button>
  </div>

  <!-- Active Downloads -->
  <div class="tray-section">
    <div class="section-header">
      <span class="section-label">Active Tasks ({activeDownloads.length})</span>
      <a
        class="view-all"
        href="#/"
        role="button"
        onclick={(e) => {
          e.preventDefault();
          openApp();
        }}>View All</a
      >
    </div>
    {#if displayDownloads.length === 0}
      <div class="empty-state visible">No active downloads</div>
    {:else}
      {#each displayDownloads as d}
        {@const percent = getPercent(d)}
        {@const speed = d.downloadSpeed || 0}
        {@const remaining = (d.totalSize || 0) - (d.completedSize || 0)}
        <div class="download-item">
          <div class="download-top">
            <span class="download-name" title={d.name}>{truncateName(d.name, 28)}</span>
            <span class="download-percent">{percent}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill {getProgressColor(percent)}" style="width: {percent}%"></div>
          </div>
          <div class="download-meta">
            <span class="download-speed">{formatSpeed(speed)}</span>
            <span class="download-eta">{formatEta(remaining, speed)}</span>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <div class="divider"></div>

  <!-- Actions -->
  <div class="tray-section">
    <button class="action-btn primary" onclick={openApp}>
      <span class="material-symbols-outlined icon">open_in_new</span>
      <span>Open Gosh-Fetch</span>
    </button>
    <button class="action-btn" onclick={addUrl}>
      <span class="material-symbols-outlined icon">add_link</span>
      <span>Add URL...</span>
    </button>
    <div class="divider"></div>
    <button class="action-btn" onclick={pauseAll}>
      <span class="material-symbols-outlined icon">pause_circle</span>
      <span>Pause All</span>
    </button>
    <button class="action-btn" onclick={resumeAll}>
      <span class="material-symbols-outlined icon">play_circle</span>
      <span>Resume All</span>
    </button>
  </div>

  <!-- Footer: Quit -->
  <div class="tray-footer">
    <button class="action-btn quit" onclick={quitApp}>
      <span class="material-symbols-outlined icon">power_settings_new</span>
      <span>Quit</span>
    </button>
  </div>
</div>

<style>
  :global(html),
  :global(body) {
    background: transparent !important;
    overflow: hidden;
  }

  .tray-container {
    --bg: #101922;
    --surface: #1a242d;
    --surface-hover: #24303b;
    --primary: #137fec;
    --text: #e2e8f0;
    --text-secondary: #cbd5e1;
    --text-muted: #64748b;
    --text-faint: #475569;
    --emerald: #10b981;
    --amber: #f59e0b;
    --red: #ef4444;
    --border: rgba(255, 255, 255, 0.08);
    --border-light: rgba(255, 255, 255, 0.05);

    width: 320px;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    color: var(--text);
    -webkit-font-smoothing: antialiased;
    user-select: none;
  }

  /* Header */
  .tray-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    background: rgba(16, 25, 34, 0.5);
    border-bottom: 1px solid var(--border-light);
  }

  .speed-stats {
    display: flex;
    flex-direction: column;
  }

  .speed-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    margin-bottom: 4px;
  }

  .speed-row {
    display: flex;
    gap: 16px;
  }

  .speed-value {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .speed-value .arrow {
    font-size: 16px;
    font-variation-settings: 'FILL' 0, 'wght' 500;
  }

  .speed-value.upload .arrow {
    color: var(--emerald);
  }

  .speed-value.download {
    color: var(--text);
    font-weight: 700;
  }

  .speed-value.download .arrow {
    color: var(--primary);
  }

  .icon-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .icon-btn:hover {
    color: var(--text);
    background: rgba(255, 255, 255, 0.05);
  }

  .icon-btn .icon {
    font-size: 20px;
  }

  /* Sections */
  .tray-section {
    display: flex;
    flex-direction: column;
    padding: 8px 0;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 16px;
  }

  .section-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }

  .view-all {
    font-size: 12px;
    color: var(--primary);
    cursor: pointer;
    text-decoration: none;
    font-weight: 500;
  }

  .view-all:hover {
    text-decoration: underline;
  }

  /* Download Items */
  .download-item {
    padding: 8px 16px;
    transition: background 0.15s ease;
    cursor: default;
  }

  .download-item:hover {
    background: var(--surface-hover);
  }

  .download-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .download-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 220px;
  }

  .download-percent {
    font-size: 12px;
    color: var(--text-muted);
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-weight: 500;
    flex-shrink: 0;
    margin-left: 8px;
  }

  .progress-bar {
    height: 6px;
    width: 100%;
    background: var(--bg);
    border-radius: 999px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    border-radius: 999px;
    transition: width 0.3s ease;
  }

  .progress-fill.blue {
    background: var(--primary);
  }
  .progress-fill.green {
    background: var(--emerald);
  }
  .progress-fill.amber {
    background: var(--amber);
  }

  .download-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 4px;
  }

  .download-speed,
  .download-eta {
    font-size: 10px;
    color: var(--text-faint);
  }

  /* Divider */
  .divider {
    height: 1px;
    background: var(--border-light);
    margin: 4px 16px;
  }

  /* Action Buttons */
  .action-btn {
    width: 100%;
    text-align: left;
    padding: 10px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
  }

  .action-btn:hover {
    background: var(--surface-hover);
  }

  .action-btn .icon {
    font-size: 20px;
    color: var(--text-muted);
  }

  .action-btn.primary {
    color: var(--text);
    font-weight: 700;
  }

  .action-btn.primary:hover {
    background: rgba(19, 127, 236, 0.15);
  }

  .action-btn.primary .icon {
    color: var(--primary);
  }

  .action-btn.quit {
    color: var(--text-secondary);
  }

  .action-btn.quit:hover {
    background: rgba(239, 68, 68, 0.1);
    color: var(--red);
  }

  .action-btn.quit:hover .icon {
    color: var(--red);
  }

  /* Footer */
  .tray-footer {
    background: rgba(16, 25, 34, 0.3);
    border-top: 1px solid var(--border-light);
    padding: 4px 0;
  }

  /* Empty State */
  .empty-state {
    padding: 20px 16px;
    text-align: center;
    color: var(--text-faint);
    font-size: 12px;
  }

  /* Icon (Material Symbols) */
  .icon {
    font-size: 20px;
    line-height: 1;
    font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  }
</style>
