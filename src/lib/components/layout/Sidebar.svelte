<script lang="ts">
  import { getStats } from '../../stores/stats.svelte';
  import { getActiveDownloads, getCompletedDownloads } from '../../stores/downloads.svelte';
  import { formatSpeed } from '../../utils/format';
  import { getTheme, toggleTheme } from '../../stores/theme.svelte';

  interface Props {
    currentPage: string;
    onNavigate: (page: string) => void;
  }

  let { currentPage, onNavigate }: Props = $props();

  const stats = $derived(getStats());
  const activeDownloads = $derived(getActiveDownloads());
  const completedDownloads = $derived(getCompletedDownloads());
  const theme = $derived(getTheme());

  const navItems = [
    { id: 'downloads', label: 'Downloads', icon: '↓' },
    { id: 'completed', label: 'Completed', icon: '✓' },
    { id: 'settings', label: 'Settings', icon: '⚙' },
    { id: 'about', label: 'About', icon: 'ℹ' },
  ];

  function getBadgeCount(id: string): number | null {
    if (id === 'downloads') {
      return activeDownloads.length || null;
    }
    if (id === 'completed') {
      return completedDownloads.length || null;
    }
    return null;
  }
</script>

<aside class="sidebar">
  <div class="sidebar-header">
    <div class="logo">
      <span class="logo-icon">⬇</span>
      <span class="logo-text">Gosh-Fetch</span>
    </div>
  </div>

  <nav class="sidebar-nav">
    {#each navItems as item}
      {@const count = getBadgeCount(item.id)}
      <button
        class="nav-item"
        class:active={currentPage === item.id}
        onclick={() => onNavigate(item.id)}
      >
        <span class="nav-icon">{item.icon}</span>
        <span class="nav-label">{item.label}</span>
        {#if count}
          <span class="nav-badge">{count}</span>
        {/if}
      </button>
    {/each}
  </nav>

  <div class="sidebar-footer">
    <div class="speed-display">
      <div class="speed-row">
        <span class="speed-icon">↓</span>
        <span class="speed-value">{formatSpeed(stats.downloadSpeed)}</span>
      </div>
      <div class="speed-row">
        <span class="speed-icon">↑</span>
        <span class="speed-value">{formatSpeed(stats.uploadSpeed)}</span>
      </div>
    </div>

    <button class="theme-toggle" onclick={toggleTheme} title="Toggle theme">
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  </div>
</aside>

<style>
  .sidebar {
    width: var(--sidebar-width);
    height: 100%;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border-primary);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .sidebar-header {
    padding: var(--space-md);
    border-bottom: 1px solid var(--border-primary);
  }

  .logo {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .logo-icon {
    font-size: 20px;
    color: var(--color-primary);
  }

  .logo-text {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .sidebar-nav {
    flex: 1;
    padding: var(--space-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    transition: all var(--transition-fast);
    width: 100%;
    text-align: left;
  }

  .nav-item:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .nav-item.active {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .nav-icon {
    font-size: 16px;
    width: 20px;
    text-align: center;
  }

  .nav-label {
    flex: 1;
    font-size: 14px;
  }

  .nav-badge {
    background: var(--color-primary);
    color: white;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 10px;
    min-width: 20px;
    text-align: center;
  }

  .sidebar-footer {
    padding: var(--space-md);
    border-top: 1px solid var(--border-primary);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .speed-display {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .speed-row {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: 12px;
  }

  .speed-icon {
    color: var(--color-primary);
    font-weight: bold;
  }

  .speed-value {
    color: var(--text-secondary);
    font-family: var(--font-mono);
  }

  .theme-toggle {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: var(--text-secondary);
    transition: all var(--transition-fast);
  }

  .theme-toggle:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
</style>
