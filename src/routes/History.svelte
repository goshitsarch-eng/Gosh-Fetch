<script lang="ts">
  import { downloads } from '../lib/stores/downloads.svelte';
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

  function getFileTypeIcon(download: Download): { icon: string; colorClass: string } {
    if (download.downloadType === 'torrent' || download.downloadType === 'magnet') {
      return { icon: 'cloud_download', colorClass: 'violet' };
    }
    const ext = getFileExtension(download.name);
    if (ext === 'iso') return { icon: 'album', colorClass: 'orange' };
    if (DOC_EXTS.has(ext)) return { icon: 'description', colorClass: 'blue' };
    if (VIDEO_EXTS.has(ext)) return { icon: 'movie', colorClass: 'purple' };
    if (ARCHIVE_EXTS.has(ext)) return { icon: 'folder_zip', colorClass: 'emerald' };
    if (AUDIO_EXTS.has(ext)) return { icon: 'music_note', colorClass: 'pink' };
    if (IMAGE_EXTS.has(ext)) return { icon: 'image', colorClass: 'rose' };
    if (SCRIPT_EXTS.has(ext)) return { icon: 'terminal', colorClass: 'sky' };
    if (SOFTWARE_EXTS.has(ext)) return { icon: 'apps', colorClass: 'indigo' };
    return { icon: 'insert_drive_file', colorClass: 'slate' };
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

  function getStatusBadge(download: Download): { label: string; className: string; icon: string | null } {
    if (download.status === 'complete') {
      return { label: 'Valid', className: 'complete', icon: 'verified' };
    }
    if (download.status === 'error') {
      return { label: 'Error', className: 'error', icon: 'error' };
    }
    return { label: 'N/A', className: 'na', icon: null };
  }

  function joinPath(basePath: string, fileName: string): string {
    if (!basePath) return fileName;
    if (basePath.endsWith('/') || basePath.endsWith('\\')) {
      return `${basePath}${fileName}`;
    }
    const separator = basePath.includes('\\') ? '\\' : '/';
    return `${basePath}${separator}${fileName}`;
  }

  let searchQuery = $state('');
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

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
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

<div class="history-page">
  <header class="history-header">
    <div class="history-header-top">
      <div>
        <h2>Download History</h2>
        <p>Manage and review your completed downloads.</p>
      </div>
      {#if downloads.completed.length > 0}
        <button class="btn-clear-history" onclick={() => (showClearConfirm = true)}>
          <span class="material-symbols-outlined">delete_sweep</span>
          Clear History
        </button>
      {/if}
    </div>
    <div class="history-toolbar">
      <div class="history-search">
        <span class="material-symbols-outlined search-icon">search</span>
        <input
          type="text"
          placeholder="Search filenames, types, or checksums..."
          bind:value={searchQuery}
        />
      </div>
      <div class="history-filters">
        {#each FILTERS as f (f.key)}
          <button
            class="filter-pill{activeFilter === f.key ? ' active' : ''}"
            onclick={() => (activeFilter = f.key)}
          >
            {f.label}
          </button>
        {/each}
      </div>
    </div>
  </header>

  <div class="history-table-container">
    {#if filteredDownloads.length === 0}
      <div class="history-empty">
        <span class="material-symbols-outlined">history</span>
        <h3>{downloads.completed.length === 0 ? 'No download history' : 'No matching downloads'}</h3>
        <p>{downloads.completed.length === 0 ? 'Completed downloads will appear here.' : 'Try adjusting your search or filters.'}</p>
      </div>
    {:else}
      <div class="history-table-wrapper">
        <table class="history-table">
          <thead>
            <tr>
              <th class="col-type">Type</th>
              <th>Filename</th>
              <th class="col-size">Size</th>
              <th class="col-date">Date</th>
              <th class="col-status">Status</th>
              <th class="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredDownloads as download (download.gid)}
              {@const typeIcon = getFileTypeIcon(download)}
              {@const source = getSourceDomain(download)}
              {@const status = getStatusBadge(download)}
              <tr>
                <td>
                  <div class="history-type-icon {typeIcon.colorClass}">
                    <span class="material-symbols-outlined">{typeIcon.icon}</span>
                  </div>
                </td>
                <td>
                  <div class="history-filename">
                    <span class="history-filename-name" title={download.name}>{download.name}</span>
                    <span class="history-filename-source" title={source}>{source}</span>
                  </div>
                </td>
                <td><span class="history-size">{formatBytes(download.totalSize)}</span></td>
                <td><span class="history-date">{download.completedAt ? formatDate(download.completedAt) : formatDate(download.createdAt)}</span></td>
                <td style="text-align: center">
                  <span class="history-status-badge {status.className}">
                    {#if status.icon}
                      <span class="material-symbols-outlined">{status.icon}</span>
                    {/if}
                    {status.label}
                  </span>
                </td>
                <td>
                  <div class="history-actions">
                    <button class="history-action-btn" onclick={() => handleOpenFolder(download)} title="Open Folder">
                      <span class="material-symbols-outlined">folder</span>
                    </button>
                    <button class="history-action-btn" onclick={() => handleOpenFile(download)} title="Open File">
                      <span class="material-symbols-outlined">open_in_new</span>
                    </button>
                    <button class="history-action-btn delete" onclick={() => handleDeleteItem(download.gid)} title="Delete">
                      <span class="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="history-count">
        Showing {filteredDownloads.length} of {downloads.completed.length} items
      </div>
    {/if}
  </div>

  {#if showClearConfirm}
    <div
      class="modal-backdrop"
      onclick={() => (showClearConfirm = false)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="clear-history-title"
    >
      <div class="modal" onclick={(e) => e.stopPropagation()} style="max-width: 440px" role="document">
        <div class="modal-header">
          <h3 class="modal-title" id="clear-history-title">Clear History</h3>
        </div>
        <div class="modal-body">
          <p>Are you sure you want to clear download history? This will not delete the downloaded files.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick={() => (showClearConfirm = false)}>Cancel</button>
          <button class="btn btn-destructive" onclick={handleClearHistory} disabled={isClearing}>
            {isClearing ? 'Clearing...' : 'Clear History'}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
