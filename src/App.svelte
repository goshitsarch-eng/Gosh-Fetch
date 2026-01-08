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
  import { invoke } from '@tauri-apps/api/core';
  import Database from '@tauri-apps/plugin-sql';

  let currentPage = $state('downloads');

  interface SettingRow {
    key: string;
    value: string;
  }

  async function loadAndApplySettings() {
    try {
      const db = await Database.load('sqlite:gosh-fetch.db');
      const rows = await db.select<SettingRow[]>('SELECT key, value FROM settings');

      const settings: Record<string, any> = {
        download_path: '',
        max_concurrent_downloads: 5,
        max_connections_per_server: 16,
        split_count: 16,
        download_speed_limit: 0,
        upload_speed_limit: 0,
        user_agent: 'Gosh-Fetch/1.0',
        enable_notifications: true,
        close_to_tray: true,
        theme: 'dark',
        bt_enable_dht: true,
        bt_enable_pex: true,
        bt_enable_lpd: true,
        bt_max_peers: 55,
        bt_seed_ratio: 1.0,
        auto_update_trackers: true,
        delete_files_on_remove: false,
      };

      for (const row of rows) {
        switch (row.key) {
          case 'download_path':
            settings.download_path = row.value === '~/Downloads'
              ? await invoke<string>('get_default_download_path')
              : row.value;
            break;
          case 'max_concurrent_downloads':
            settings.max_concurrent_downloads = parseInt(row.value) || 5;
            break;
          case 'max_connections_per_server':
            settings.max_connections_per_server = parseInt(row.value) || 16;
            break;
          case 'split_count':
            settings.split_count = parseInt(row.value) || 16;
            break;
          case 'download_speed_limit':
            settings.download_speed_limit = parseInt(row.value) || 0;
            break;
          case 'upload_speed_limit':
            settings.upload_speed_limit = parseInt(row.value) || 0;
            break;
          case 'user_agent':
            settings.user_agent = row.value;
            break;
          case 'bt_max_peers':
            settings.bt_max_peers = parseInt(row.value) || 55;
            break;
          case 'bt_seed_ratio':
            settings.bt_seed_ratio = parseFloat(row.value) || 1.0;
            break;
        }
      }

      // If download_path is still empty, get the default
      if (!settings.download_path) {
        settings.download_path = await invoke<string>('get_default_download_path');
      }

      // Apply settings to download engine
      await invoke('apply_settings_to_engine', { settings });
      console.log('Settings applied to engine on startup');
    } catch (e) {
      console.error('Failed to load and apply settings:', e);
    }
  }

  onMount(() => {
    initTheme();
    startStatsPolling();
    loadAndApplySettings();

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
