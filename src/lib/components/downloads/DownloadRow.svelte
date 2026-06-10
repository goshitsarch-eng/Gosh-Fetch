<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import StatusPill from '../ui/StatusPill.svelte';
  import type { PillVariant } from '../ui/StatusPill.svelte';
  import type { Download } from '../../types/download';
  import { formatBytes, formatSpeed, formatProgress, formatEta, formatDate, getStatusText } from '../../utils/format';
  import { downloads } from '../../stores/downloads.svelte';
  import { api } from '../../api/commands';
  import './DownloadRow.css';

  let {
    download,
    selected = false,
    onSelect,
    expanded = false,
    onExpand,
  }: {
    download: Download;
    selected?: boolean;
    onSelect?: (gid: string, selected: boolean) => void;
    expanded?: boolean;
    onExpand?: (gid: string) => void;
  } = $props();

  let showDeleteConfirm = $state(false);
  let deleteWithFiles = $state(false);
  let confirmModalEl = $state<HTMLDivElement | null>(null);

  const isTorrent = $derived(download.downloadType !== 'http');
  const isSeeding = $derived(
    download.status === 'active' &&
      isTorrent &&
      download.totalSize > 0 &&
      download.completedSize >= download.totalSize
  );

  const variant = $derived.by((): PillVariant => {
    if (isSeeding) return 'seed';
    switch (download.status) {
      case 'active':
        return 'active';
      case 'waiting':
        return 'queued';
      case 'paused':
        return 'paused';
      case 'complete':
        return 'done';
      case 'error':
        return 'error';
      default:
        return 'paused';
    }
  });

  const statusLabel = $derived(
    isSeeding ? 'Seeding' : getStatusText(download.status, download.downloadSpeed)
  );

  const progress = $derived(formatProgress(download.completedSize, download.totalSize));

  const eta = $derived(
    download.status === 'active' && download.downloadSpeed > 0
      ? formatEta(download.totalSize - download.completedSize, download.downloadSpeed)
      : null
  );

  const sourceDomain = $derived.by(() => {
    const url = download.url || download.magnetUri;
    if (!url) return null;
    if (url.startsWith('magnet:')) return 'magnet link';
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  });

  async function handlePause() {
    try { await downloads.pause(download.gid); } catch (e) { console.error('Failed to pause:', e); }
  }

  async function handleResume() {
    try { await downloads.resume(download.gid); } catch (e) { console.error('Failed to resume:', e); }
  }

  async function handleRemove() {
    try {
      await downloads.remove(download.gid, deleteWithFiles);
    } catch (e) {
      console.error('Failed to remove:', e);
    } finally {
      showDeleteConfirm = false;
      deleteWithFiles = false;
    }
  }

  async function handleOpenFolder() {
    try { await api.openDownloadFolder(download.savePath); } catch (e) { console.error('Failed to open folder:', e); }
  }

  function cancelDelete() {
    showDeleteConfirm = false;
    deleteWithFiles = false;
  }

  // Focus trap for the delete confirm modal
  $effect(() => {
    const modal = confirmModalEl;
    if (!modal) return;
    const focusable = modal.querySelectorAll<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();

    function trapFocus(e: KeyboardEvent) {
      if (e.key === 'Escape') { cancelDelete(); return; }
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }
    modal.addEventListener('keydown', trapFocus);
    return () => modal.removeEventListener('keydown', trapFocus);
  });
</script>

