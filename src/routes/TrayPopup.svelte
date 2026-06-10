<script lang="ts">
  import { listen, emit } from '@tauri-apps/api/event';
  import { invoke } from '@tauri-apps/api/core';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
  import { exit } from '@tauri-apps/plugin-process';
  import Icon from '../lib/components/ui/Icon.svelte';

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

  // --- Utility functions ---

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
      return mins + 'm left';
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
  <!-- Header: ink block with live speeds -->
  <div class="tray-header">
    <div class="tray-brand">
      <Icon name="downloading" fill size={18} />
      <b>Gosh·Fetch</b>
    </div>
    <div class="tray-speeds">
      <span class="dn">↓ {formatSpeed(downloadSpeed)}</span>
      <span class="up">↑ {formatSpeed(uploadSpeed)}</span>
    </div>
  </div>

  <!-- Active Downloads -->
  <div class="tray-list">
    <div class="tray-section-head">
      <span class="tag-label">Active tasks · {String(activeDownloads.length).padStart(2, '0')}</span>
      <button class="tray-viewall" onclick={openApp}>View all</button>
    </div>
    {#if displayDownloads.length === 0}
      <div class="tray-empty">No active downloads</div>
    {:else}
      {#each displayDownloads as d (d.name)}
        {@const percent = getPercent(d)}
        {@const speed = d.downloadSpeed || 0}
        {@const remaining = (d.totalSize || 0) - (d.completedSize || 0)}
        <div class="tray-item">
          <div class="tray-item-top">
            <span class="tray-item-name" title={d.name}>{truncateName(d.name, 28)}</span>
            <span class="tray-item-pct">{percent}%</span>
          </div>
          <div class="pbar" style="height: 5px; min-width: 0">
            <div class="pfill active" style="width: {percent}%"></div>
          </div>
          <div class="tray-item-meta">
            <span class="spd">↓ {formatSpeed(speed)}</span>
            <span>{formatEta(remaining, speed)}</span>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Quick actions -->
  <div class="tray-actions">
    <button class="tray-act" onclick={addUrl}>
      <Icon name="add_link" size={16} /> Add URL
    </button>
    <button class="tray-act" onclick={pauseAll}>
      <Icon name="pause" size={16} /> Pause all
    </button>
    <button class="tray-act" onclick={resumeAll}>
      <Icon name="play_arrow" size={16} /> Resume all
    </button>
  </div>

  <!-- Footer -->
  <div class="tray-footer">
    <button class="btn btn-soft tray-open" onclick={openApp}>
      <Icon name="open_in_full" size={15} /> Open
    </button>
    <button class="btn btn-ghost tray-sq" onclick={openSettings} title="Settings">
      <Icon name="settings" size={15} />
    </button>
    <button class="btn btn-ghost tray-sq" onclick={quitApp} title="Quit">
      <Icon name="power_settings_new" size={15} />
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
    width: 320px;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1.5px solid var(--ink);
    box-shadow: 6px 6px 0 0 var(--hard);
    overflow: hidden;
    font-family: var(--font);
    color: var(--text);
    -webkit-font-smoothing: antialiased;
    user-select: none;
  }

  /* Header */
  .tray-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 13px 16px;
    background: var(--ink);
    color: var(--paper);
    border-bottom: 1.5px solid var(--ink);
  }
  .tray-brand {
    display: flex;
    align-items: center;
    gap: 9px;
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: -0.01em;
  }
  .tray-brand :global(.ms) {
    color: var(--signal);
  }
  .tray-speeds {
    display: flex;
    gap: 12px;
    font-family: var(--mono);
    font-size: 11.5px;
    font-weight: 700;
  }
  .tray-speeds .dn {
    color: var(--signal);
  }
  .tray-speeds .up {
    opacity: 0.7;
  }

  /* List */
  .tray-list {
    max-height: 280px;
    overflow-y: auto;
  }
  .tray-section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px 6px;
  }
  .tray-viewall {
    border: none;
    background: none;
    font-family: var(--mono);
    font-size: 9.5px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--signal-ink);
    padding: 0;
  }
  .tray-viewall:hover {
    text-decoration: underline;
  }

  .tray-empty {
    padding: 26px 16px;
    text-align: center;
    color: var(--text-3);
    font-family: var(--mono);
    font-size: 11.5px;
  }

  .tray-item {
    padding: 9px 16px;
    border-bottom: 1.5px solid var(--border);
  }
  .tray-item:last-child {
    border-bottom: none;
  }
  .tray-item-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-bottom: 7px;
  }
  .tray-item-name {
    font-family: var(--mono);
    font-size: 11.5px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .tray-item-pct {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 700;
    color: var(--signal-ink);
    flex: none;
  }
  .tray-item-meta {
    display: flex;
    justify-content: space-between;
    margin-top: 6px;
    font-family: var(--mono);
    font-size: 10px;
    color: var(--text-3);
  }
  .tray-item-meta .spd {
    color: var(--signal-ink);
    font-weight: 700;
  }

  /* Quick actions */
  .tray-actions {
    display: flex;
    border-top: 1.5px solid var(--ink);
  }
  .tray-act {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 9px 6px;
    border: none;
    border-right: 1.5px solid var(--ink);
    background: var(--surface);
    color: var(--text-2);
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    transition: all 0.1s;
  }
  .tray-act:last-child {
    border-right: none;
  }
  .tray-act:hover {
    background: var(--ink);
    color: var(--paper);
  }

  /* Footer */
  .tray-footer {
    display: flex;
    gap: 8px;
    padding: 10px 12px;
    border-top: 1.5px solid var(--ink);
    background: var(--surface-inset);
  }
  .tray-open {
    flex: 1;
    padding: 7px;
    font-size: 11px;
  }
  .tray-sq {
    padding: 7px 11px;
    font-size: 11px;
  }
</style>
