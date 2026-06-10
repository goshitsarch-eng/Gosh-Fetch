<script lang="ts">
  import { push, router } from 'svelte-spa-router';
  import { api } from '../../api/commands';
  import { downloads } from '../../stores/downloads.svelte';
  import { formatBytes } from '../../utils/format';
  import './Sidebar.css';

  interface NavItem {
    label: string;
    icon: string;
    filter: string | null;
    countSelector: 'all' | 'active' | 'paused' | 'completed';
  }

  const navItems: NavItem[] = [
    { label: 'All Downloads', icon: 'list', filter: null, countSelector: 'all' },
    { label: 'Active', icon: 'play_circle', filter: 'active', countSelector: 'active' },
    { label: 'Paused', icon: 'pause_circle', filter: 'paused', countSelector: 'paused' },
  ];

  const ACTIVE_ICON_STYLE = "font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24";

  let diskSpace = $state<{ total: number; free: number } | null>(null);

  $effect(() => {
    async function loadDiskSpace() {
      try {
        diskSpace = await api.getDiskSpace();
      } catch {
        /* ignore */
      }
    }
    loadDiskSpace();
    const interval = setInterval(loadDiskSpace, 30000);
    return () => clearInterval(interval);
  });

  const currentFilter = $derived(
    router.location === '/' ? new URLSearchParams(router.querystring).get('filter') || null : '__settings__'
  );

  function getCount(selector: NavItem['countSelector']): number {
    switch (selector) {
      case 'all':
        return downloads.all.filter((d) => d.status !== 'complete').length;
      case 'active':
        return downloads.active.length;
      case 'paused':
        return downloads.paused.length;
      case 'completed':
        return downloads.completed.length;
    }
  }

  function handleNavClick(filter: string | null) {
    if (filter) {
      push(`/?filter=${filter}`);
    } else {
      push('/');
    }
  }

  const diskUsedPercent = $derived(
    diskSpace ? Math.round(((diskSpace.total - diskSpace.free) / diskSpace.total) * 100) : 0
  );
</script>

<aside class="sidebar">
  <div class="sidebar-inner">
    <!-- Header -->
    <div class="sidebar-header">
      <div class="logo">
        <div class="logo-icon-wrapper">
          <span class="material-symbols-outlined">bolt</span>
        </div>
        <div class="logo-info">
          <span class="logo-text">Gosh-Fetch</span>
          <span class="logo-subtitle">v2.0.6 &bull; Stable</span>
        </div>
      </div>
    </div>

    <!-- Navigation -->
    <nav class="sidebar-nav">
      {#each navItems as item (item.label)}
        {@const isActive = currentFilter === item.filter}
        {@const count = getCount(item.countSelector)}
        <button
          class="nav-item{isActive ? ' active' : ''}"
          onclick={() => handleNavClick(item.filter)}
        >
          <span
            class="material-symbols-outlined nav-icon"
            style={isActive ? ACTIVE_ICON_STYLE : undefined}
          >
            {item.icon}
          </span>
          <span class="nav-label">{item.label}</span>
          {#if count > 0}
            <span class="nav-badge{isActive ? ' active' : ''}">{count}</span>
          {/if}
        </button>
      {/each}

      <!-- History Link -->
      <button
        class="nav-item{router.location === '/history' ? ' active' : ''}"
        onclick={() => push('/history')}
      >
        <span
          class="material-symbols-outlined nav-icon"
          style={router.location === '/history' ? ACTIVE_ICON_STYLE : undefined}
        >
          history
        </span>
        <span class="nav-label">History</span>
        {#if downloads.completed.length > 0}
          <span class="nav-badge{router.location === '/history' ? ' active' : ''}"
            >{downloads.completed.length}</span
          >
        {/if}
      </button>

      <!-- Statistics Link -->
      <button
        class="nav-item{router.location === '/statistics' ? ' active' : ''}"
        onclick={() => push('/statistics')}
      >
        <span
          class="material-symbols-outlined nav-icon"
          style={router.location === '/statistics' ? ACTIVE_ICON_STYLE : undefined}
        >
          monitoring
        </span>
        <span class="nav-label">Statistics</span>
      </button>

      <!-- Mirror Link -->
      <button
        class="nav-item{router.location === '/mirror' ? ' active' : ''}"
        onclick={() => push('/mirror')}
      >
        <span
          class="material-symbols-outlined nav-icon"
          style={router.location === '/mirror' ? ACTIVE_ICON_STYLE : undefined}
        >
          folder_copy
        </span>
        <span class="nav-label">Mirror</span>
      </button>

      <!-- Scheduler Link -->
      <button
        class="nav-item{router.location === '/scheduler' ? ' active' : ''}"
        onclick={() => push('/scheduler')}
      >
        <span
          class="material-symbols-outlined nav-icon"
          style={router.location === '/scheduler' ? ACTIVE_ICON_STYLE : undefined}
        >
          calendar_month
        </span>
        <span class="nav-label">Scheduler</span>
      </button>
    </nav>

    <!-- Footer -->
    <div class="sidebar-footer">
      <!-- Storage Widget -->
      {#if diskSpace}
        <div class="storage-widget">
          <div class="storage-header">
            <span class="storage-label">Storage</span>
            <span class="storage-percent">{diskUsedPercent}%</span>
          </div>
          <div class="storage-bar">
            <div class="storage-bar-fill" style="width: {diskUsedPercent}%"></div>
          </div>
          <span class="storage-detail">
            {formatBytes(diskSpace.free)} free of {formatBytes(diskSpace.total)}
          </span>
        </div>
      {/if}

      <!-- Settings Link -->
      <button
        class="nav-item settings-link{router.location === '/settings' ? ' active' : ''}"
        onclick={() => push('/settings')}
      >
        <span class="material-symbols-outlined nav-icon">settings</span>
        <span class="nav-label">Settings</span>
      </button>
    </div>
  </div>
</aside>