<div class="dl-row" class:sel={selected}>
  {#if onSelect}
    <button
      class="dl-check"
      class:on={selected}
      onclick={() => onSelect?.(download.gid, !selected)}
      aria-label={`Select ${download.name}`}
    >
      <Icon name="check" size={13} />
    </button>
  {:else}
    <span></span>
  {/if}

  <div
    class="dl-main"
    onclick={() => onExpand?.(download.gid)}
    onkeydown={(e) => e.key === 'Enter' && onExpand?.(download.gid)}
    role="button"
    tabindex="0"
  >
    <div class="dl-name">
      <span class="dl-glyph">
        <Icon name={isTorrent ? 'hub' : 'public'} fill={download.status === 'active'} size={17} />
      </span>
      <span class="dl-name-text" title={download.name}>{download.name}</span>
      <span class="dl-type">{isTorrent ? 'BT' : 'HTTP'}</span>
    </div>
    <div class="dl-meta">
      <div class="pbar"><div class="pfill {variant}" style="width: {isSeeding ? 100 : progress}%"></div></div>
      <span class="pct">{isSeeding ? 100 : progress}%</span>
      <div class="dl-stats">
        {#if download.status === 'error' && download.errorMessage}
          <span class="err" title={download.errorMessage}>! {download.errorMessage}</span>
        {:else if isSeeding}
          <span>{download.seeders} seeders · <span class="up">↑ {formatSpeed(download.uploadSpeed)}</span></span>
        {:else if download.status === 'active' && sourceDomain}
          <span>{sourceDomain}</span>
        {:else}
          <span class="path" title={download.savePath}>{download.savePath}</span>
        {/if}
      </div>
    </div>
  </div>

  <div class="dl-col">
    <div class="big">{download.totalSize > 0 ? formatBytes(download.totalSize) : '—'}</div>
    <div class="sml">
      {download.status === 'complete' || isSeeding ? 'complete' : `${formatBytes(download.completedSize)} got`}
    </div>
  </div>

  <div class="dl-col">
    {#if isSeeding}
      <div class="big lime">↑ {formatSpeed(download.uploadSpeed)}</div>
      <div class="sml">seeding</div>
    {:else if download.status === 'active'}
      <div class="big spd">↓ {formatSpeed(download.downloadSpeed)}</div>
      <div class="sml">{eta ? `${eta} left` : 'stalled'}</div>
    {:else}
      <div class="big spd idle">—</div>
      <div class="sml">{download.status === 'waiting' ? 'in queue' : 'stopped'}</div>
    {/if}
  </div>

  <div><StatusPill {variant} label={statusLabel} /></div>

  <div class="dl-expand">
    <button onclick={() => onExpand?.(download.gid)} title="Details" aria-label="Toggle details">
      <Icon name={expanded ? 'expand_less' : 'expand_more'} />
    </button>
  </div>

  <div class="dl-actions">
    {#if download.status === 'active' && !isSeeding}
      <button class="act" title="Pause" onclick={handlePause}><Icon name="pause" /></button>
    {/if}
    {#if download.status === 'paused' || download.status === 'waiting'}
      <button class="act go" title="Resume" onclick={handleResume}><Icon name="play_arrow" /></button>
    {/if}
    {#if download.status === 'error'}
      <button class="act go" title="Retry" onclick={handleResume}><Icon name="refresh" /></button>
    {/if}
    {#if isSeeding}
      <button class="act" title="Stop seeding" onclick={handlePause}><Icon name="stop" /></button>
    {/if}
    <button class="act" title="Open folder" onclick={handleOpenFolder}><Icon name="folder_open" /></button>
    <button class="act danger" title="Remove" onclick={() => (showDeleteConfirm = true)}><Icon name="delete" /></button>
  </div>

  {#if expanded}
    <div class="dl-detail">
      <div class="detail-cell">
        <div class="k">Save to</div>
        <div class="v" title={download.savePath}>{download.savePath}</div>
      </div>
      <div class="detail-cell">
        <div class="k">{isTorrent ? 'Seeders' : 'Connections'}</div>
        <div class="v">{isTorrent ? download.seeders : `${download.connections} active`}</div>
      </div>
      <div class="detail-cell">
        <div class="k">Added</div>
        <div class="v">{formatDate(download.createdAt)}</div>
      </div>
      <div class="detail-cell">
        <div class="k">Source</div>
        <div class="v" title={download.url ?? download.magnetUri ?? undefined}>{sourceDomain ?? '—'}</div>
      </div>
    </div>
  {/if}
</div>

{#if showDeleteConfirm}
  <div
    class="scrim"
    onclick={(e) => e.target === e.currentTarget && cancelDelete()}
    onkeydown={(e) => e.key === 'Escape' && cancelDelete()}
    role="presentation"
  >
    <div
      class="modal"
      bind:this={confirmModalEl}
      style="max-width: 440px"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-confirm-title"
    >
      <div class="modal-head">
        <div class="dl-icon"><Icon name="delete" size={19} /></div>
        <div style="flex: 1">
          <div class="ttl" id="delete-confirm-title">Remove Download</div>
          <div class="sub">{download.name}</div>
        </div>
        <button class="icon-btn" onclick={cancelDelete} aria-label="Close"><Icon name="close" /></button>
      </div>
      <div class="modal-body">
        <p style="margin: 0; font-size: 13px">Are you sure you want to remove this download?</p>
        <div class="set-row" style="padding: 4px 0; border: none">
          <div class="set-info"><div class="t" style="font-size: 13px">Also delete downloaded files</div></div>
          <button
            class="switch"
            class:on={deleteWithFiles}
            onclick={() => (deleteWithFiles = !deleteWithFiles)}
            aria-pressed={deleteWithFiles}
            aria-label="Also delete downloaded files"
          ><i></i></button>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" onclick={cancelDelete}>Cancel</button>
        <div class="sp"></div>
        <button class="btn btn-danger" onclick={handleRemove}><Icon name="delete" size={17} /> Remove</button>
      </div>
    </div>
  </div>
{/if}
