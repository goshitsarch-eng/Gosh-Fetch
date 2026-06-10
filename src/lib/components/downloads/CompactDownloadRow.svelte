<script lang="ts">
  import type { Download } from '../../types/download';
  import { formatBytes } from '../../utils/format';
  import { downloads } from '../../stores/downloads.svelte';
  import { api } from '../../api/commands';
  import './CompactDownloadRow.css';

  let {
    download,
    selected,
    onSelect,
  }: {
    download: Download;
    selected?: boolean;
    onSelect?: (gid: string, selected: boolean) => void;
  } = $props();

  let showConfirm = $state(false);

  function getCompactIcon(download: Download): { icon: string; className: string } {
    if (download.status === 'paused') return { icon: 'pause', className: 'compact-icon muted' };
    if (download.status === 'error') return { icon: 'error', className: 'compact-icon error' };
    if (download.status === 'complete') return { icon: 'check', className: 'compact-icon success' };
    return { icon: 'download', className: 'compact-icon muted' };
  }

  function getCompactMeta(download: Download): string {
    if (download.status === 'paused') {
      return `Paused • ${formatBytes(download.completedSize)} of ${formatBytes(download.totalSize)}`;
    }
    if (download.status === 'error') {
      return `Error • ${download.errorMessage || 'Download failed'}`;
    }
    if (download.status === 'complete') {
      const when = download.completedAt
        ? `Completed ${new Date(download.completedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
        : 'Completed';
      return `${when} • ${formatBytes(download.totalSize)}`;
    }
    return formatBytes(download.totalSize);
  }

  let iconInfo = $derived(getCompactIcon(download));
  let meta = $derived(getCompactMeta(download));

  async function handleResume() {
    try { await downloads.resume(download.gid); } catch { /* ignore */ }
  }

  async function handleRemove() {
    try { await downloads.remove(download.gid); } catch { /* ignore */ }
    showConfirm = false;
  }

  async function handleOpenFolder() {
    try { await api.openDownloadFolder(download.savePath); } catch { /* ignore */ }
  }
</script>

<div class={`compact-row${selected ? ' selected' : ''}${download.status === 'paused' ? ' is-paused' : ''}`}>
  {#if onSelect}
    <label class="compact-checkbox" onclick={(e) => e.stopPropagation()}>
      <input
        type="checkbox"
        checked={selected || false}
        onchange={(e) => onSelect?.(download.gid, e.currentTarget.checked)}
        aria-label={`Select ${download.name}`}
      />
    </label>
  {/if}
  <div class={iconInfo.className}>
    <span class="material-symbols-outlined">{iconInfo.icon}</span>
  </div>
  <div class="compact-info">
    <h3 class={`compact-name${download.status === 'complete' ? ' completed-strike' : ''}`} title={download.name}>
      {download.name}
    </h3>
    <p class="compact-meta">{meta}</p>
  </div>
  <div class="compact-actions">
    {#if download.status === 'paused'}
      <button class="compact-action-btn primary" onclick={handleResume} title="Resume">
        <span class="material-symbols-outlined">play_arrow</span>
      </button>
    {/if}
    {#if download.status === 'error'}
      <button class="compact-action-btn primary" onclick={handleResume} title="Retry">
        <span class="material-symbols-outlined">refresh</span>
      </button>
    {/if}
    {#if download.status === 'complete'}
      <button class="compact-action-btn" onclick={handleOpenFolder} title="Open Folder">
        <span class="material-symbols-outlined">folder</span>
      </button>
    {/if}
    {#if showConfirm}
      <button class="compact-action-btn danger" onclick={handleRemove} title="Confirm remove">
        <span class="material-symbols-outlined">check</span>
      </button>
      <button class="compact-action-btn" onclick={() => (showConfirm = false)} title="Cancel">
        <span class="material-symbols-outlined">close</span>
      </button>
    {:else}
      <button class="compact-action-btn" onclick={() => (showConfirm = true)} title="Remove">
        <span class="material-symbols-outlined">close</span>
      </button>
    {/if}
  </div>
</div>
