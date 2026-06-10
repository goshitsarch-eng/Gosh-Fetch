<script lang="ts">
  import { untrack } from 'svelte';
  import { router } from 'svelte-spa-router';
  import { SvelteSet } from 'svelte/reactivity';
  import DownloadCard from '../lib/components/downloads/DownloadCard.svelte';
  import SortableList from '../lib/components/downloads/SortableList.svelte';
  import CompactDownloadRow from '../lib/components/downloads/CompactDownloadRow.svelte';
  import AddDownloadModal from '../lib/components/downloads/AddDownloadModal.svelte';
  import NotificationDropdown from '../lib/components/layout/NotificationDropdown.svelte';
  import { downloads } from '../lib/stores/downloads.svelte';
  import { ui } from '../lib/stores/ui.svelte';
  import { getFileExtension } from '../lib/utils/format';
  import type { Download } from '../lib/types/download';
  import './Downloads.css';

  type FileCategory = 'all' | 'video' | 'audio' | 'documents' | 'software' | 'images';

  const CATEGORIES: { label: string; value: FileCategory }[] = [
    { label: 'All Files', value: 'all' },
    { label: 'Video', value: 'video' },
    { label: 'Audio', value: 'audio' },
    { label: 'Documents', value: 'documents' },
    { label: 'Software', value: 'software' },
    { label: 'Images', value: 'images' },
  ];

  function getFileCategory(download: Download): FileCategory {
    const ext = getFileExtension(download.name);
    if (['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v'].includes(ext)) return 'video';
    if (['mp3', 'flac', 'wav', 'aac', 'ogg', 'wma', 'm4a', 'opus'].includes(ext)) return 'audio';
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'rtf', 'odt', 'epub'].includes(ext)) return 'documents';
    if (['exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm', 'appimage', 'snap', 'flatpak', 'apk', 'iso'].includes(ext)) return 'software';
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico', 'tiff', 'psd', 'raw'].includes(ext)) return 'images';
    if (['zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'zst'].includes(ext)) return 'software';
    if (download.downloadType === 'torrent' || download.downloadType === 'magnet') return 'software';
    return 'all';
  }

  let filter = $derived(
    (new URLSearchParams(router.querystring ?? '').get('filter') || 'all') as
      | 'all'
      | 'active'
      | 'paused'
      | 'completed'
  );

  let searchQuery = $state('');
  let category = $state<FileCategory>('all');
  const selectedGids = new SvelteSet<string>();
  let searchInputEl = $state<HTMLInputElement | null>(null);

  // Initial load + 5s polling
  $effect(() => {
    void downloads.loadCompletedHistory();
    void downloads.fetchDownloads();
    const interval = setInterval(() => void downloads.fetchDownloads(), 5000);
    return () => clearInterval(interval);
  });

  // Focus search signal (replaces 'gosh-fetch:focus-search')
  $effect(() => {
    const tick = ui.focusSearchTick;
    if (tick === 0) return;
    searchInputEl?.focus();
  });

  // Select-all signal (replaces 'gosh-fetch:select-all')
  $effect(() => {
    const tick = ui.selectAllTick;
    if (tick === 0) return;
    untrack(() => {
      selectedGids.clear();
      for (const d of allItems) selectedGids.add(d.gid);
    });
  });

  // Filter by status (from sidebar)
  let statusFiltered = $derived.by(() => {
    switch (filter) {
      case 'active': return downloads.active;
      case 'paused': return [...downloads.paused, ...downloads.errored];
      case 'completed': return downloads.completed;
      default: return [...downloads.all.filter((d) => d.status !== 'complete'), ...downloads.completed];
    }
  });

  // Filter by search query
  let searchFiltered = $derived.by(() => {
    if (!searchQuery.trim()) return statusFiltered;
    const q = searchQuery.toLowerCase();
    return statusFiltered.filter(
      (d) => d.name.toLowerCase().includes(q) || (d.url && d.url.toLowerCase().includes(q))
    );
  });

  // Filter by file category
  let categoryFiltered = $derived.by(() => {
    if (category === 'all') return searchFiltered;
    return searchFiltered.filter((d) => getFileCategory(d) === category);
  });

  // Split into active and paused/completed sections
  let activeItems = $derived(
    categoryFiltered.filter((d) => d.status === 'active' || d.status === 'waiting')
  );

  let pausedCompletedItems = $derived(
    categoryFiltered.filter((d) => d.status !== 'active' && d.status !== 'waiting')
  );

  // Sort active items by gidOrder
  let sortedActiveItems = $derived.by(() => {
    const orderMap = new Map(downloads.gidOrder.map((gid, i) => [gid, i]));
    return [...activeItems].sort((a, b) => {
      const ai = orderMap.get(a.gid) ?? Infinity;
      const bi = orderMap.get(b.gid) ?? Infinity;
      return ai - bi;
    });
  });

  let allItems = $derived([...sortedActiveItems, ...pausedCompletedItems]);
  let hasSelection = $derived(selectedGids.size > 0);
  let allSelected = $derived(allItems.length > 0 && allItems.every((d) => selectedGids.has(d.gid)));

  function handleSelect(gid: string, selected: boolean) {
    if (selected) selectedGids.add(gid);
    else selectedGids.delete(gid);
  }

  function handleSelectAll() {
    if (allSelected) {
      selectedGids.clear();
    } else {
      selectedGids.clear();
      for (const d of allItems) selectedGids.add(d.gid);
    }
  }

  async function handleBatchPause() {
    for (const gid of selectedGids) {
      try { await downloads.pause(gid); } catch { /* ignore */ }
    }
    selectedGids.clear();
  }

  async function handleBatchResume() {
    for (const gid of selectedGids) {
      try { await downloads.resume(gid); } catch { /* ignore */ }
    }
    selectedGids.clear();
  }

  async function handleBatchRemove() {
    for (const gid of [...selectedGids]) {
      try { await downloads.remove(gid); } catch { /* ignore */ }
    }
    selectedGids.clear();
  }

  let totalItems = $derived(categoryFiltered.length);
  let showEmptyState = $derived(
    !downloads.isLoading && totalItems === 0 && !searchQuery && category === 'all'
  );
  let showNoResults = $derived(
    !downloads.isLoading && totalItems === 0 && (searchQuery !== '' || category !== 'all')
  );
</script>

<div class="page">
  <header class="toolbar-header">
    <div class="search-bar">
      <span class="material-symbols-outlined">search</span>
      <input
        bind:this={searchInputEl}
        class="search-input"
        type="text"
        placeholder="Search by filename or paste URL..."
        bind:value={searchQuery}
      />
      <kbd class="search-shortcut">Ctrl K</kbd>
    </div>
    <div class="toolbar-actions">
      <NotificationDropdown />
      <button class="btn btn-primary" onclick={() => ui.openAddModal()}>
        <span class="material-symbols-outlined" style="font-size: 20px">add</span>
        Add Download
      </button>
    </div>
  </header>

  {#if hasSelection}
    <div class="batch-action-bar">
      <label class="select-all-checkbox">
        <input type="checkbox" checked={allSelected} onchange={handleSelectAll} aria-label="Select all downloads" />
      </label>
      <span class="batch-count">{selectedGids.size} selected</span>
      <button class="btn btn-secondary btn-sm" onclick={handleBatchPause}>
        <span class="material-symbols-outlined" style="font-size: 14px">pause</span> Pause
      </button>
      <button class="btn btn-secondary btn-sm" onclick={handleBatchResume}>
        <span class="material-symbols-outlined" style="font-size: 14px">play_arrow</span> Resume
      </button>
      <button class="btn btn-destructive btn-sm" onclick={handleBatchRemove}>
        <span class="material-symbols-outlined" style="font-size: 14px">delete</span> Remove
      </button>
      <button class="btn btn-ghost btn-sm" onclick={() => selectedGids.clear()}>Clear</button>
    </div>
  {/if}

  {#if downloads.error}
    <div class="error-banner">
      <span class="material-symbols-outlined" style="font-size: 14px">error</span>
      <span>{downloads.error}</span>
      <button class="btn btn-ghost btn-sm" onclick={() => void downloads.fetchDownloads()}>Retry</button>
    </div>
  {/if}

  <div class="content-scroll">
    <!-- Category pills -->
    <div class="category-pills">
      {#each CATEGORIES as cat (cat.value)}
        <button
          class={`category-pill${category === cat.value ? ' active' : ''}`}
          onclick={() => (category = cat.value)}
        >
          {cat.label}
        </button>
      {/each}
    </div>

    {#if downloads.isLoading && totalItems === 0 && !searchQuery}
      <div class="empty-state">
        <span class="material-symbols-outlined spin" style="font-size: 32px">progress_activity</span>
        <p>Loading downloads...</p>
      </div>
    {:else if showEmptyState}
      <div class="empty-state">
        <div class="empty-icon">
          <span class="material-symbols-outlined" style="font-size: 48px">inbox</span>
        </div>
        <h3>No downloads</h3>
        <p>Click "Add Download" or press Ctrl+N to get started</p>
        <button class="btn btn-primary" onclick={() => ui.openAddModal()} style="margin-top: var(--space-md)">
          <span class="material-symbols-outlined" style="font-size: 14px">add</span> Add Download
        </button>
      </div>
    {:else if showNoResults}
      <div class="empty-state">
        <div class="empty-icon">
          <span class="material-symbols-outlined" style="font-size: 48px">search_off</span>
        </div>
        <h3>No results</h3>
        <p>Try a different search term or category</p>
      </div>
    {:else}
      <!-- Active Downloads Section -->
      {#if sortedActiveItems.length > 0}
        <div class="download-section">
          <div class="dl-section-header">
            <span class="section-dot green"></span>
            <span class="section-label">Active Downloads</span>
          </div>
          <div class="downloads-list">
            <SortableList items={sortedActiveItems}>
              {#snippet renderItem(download: Download)}
                <DownloadCard
                  {download}
                  selected={selectedGids.has(download.gid)}
                  onSelect={handleSelect}
                />
              {/snippet}
            </SortableList>
            <div class="add-more-zone" onclick={() => ui.openAddModal()}>
              <span class="material-symbols-outlined" style="font-size: 16px">add</span>
              <span>Ready for more</span>
            </div>
          </div>
        </div>
      {/if}

      <!-- Paused & Recent Section -->
      {#if pausedCompletedItems.length > 0}
        <div class="download-section">
          <div class="dl-section-header">
            <span class="section-dot yellow"></span>
            <span class="section-label">Paused &amp; Recent</span>
          </div>
          <div class="compact-list">
            {#each pausedCompletedItems as download (download.gid)}
              <CompactDownloadRow
                {download}
                selected={selectedGids.has(download.gid)}
                onSelect={handleSelect}
              />
            {/each}
          </div>
        </div>
      {/if}

      <!-- If only active but no paused, still show add zone -->
      {#if sortedActiveItems.length === 0 && pausedCompletedItems.length > 0}
        <div class="add-more-zone" onclick={() => ui.openAddModal()}>
          <span class="material-symbols-outlined" style="font-size: 16px">add</span>
          <span>Ready for more</span>
        </div>
      {/if}
    {/if}
  </div>

  {#if ui.addModalOpen}
    <AddDownloadModal />
  {/if}
</div>
