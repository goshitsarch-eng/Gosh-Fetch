<script lang="ts">
  import { untrack } from 'svelte';
  import { push, router } from 'svelte-spa-router';
  import { SvelteSet } from 'svelte/reactivity';
  import Icon from '../lib/components/ui/Icon.svelte';
  import DownloadRow from '../lib/components/downloads/DownloadRow.svelte';
  import SortableList from '../lib/components/downloads/SortableList.svelte';
  import AddDownloadModal from '../lib/components/downloads/AddDownloadModal.svelte';
  import { downloads } from '../lib/stores/downloads.svelte';
  import { ui } from '../lib/stores/ui.svelte';
  import type { Download } from '../lib/types/download';
  import './Downloads.css';

  type Filter = 'all' | 'active' | 'paused' | 'completed';

  const FILTERS: { value: Filter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'paused', label: 'Paused' },
    { value: 'completed', label: 'Done' },
  ];

  let filter = $derived(
    (new URLSearchParams(router.querystring ?? '').get('filter') || 'all') as Filter
  );

  const selectedGids = new SvelteSet<string>();
  let expandedGid = $state<string | null>(null);

  // Initial load + 5s polling
  $effect(() => {
    void downloads.loadCompletedHistory();
    void downloads.fetchDownloads();
    const interval = setInterval(() => void downloads.fetchDownloads(), 5000);
    return () => clearInterval(interval);
  });

  // Select-all signal (Ctrl+A in App.svelte)
  $effect(() => {
    const tick = ui.selectAllTick;
    if (tick === 0) return;
    untrack(() => {
      selectedGids.clear();
      for (const d of allItems) selectedGids.add(d.gid);
    });
  });

  function setFilter(f: Filter) {
    push(f === 'all' ? '/' : `/?filter=${f}`);
  }

  const counts = $derived({
    all: downloads.all.filter((d) => d.status !== 'complete').length + downloads.completed.length,
    active: downloads.active.length + downloads.errored.length,
    paused: downloads.paused.length,
    completed: downloads.completed.length,
  });

  // Filter by status
  let statusFiltered = $derived.by(() => {
    switch (filter) {
      case 'active': return [...downloads.active, ...downloads.errored];
      case 'paused': return downloads.paused;
      case 'completed': return downloads.completed;
      default: return [...downloads.all.filter((d) => d.status !== 'complete'), ...downloads.completed];
    }
  });

  // Filter by global search query (input lives in the ModeBar)
  let searchFiltered = $derived.by(() => {
    const q = ui.searchQuery.trim().toLowerCase();
    if (!q) return statusFiltered;
    return statusFiltered.filter(
      (d) => d.name.toLowerCase().includes(q) || (d.url && d.url.toLowerCase().includes(q))
    );
  });

  // Split into active (drag-reorderable) and the rest
  let activeItems = $derived(
    searchFiltered.filter((d) => d.status === 'active' || d.status === 'waiting')
  );

  let restItems = $derived(
    searchFiltered.filter((d) => d.status !== 'active' && d.status !== 'waiting')
  );

  // Sort active items by queue order
  let sortedActiveItems = $derived.by(() => {
    const orderMap = new Map(downloads.gidOrder.map((gid, i) => [gid, i]));
    return [...activeItems].sort((a, b) => {
      const ai = orderMap.get(a.gid) ?? Infinity;
      const bi = orderMap.get(b.gid) ?? Infinity;
      return ai - bi;
    });
  });

  let allItems = $derived([...sortedActiveItems, ...restItems]);
  let hasSelection = $derived(selectedGids.size > 0);
  let allSelected = $derived(allItems.length > 0 && allItems.every((d) => selectedGids.has(d.gid)));

  function handleSelect(gid: string, selected: boolean) {
    if (selected) selectedGids.add(gid);
    else selectedGids.delete(gid);
  }

  function handleExpand(gid: string) {
    expandedGid = expandedGid === gid ? null : gid;
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

  const pad2 = (n: number) => String(n).padStart(2, '0');

  let totalItems = $derived(searchFiltered.length);
  let isSearching = $derived(ui.searchQuery.trim() !== '');
  let showEmptyState = $derived(!downloads.isLoading && totalItems === 0 && !isSearching);
  let showNoResults = $derived(!downloads.isLoading && totalItems === 0 && isSearching);
</script>

<div class="content page-fade">
  <div class="content-inner">
    <div class="toolbar">
      <div class="chips">
        {#each FILTERS as f (f.value)}
          <button class="chip" class:active={filter === f.value} onclick={() => setFilter(f.value)}>
            {f.label} <span class="cnt">{pad2(counts[f.value])}</span>
          </button>
        {/each}
      </div>
      <div class="toolbar-spacer"></div>
      {#if allItems.length > 0}
        <button class="btn btn-ghost" onclick={handleSelectAll}>
          <Icon name={allSelected ? 'select_check_box' : 'check_box_outline_blank'} size={16} />
          Select all
        </button>
      {/if}
    </div>

    {#if downloads.error}
      <div class="dl-error-banner">
        <Icon name="error" size={15} />
        <span>{downloads.error}</span>
        <button class="btn btn-ghost" onclick={() => void downloads.fetchDownloads()}>Retry</button>
      </div>
    {/if}

    {#if downloads.isLoading && totalItems === 0 && !isSearching}
      <div class="empty">
        <Icon name="progress_activity" class="spin" />
        <h3>Loading</h3>
        <p>Fetching downloads…</p>
      </div>
    {:else if showEmptyState}
      <div class="empty">
        <Icon name="download_for_offline" />
        <h3>Queue empty</h3>
        <p>Add a URL, magnet link, or .torrent file to begin.</p>
        <button class="btn btn-primary" style="margin-top: 18px" onclick={() => ui.openAddModal()}>
          <Icon name="add" size={17} /> Add Download
        </button>
      </div>
    {:else if showNoResults}
      <div class="empty">
        <Icon name="search_off" />
        <h3>No matches</h3>
        <p>Try a different search term.</p>
      </div>
    {:else}
      <div class="dl-list">
        <div class="dl-head">
          <span></span>
          <span>Name</span>
          <span class="r">Size</span>
          <span class="r">Throughput</span>
          <span>Status</span>
          <span></span>
        </div>
        {#if sortedActiveItems.length > 0}
          <SortableList items={sortedActiveItems}>
            {#snippet renderItem(download: Download)}
              <DownloadRow
                {download}
                selected={selectedGids.has(download.gid)}
                onSelect={handleSelect}
                expanded={expandedGid === download.gid}
                onExpand={handleExpand}
              />
            {/snippet}
          </SortableList>
        {/if}
        {#each restItems as download (download.gid)}
          <DownloadRow
            {download}
            selected={selectedGids.has(download.gid)}
            onSelect={handleSelect}
            expanded={expandedGid === download.gid}
            onExpand={handleExpand}
          />
        {/each}
      </div>
    {/if}

    {#if hasSelection}
      <div class="batchbar">
        <b>{pad2(selectedGids.size)} selected</b>
        <span class="sep"></span>
        <button class="batch-btn" onclick={handleBatchResume}><Icon name="play_arrow" /> Resume</button>
        <button class="batch-btn" onclick={handleBatchPause}><Icon name="pause" /> Pause</button>
        <button class="batch-btn" onclick={handleBatchRemove}><Icon name="delete" /> Remove</button>
        <div class="batch-spacer"></div>
        <button class="batch-btn" onclick={() => selectedGids.clear()} aria-label="Clear selection">
          <Icon name="close" />
        </button>
      </div>
    {/if}
  </div>

  {#if ui.addModalOpen}
    <AddDownloadModal />
  {/if}
</div>
