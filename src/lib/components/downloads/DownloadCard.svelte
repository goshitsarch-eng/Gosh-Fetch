<script lang="ts">
  import type { Download } from '../../types/download';
  import { formatBytes, formatSpeed, formatProgress, formatEta, getStatusColor, getStatusText } from '../../utils/format';
  import { pauseDownload, resumeDownload, removeDownload } from '../../stores/downloads.svelte';
  import { invoke } from '@tauri-apps/api/core';

  interface Props {
    download: Download;
  }

  let { download }: Props = $props();
  let showDeleteConfirm = $state(false);
  let deleteWithFiles = $state(false);

  const progress = $derived(formatProgress(download.completedSize, download.totalSize));
  const eta = $derived(
    download.status === 'active' && download.downloadSpeed > 0
      ? formatEta(download.totalSize - download.completedSize, download.downloadSpeed)
      : null
  );

  async function handlePause() {
    try {
      await pauseDownload(download.gid);
    } catch (e) {
      console.error('Failed to pause download:', e);
    }
  }

  async function handleResume() {
    try {
      await resumeDownload(download.gid);
    } catch (e) {
      console.error('Failed to resume download:', e);
    }
  }

  async function handleRemove() {
    try {
      await removeDownload(download.gid, deleteWithFiles);
    } catch (e) {
      console.error('Failed to remove download:', e);
    } finally {
      showDeleteConfirm = false;
      deleteWithFiles = false;
    }
  }

  async function handleOpenFolder() {
    try {
      await invoke('open_file_location', { filePath: download.savePath });
    } catch (e) {
      console.error('Failed to open folder:', e);
    }
  }

  function getTypeIcon(type: string): string {
    switch (type) {
      case 'torrent':
      case 'magnet':
        return '🧲';
      case 'ftp':
        return '📁';
      default:
        return '🔗';
    }
  }
</script>

<div class="download-card">
  <div class="card-main">
    <div class="card-icon">
      {getTypeIcon(download.downloadType)}
    </div>

    <div class="card-content">
      <div class="card-header">
        <span class="card-name" title={download.name}>{download.name}</span>
        <span class="card-status" style="color: {getStatusColor(download.status)}">
          {getStatusText(download.status, download.downloadSpeed)}
        </span>
      </div>

      <div class="progress-container">
        <div class="progress">
          <div class="progress-bar" style="width: {progress}%"></div>
        </div>
        <span class="progress-text">{progress}%</span>
      </div>

      <div class="card-info">
        <span class="info-size">
          {formatBytes(download.completedSize)} / {formatBytes(download.totalSize)}
        </span>

        {#if download.status === 'active'}
          <span class="info-speed">
            ↓ {formatSpeed(download.downloadSpeed)}
            {#if download.downloadType === 'torrent' || download.downloadType === 'magnet'}
              <span class="upload-speed">↑ {formatSpeed(download.uploadSpeed)}</span>
            {/if}
          </span>

          {#if eta}
            <span class="info-eta">ETA: {eta}</span>
          {/if}
        {/if}

        {#if (download.downloadType === 'torrent' || download.downloadType === 'magnet') && download.status === 'active'}
          <span class="info-peers">
            {download.seeders} seeders · {download.connections} peers
          </span>
        {/if}
      </div>
    </div>
  </div>

  <div class="card-actions">
    {#if download.status === 'active' || download.status === 'waiting'}
      <button class="btn btn-ghost btn-icon" onclick={handlePause} title="Pause">
        ⏸
      </button>
    {:else if download.status === 'paused'}
      <button class="btn btn-ghost btn-icon" onclick={handleResume} title="Resume">
        ▶
      </button>
    {/if}

    {#if download.status === 'complete'}
      <button class="btn btn-ghost btn-icon" onclick={handleOpenFolder} title="Open folder">
        📂
      </button>
    {/if}

    <button
      class="btn btn-ghost btn-icon"
      onclick={() => (showDeleteConfirm = true)}
      title="Remove"
    >
      🗑
    </button>
  </div>
</div>

{#if showDeleteConfirm}
  <div class="modal-backdrop" onclick={() => (showDeleteConfirm = false)}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h3 class="modal-title">Remove Download</h3>
        <button class="btn btn-ghost btn-icon" onclick={() => (showDeleteConfirm = false)}>
          ✕
        </button>
      </div>
      <div class="modal-body">
        <p>Are you sure you want to remove "{download.name}"?</p>
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={deleteWithFiles} />
          <span>Also delete downloaded files</span>
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick={() => (showDeleteConfirm = false)}>
          Cancel
        </button>
        <button class="btn btn-destructive" onclick={handleRemove}>
          Remove
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .download-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-md);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    transition: border-color var(--transition-fast);
  }

  .download-card:hover {
    border-color: var(--border-primary);
  }

  .card-main {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
    flex: 1;
    min-width: 0;
  }

  .card-icon {
    font-size: 24px;
    flex-shrink: 0;
  }

  .card-content {
    flex: 1;
    min-width: 0;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    margin-bottom: var(--space-sm);
  }

  .card-name {
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-status {
    font-size: 12px;
    font-weight: 500;
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .progress-container {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
  }

  .progress {
    flex: 1;
  }

  .progress-text {
    font-size: 12px;
    font-family: var(--font-mono);
    color: var(--text-secondary);
    min-width: 40px;
    text-align: right;
  }

  .card-info {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-md);
    font-size: 12px;
    color: var(--text-muted);
  }

  .info-speed {
    color: var(--color-success);
  }

  .upload-speed {
    margin-left: var(--space-sm);
    color: var(--color-info);
  }

  .info-eta {
    color: var(--text-secondary);
  }

  .card-actions {
    display: flex;
    gap: var(--space-xs);
    margin-left: var(--space-md);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-top: var(--space-md);
    cursor: pointer;
  }

  .checkbox-label span {
    font-size: 14px;
    color: var(--text-secondary);
  }
</style>
