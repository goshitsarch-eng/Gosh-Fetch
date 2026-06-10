<script lang="ts">
  import type { Download } from '../../types/download';
  import { formatBytes, formatSpeed, formatProgress, formatEta, getFileExtension } from '../../utils/format';
  import { downloads } from '../../stores/downloads.svelte';
  import { api } from '../../api/commands';
  import './DownloadCard.css';

  let {
    download,
    selected,
    onSelect,
  }: {
    download: Download;
    selected?: boolean;
    onSelect?: (gid: string, selected: boolean) => void;
  } = $props();

  let showDeleteConfirm = $state(false);
  let deleteWithFiles = $state(false);
  let confirmModalEl = $state<HTMLDivElement | null>(null);

  function getTypeIcon(download: Download): string {
    if (download.downloadType === 'torrent' || download.downloadType === 'magnet') return 'hub';
    const ext = getFileExtension(download.name);
    if (['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v'].includes(ext)) return 'movie';
    if (['mp3', 'flac', 'wav', 'aac', 'ogg', 'wma', 'm4a', 'opus'].includes(ext)) return 'music_note';
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'rtf', 'odt', 'epub'].includes(ext)) return 'description';
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico', 'tiff', 'psd', 'raw'].includes(ext)) return 'image';
    if (['zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'zst'].includes(ext)) return 'folder_zip';
    if (['exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm', 'appimage'].includes(ext)) return 'terminal';
    if (['iso'].includes(ext)) return 'folder_zip';
    return 'download';
  }

  function getTypeBadge(download: Download): { label: string; className: string } | null {
    if (download.downloadType === 'torrent' || download.downloadType === 'magnet') return { label: 'TORRENT', className: 'card-badge purple' };
    const ext = getFileExtension(download.name);
    if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext)) return { label: ext.toUpperCase(), className: 'card-badge blue' };
    if (['mp3', 'flac', 'wav', 'aac', 'ogg'].includes(ext)) return { label: ext.toUpperCase(), className: 'card-badge blue' };
    if (['iso'].includes(ext)) return { label: 'ISO', className: 'card-badge orange' };
    if (['zip', 'tar', 'gz', '7z', 'rar', 'xz'].includes(ext)) return { label: ext === 'gz' ? 'ARCHIVE' : ext.toUpperCase(), className: 'card-badge purple' };
    if (['deb', 'rpm', 'appimage', 'exe', 'msi', 'dmg'].includes(ext)) return { label: ext.toUpperCase(), className: 'card-badge green' };
    if (['pdf', 'doc', 'docx'].includes(ext)) return { label: ext.toUpperCase(), className: 'card-badge blue' };
    return null;
  }

  function getIconColorClass(download: Download): string {
    if (download.status === 'error') return 'icon-red';
    if (download.downloadType === 'torrent' || download.downloadType === 'magnet') return 'icon-purple';
    const ext = getFileExtension(download.name);
    if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v'].includes(ext)) return 'icon-blue';
    if (['iso', 'zip', 'tar', 'gz', '7z', 'rar'].includes(ext)) return 'icon-orange';
    if (['deb', 'rpm', 'appimage', 'exe', 'msi'].includes(ext)) return 'icon-purple';
    return 'icon-blue';
  }

  function getStripeColor(download: Download): string {
    if (download.status === 'error') return 'var(--color-destructive)';
    const ext = getFileExtension(download.name);
    if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v'].includes(ext)) return 'var(--color-success)';
    if (download.downloadType === 'torrent' || download.downloadType === 'magnet') return 'var(--icon-color-purple)';
    if (['iso', 'zip', 'tar', 'gz', '7z', 'rar'].includes(ext)) return 'var(--icon-color-orange)';
    return 'var(--color-primary)';
  }

  function getSourceDomain(download: Download): string | null {
    const url = download.url || download.magnetUri;
    if (!url) return null;
    if (url.startsWith('magnet:')) return 'magnet link';
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }

  let progress = $derived(formatProgress(download.completedSize, download.totalSize));
  let eta = $derived(
    download.status === 'active' && download.downloadSpeed > 0
      ? formatEta(download.totalSize - download.completedSize, download.downloadSpeed)
      : null
  );
  let typeBadge = $derived(getTypeBadge(download));
  let sourceDomain = $derived(getSourceDomain(download));

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

