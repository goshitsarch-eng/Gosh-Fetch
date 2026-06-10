<script lang="ts">
  import Icon from '../lib/components/ui/Icon.svelte';
  import { downloads } from '../lib/stores/downloads.svelte';
  import { ui } from '../lib/stores/ui.svelte';
  import { formatBytes, formatDate, getFileExtension } from '../lib/utils/format';
  import { api } from '../lib/api/commands';
  import type { Download } from '../lib/types/download';
  import './History.css';

  type CategoryFilter = 'all' | 'documents' | 'software' | 'media' | 'torrents';

  const FILTERS: { key: CategoryFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'documents', label: 'Documents' },
    { key: 'software', label: 'Software' },
    { key: 'media', label: 'Media' },
    { key: 'torrents', label: 'Torrents' },
  ];

  const DOC_EXTS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'csv', 'odt', 'ods', 'odp', 'epub']);
  const SOFTWARE_EXTS = new Set(['exe', 'msi', 'dmg', 'deb', 'rpm', 'appimage', 'sh', 'bat', 'jar', 'apk', 'snap', 'flatpak', 'iso']);
  const MEDIA_EXTS = new Set([
    'mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm',
    'mp3', 'flac', 'wav', 'ogg', 'aac', 'm4a',
    'jpg', 'jpeg', 'png', 'gif', 'svg', 'bmp', 'webp',
  ]);

  const ARCHIVE_EXTS = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'zst']);
  const VIDEO_EXTS = new Set(['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm']);
  const AUDIO_EXTS = new Set(['mp3', 'flac', 'wav', 'ogg', 'aac', 'm4a']);
  const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'svg', 'bmp', 'webp']);
  const SCRIPT_EXTS = new Set(['sh', 'bat', 'py', 'js', 'ts', 'rb', 'pl']);

  function getFileCategory(download: Download): CategoryFilter {
    if (download.downloadType === 'torrent' || download.downloadType === 'magnet') return 'torrents';
    const ext = getFileExtension(download.name);
    if (DOC_EXTS.has(ext)) return 'documents';
    if (SOFTWARE_EXTS.has(ext)) return 'software';
    if (MEDIA_EXTS.has(ext)) return 'media';
    return 'all';
  }

  function getFileTypeIcon(download: Download): string {
    if (download.downloadType === 'torrent' || download.downloadType === 'magnet') return 'hub';
    const ext = getFileExtension(download.name);
    if (ext === 'iso') return 'album';
    if (DOC_EXTS.has(ext)) return 'description';
    if (VIDEO_EXTS.has(ext)) return 'movie';
    if (ARCHIVE_EXTS.has(ext)) return 'folder_zip';
    if (AUDIO_EXTS.has(ext)) return 'music_note';
    if (IMAGE_EXTS.has(ext)) return 'image';
    if (SCRIPT_EXTS.has(ext)) return 'terminal';
    if (SOFTWARE_EXTS.has(ext)) return 'apps';
    return 'draft';
  }

  function getSourceDomain(download: Download): string {
    if (download.url) {
      try {
        const url = new URL(download.url);
        return url.hostname;
      } catch { /* ignore */ }
    }
    if (download.downloadType === 'magnet' || download.downloadType === 'torrent') {
      return 'torrent';
    }
    return download.savePath || '';
  }

  function joinPath(basePath: string, fileName: string): string {
    if (!basePath) return fileName;
    if (basePath.endsWith('/') || basePath.endsWith('\\')) {
      return `${basePath}${fileName}`;
    }
    const separator = basePath.includes('\\') ? '\\' : '/';
    return `${basePath}${separator}${fileName}`;
  }

  let activeFilter = $state<CategoryFilter>('all');
  let showClearConfirm = $state(false);
  let isClearing = $state(false);

  $effect(() => {
    void downloads.loadCompletedHistory();
    void downloads.fetchDownloads();
    const interval = setInterval(() => void downloads.fetchDownloads(), 10000);
    return () => clearInterval(interval);
  });

  const filteredDownloads = $derived.by(() => {
    let items = downloads.completed;

    const q = ui.searchQuery.trim().toLowerCase();
    if (q) {
      items = items.filter((d) => d.name.toLowerCase().includes(q));
    }

    if (activeFilter !== 'all') {
      items = items.filter((d) => {
        const cat = getFileCategory(d);
        return cat === activeFilter || cat === 'all';
      });
    }

    return items;
  });

  async function handleClearHistory() {
    isClearing = true;
    await downloads.clearHistory();
    isClearing = false;
    showClearConfirm = false;
  }

  async function handleDeleteItem(gid: string) {
    await downloads.remove(gid);
    void downloads.loadCompletedHistory();
  }

  async function handleOpenFolder(download: Download) {
    try {
      await api.openDownloadFolder(download.savePath);
    } catch (e) {
      console.error('Failed to open folder:', e);
    }
  }

  async function handleOpenFile(download: Download) {
    const filePath = joinPath(download.savePath, download.name);
    try {
      await api.openFileLocation(filePath);
    } catch (e) {
      try {
        await api.openDownloadFolder(download.savePath);
      } catch {
        console.error('Failed to open file:', e);
      }
    }
  }
