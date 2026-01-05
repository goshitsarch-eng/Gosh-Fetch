<script lang="ts">
  import Sidebar from './lib/components/layout/Sidebar.svelte';
  import Downloads from './lib/pages/Downloads.svelte';
  import Completed from './lib/pages/Completed.svelte';
  import Settings from './lib/pages/Settings.svelte';
  import About from './lib/pages/About.svelte';
  import { initTheme } from './lib/stores/theme.svelte';
  import { startStatsPolling } from './lib/stores/stats.svelte';
  import { onMount } from 'svelte';
  import { listen } from '@tauri-apps/api/event';

  let currentPage = $state('downloads');

  onMount(() => {
    initTheme();
    startStatsPolling();

    // Listen for navigation events from tray
    const unlisten = listen('navigate', (event) => {
      currentPage = event.payload as string;
    });

    return () => {
      unlisten.then(fn => fn());
    };
  });

  function handleNavigate(page: string) {
    currentPage = page;
  }
</script>

<div class="app-layout">
  <Sidebar {currentPage} onNavigate={handleNavigate} />

  <main class="main-content">
    {#if currentPage === 'downloads'}
      <Downloads />
    {:else if currentPage === 'completed'}
      <Completed />
    {:else if currentPage === 'settings'}
      <Settings />
    {:else if currentPage === 'about'}
      <About />
    {/if}
  </main>
</div>

<style>
  .app-layout {
    display: flex;
    height: 100%;
    overflow: hidden;
  }

  .main-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
</style>
