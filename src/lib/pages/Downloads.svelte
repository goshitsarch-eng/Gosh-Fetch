<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import DownloadCard from '../components/downloads/DownloadCard.svelte';
  import AddDownloadModal from '../components/downloads/AddDownloadModal.svelte';
  import {
    getDownloads,
    getActiveDownloads,
    getPausedDownloads,
    getErrorDownloads,
    startPolling,
    stopPolling,
    pauseAll,
    resumeAll,
  } from '../stores/downloads.svelte';
  import { getStats } from '../stores/stats.svelte';
  import { formatSpeed } from '../utils/format';

  let showAddModal = $state(false);
  let filter = $state<'all' | 'active' | 'paused' | 'error'>('all');

  const allDownloads = $derived(getDownloads());
  const activeDownloads = $derived(getActiveDownloads());
  const pausedDownloads = $derived(getPausedDownloads());
  const errorDownloads = $derived(getErrorDownloads());
  const stats = $derived(getStats());

  const filteredDownloads = $derived(() => {
    const downloads = allDownloads.filter(d => d.status !== 'complete');
    switch (filter) {
      case 'active':
        return downloads.filter(d => d.status === 'active' || d.status === 'waiting');
      case 'paused':
        return downloads.filter(d => d.status === 'paused');
      case 'error':
        return downloads.filter(d => d.status === 'error');
      default:
        return downloads;
    }
  });

  onMount(() => {
    startPolling();
  });

  onDestroy(() => {
    stopPolling();
  });

  async function handlePauseAll() {
    await pauseAll();
  }

  async function handleResumeAll() {
    await resumeAll();
  }
</script>

<div class="page">
  <header class="page-header">
    <div class="header-left">
      <h1>Downloads</h1>
      <div class="header-stats">
        <span class="stat">
          <span class="stat-icon">↓</span>
          {formatSpeed(stats.downloadSpeed)}
        </span>
        <span class="stat">
          <span class="stat-icon">↑</span>
          {formatSpeed(stats.uploadSpeed)}
        </span>
        <span class="stat-divider">|</span>
        <span class="stat">{stats.numActive} active</span>
      </div>
    </div>

    <div class="header-actions">
      <button class="btn btn-secondary btn-sm" onclick={handlePauseAll}>
        ⏸ Pause All
      </button>
      <button class="btn btn-secondary btn-sm" onclick={handleResumeAll}>
        ▶ Resume All
      </button>
      <button class="btn btn-primary" onclick={() => (showAddModal = true)}>
        + Add Download
      </button>
    </div>
  </header>

  <div class="filter-bar">
    <button
      class="filter-btn"
      class:active={filter === 'all'}
      onclick={() => (filter = 'all')}
    >
      All
    </button>
    <button
      class="filter-btn"
      class:active={filter === 'active'}
      onclick={() => (filter = 'active')}
    >
      Active ({activeDownloads.length})
    </button>
    <button
      class="filter-btn"
      class:active={filter === 'paused'}
      onclick={() => (filter = 'paused')}
    >
      Paused ({pausedDownloads.length})
    </button>
    <button
      class="filter-btn"
      class:active={filter === 'error'}
      onclick={() => (filter = 'error')}
    >
      Errors ({errorDownloads.length})
    </button>
  </div>

  <div class="downloads-list">
    {#if filteredDownloads().length === 0}
      <div class="empty-state">
        <div class="empty-icon">📥</div>
        <h3>No downloads</h3>
        <p>Click "Add Download" to get started</p>
      </div>
    {:else}
      {#each filteredDownloads() as download (download.gid)}
        <DownloadCard {download} />
      {/each}
    {/if}
  </div>
</div>

{#if showAddModal}
  <AddDownloadModal onClose={() => (showAddModal = false)} />
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-lg);
    border-bottom: 1px solid var(--border-primary);
    background: var(--bg-secondary);
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .header-left h1 {
    font-size: 20px;
    margin: 0;
  }

  .header-stats {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    font-size: 12px;
    color: var(--text-muted);
  }

  .stat {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .stat-icon {
    color: var(--color-primary);
  }

  .stat-divider {
    color: var(--border-primary);
  }

  .header-actions {
    display: flex;
    gap: var(--space-sm);
  }

  .filter-bar {
    display: flex;
    gap: var(--space-xs);
    padding: var(--space-md) var(--space-lg);
    background: var(--bg-primary);
    border-bottom: 1px solid var(--border-secondary);
  }

  .filter-btn {
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-md);
    font-size: 13px;
    color: var(--text-secondary);
    transition: all var(--transition-fast);
  }

  .filter-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .filter-btn.active {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .downloads-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-2xl);
    text-align: center;
  }

  .empty-icon {
    font-size: 48px;
    margin-bottom: var(--space-md);
    opacity: 0.5;
  }

  .empty-state h3 {
    font-size: 18px;
    margin-bottom: var(--space-sm);
    color: var(--text-primary);
  }

  .empty-state p {
    color: var(--text-muted);
  }
</style>