<div class={`download-card${selected ? ' selected' : ''}`}>
  <!-- Top progress stripe -->
  <div class="card-stripe">
    <div
      class="card-stripe-fill"
      style={`width: ${progress}%; background: ${getStripeColor(download)}`}
    ></div>
  </div>

  <div class="card-body">
    <!-- Icon -->
    <div class={`card-type-icon ${getIconColorClass(download)}`}>
      <span class="material-symbols-outlined">{getTypeIcon(download)}</span>
    </div>

    <!-- Info area -->
    <div class="card-info">
      <!-- Row 1: Name + hover actions -->
      <div class="card-row-top">
        <h3 class="card-name" title={download.name}>{download.name}</h3>
        <div class="card-actions">
          {#if download.status === 'active' || download.status === 'waiting'}
            <button class="card-action-btn" onclick={handlePause} title="Pause" aria-label="Pause download">
              <span class="material-symbols-outlined">pause</span>
            </button>
          {/if}
          {#if download.status === 'paused'}
            <button class="card-action-btn" onclick={handleResume} title="Resume" aria-label="Resume download">
              <span class="material-symbols-outlined">play_arrow</span>
            </button>
          {/if}
          {#if download.status === 'error'}
            <button class="card-action-btn" onclick={handleResume} title="Retry" aria-label="Retry download">
              <span class="material-symbols-outlined">refresh</span>
            </button>
          {/if}
          <button class="card-action-btn danger" onclick={() => (showDeleteConfirm = true)} title="Remove" aria-label="Remove download">
            <span class="material-symbols-outlined">close</span>
          </button>
          <button class="card-action-btn" onclick={handleOpenFolder} title="Open folder" aria-label="Open folder">
            <span class="material-symbols-outlined">folder_open</span>
          </button>
        </div>
      </div>

      <!-- Row 2: Badge + source domain -->
      <div class="card-meta">
        {#if typeBadge}<span class={typeBadge.className}>{typeBadge.label}</span>{/if}
        {#if sourceDomain}
          {#if typeBadge}<span class="meta-dot">&bull;</span>{/if}
          <span class="meta-domain">{sourceDomain}</span>
        {/if}
      </div>

      <!-- Row 3: Progress bar + size -->
      <div class="card-progress-area">
        <div class="card-progress-main">
          <div class="card-progress-labels">
            <span class="progress-size">
              {formatBytes(download.completedSize)} <span class="progress-size-total">of {formatBytes(download.totalSize)}</span>
            </span>
            <span class="progress-percent" style={`color: ${getStripeColor(download)}`}>{progress}%</span>
          </div>
          <div class="progress">
            <div class="progress-bar" style={`width: ${progress}%`}></div>
          </div>
        </div>

        <!-- Speed + ETA -->
        {#if download.status === 'active'}
          <div class="card-speed-area">
            <span class="speed-value">{formatSpeed(download.downloadSpeed)}</span>
            {#if eta}<span class="speed-eta">ETA: {eta}</span>{/if}
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Checkbox overlay -->
  {#if onSelect}
    <label class="card-checkbox" onclick={(e) => e.stopPropagation()}>
      <input
        type="checkbox"
        checked={selected || false}
        onchange={(e) => onSelect?.(download.gid, e.currentTarget.checked)}
        aria-label={`Select ${download.name}`}
      />
    </label>
  {/if}
</div>

{#if showDeleteConfirm}
  <div class="modal-backdrop" onclick={cancelDelete} role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title">
    <div class="modal" onclick={(e) => e.stopPropagation()} bind:this={confirmModalEl} style="max-width: 440px">
      <div class="modal-header">
        <h3 class="modal-title" id="delete-confirm-title">Remove Download</h3>
        <button class="btn btn-ghost btn-icon" onclick={cancelDelete} aria-label="Close">
          <span class="material-symbols-outlined" style="font-size: 16px">close</span>
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
        <button class="btn btn-secondary" onclick={cancelDelete}>Cancel</button>
        <button class="btn btn-destructive" onclick={handleRemove}>Remove</button>
      </div>
    </div>
  </div>
{/if}
