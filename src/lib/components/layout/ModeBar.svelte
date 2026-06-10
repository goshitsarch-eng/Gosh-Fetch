<script lang="ts">
  import { push, router } from 'svelte-spa-router';
  import Icon from '../ui/Icon.svelte';
  import NotificationDropdown from './NotificationDropdown.svelte';
  import { downloads } from '../../stores/downloads.svelte';
  import { theme, getEffectiveTheme } from '../../stores/theme.svelte';
  import { ui } from '../../stores/ui.svelte';
  import './ModeBar.css';

  interface Mode {
    path: string;
    icon: string;
    label: string;
  }

  const MODES: Mode[] = [
    { path: '/', icon: 'download', label: 'Downloads' },
    { path: '/history', icon: 'history', label: 'History' },
    { path: '/statistics', icon: 'bar_chart_4_bars', label: 'Statistics' },
    { path: '/mirror', icon: 'folder_copy', label: 'Mirror' },
    { path: '/scheduler', icon: 'schedule', label: 'Scheduler' },
    { path: '/settings', icon: 'settings', label: 'Settings' },
  ];

  let searchEl: HTMLInputElement | null = $state(null);

  // Focus the search box when something signals it (Ctrl+K in App.svelte).
  $effect(() => {
    if (ui.focusSearchTick > 0) {
      searchEl?.focus();
    }
  });

  const activeCount = $derived(downloads.active.length);
  const effectiveTheme = $derived(getEffectiveTheme(theme.theme));

  const pad2 = (n: number) => String(n).padStart(2, '0');

  function handleAdd() {
    if (router.location !== '/') push('/');
    ui.openAddModal();
  }
</script>

<nav class="modebar">
  <div class="modes">
    {#each MODES as mode, i (mode.path)}
      <button
        class="mode"
        class:active={router.location === mode.path}
        onclick={() => push(mode.path)}
      >
        <span class="mode-idx">{pad2(i + 1)}</span>
        <Icon name={mode.icon} size={18} fill={router.location === mode.path} />
        <span class="mode-label">{mode.label}</span>
        {#if mode.path === '/' && activeCount > 0}
          <span class="nav-badge">{activeCount}</span>
        {/if}
      </button>
    {/each}
  </div>

  <div class="modebar-right">
    <div class="search">
      <Icon name="search" />
      <input bind:this={searchEl} bind:value={ui.searchQuery} placeholder="search…" />
      <kbd>⌘K</kbd>
    </div>
    <NotificationDropdown />
    <button class="icon-btn" onclick={() => theme.toggleTheme()} title="Toggle theme">
      <Icon name={effectiveTheme === 'dark' ? 'wb_sunny' : 'dark_mode'} />
    </button>
    <button class="btn btn-primary" onclick={handleAdd}>
      <Icon name="add" size={17} /> Add
    </button>
  </div>
</nav>