</script>

<div class="content page-fade">
  <div class="content-inner">
    <div class="toolbar">
      <div class="chips">
        {#each FILTERS as f (f.key)}
          <button class="chip" class:active={activeFilter === f.key} onclick={() => (activeFilter = f.key)}>
            {f.label}
          </button>
        {/each}
      </div>
      <div class="toolbar-spacer"></div>
    </div>

    {#if filteredDownloads.length === 0}
      <div class="empty">
        <Icon name="history" />
        <h3>{downloads.completed.length === 0 ? 'No download history' : 'No matches'}</h3>
        <p>
          {downloads.completed.length === 0
            ? 'Completed downloads will appear here.'
            : 'Try adjusting your search or filters.'}
        </p>
      </div>
    {:else}
      <div class="card">
        <div class="hist-head">
          <Icon name="history" size={19} style="color: var(--text-3)" />
          <b>Completed downloads</b>
          <span class="hist-count">{filteredDownloads.length} of {downloads.completed.length} items</span>
          <button class="btn btn-ghost" onclick={() => (showClearConfirm = true)}>
            <Icon name="delete_sweep" size={17} /> Clear
          </button>
        </div>
        {#each filteredDownloads as download (download.gid)}
          {@const isTorrent = download.downloadType !== 'http'}
          <div class="hist-row">
            <div class="dl-icon {isTorrent ? 'torrent' : 'http'}">
              <Icon name={getFileTypeIcon(download)} size={19} />
            </div>
            <div class="hist-info">
              <div class="hist-name" title={download.name}>{download.name}</div>
              <div class="hist-meta">
                {download.completedAt ? formatDate(download.completedAt) : formatDate(download.createdAt)}
                · {formatBytes(download.totalSize)}
                · {getSourceDomain(download)}
              </div>
            </div>
            <div class="hist-actions">
              <button class="act go" title="Open file" onclick={() => handleOpenFile(download)}>
                <Icon name="open_in_new" />
              </button>
              <button class="act" title="Open folder" onclick={() => handleOpenFolder(download)}>
                <Icon name="folder_open" />
              </button>
              <button class="act danger" title="Remove from history" onclick={() => handleDeleteItem(download.gid)}>
                <Icon name="close" />
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  {#if showClearConfirm}
    <div
      class="scrim"
      onclick={(e) => e.target === e.currentTarget && (showClearConfirm = false)}
      onkeydown={(e) => e.key === 'Escape' && (showClearConfirm = false)}
      role="presentation"
    >
      <div class="modal" style="max-width: 440px" role="dialog" aria-modal="true" aria-labelledby="clear-history-title">
        <div class="modal-head">
          <div class="dl-icon"><Icon name="delete_sweep" size={19} /></div>
          <div style="flex: 1">
            <div class="ttl" id="clear-history-title">Clear History</div>
          </div>
          <button class="icon-btn" onclick={() => (showClearConfirm = false)} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div class="modal-body">
          <p style="margin: 0; font-size: 13px; line-height: 1.55">
            Are you sure you want to clear download history? This will not delete the downloaded files.
          </p>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" onclick={() => (showClearConfirm = false)}>Cancel</button>
          <div class="sp"></div>
          <button class="btn btn-danger" onclick={handleClearHistory} disabled={isClearing}>
            {isClearing ? 'Clearing…' : 'Clear history'}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
