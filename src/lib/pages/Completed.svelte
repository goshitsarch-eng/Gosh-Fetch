<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import DownloadCard from '../components/downloads/DownloadCard.svelte';
  import { getCompletedDownloads, startPolling, stopPolling } from '../stores/downloads.svelte';
  import { formatBytes } from '../utils/format';

  const completedDownloads = $derived(getCompletedDownloads());

  const totalSize = $derived(
    completedDownloads.reduce((sum, d) => sum + d.totalSize, 0)
  );

  onMount(() => {
    startPolling();
  });

  onDestroy(() => {
    stopPolling();
  });
</script>

<div class="page">
  <header class="page-header">
    <div class="header-left">
      <h1>Completed</h1>
      <div class="header-stats">
        <span class="stat">{completedDownloads.length} downloads</span>
        <span class="stat-divider">·</span>
        <span class="stat">{formatBytes(totalSize)} total</span>
      </div>
    </div>
  </header>

  <div class="downloads-list">
    {#if completedDownloads.length === 0}
      <div class="empty-state">
        <div class="empty-icon">✓</div>
        <h3>No completed downloads</h3>
        <p>Downloads will appear here once they finish</p>
      </div>
    {:else}
      {#each completedDownloads as download (download.gid)}
        <DownloadCard {download} />
      {/each}
    {/if}
  </div>
</div>

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
    gap: var(--space-sm);
    font-size: 12px;
    color: var(--text-muted);
  }

  .stat-divider {
    color: var(--border-primary);
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
    color: var(--color-success);
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
