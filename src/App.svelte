<script lang="ts">
  import Router, { push, router } from 'svelte-spa-router';
  import { getCurrentWebview } from '@tauri-apps/api/webview';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import Downloads from './routes/Downloads.svelte';
  import History from './routes/History.svelte';
  import Statistics from './routes/Statistics.svelte';
  import Settings from './routes/Settings.svelte';
  import Scheduler from './routes/Scheduler.svelte';
  import Mirror from './routes/Mirror.svelte';
  import TrayPopup from './routes/TrayPopup.svelte';
  import Masthead from './lib/components/layout/Masthead.svelte';
  import ModeBar from './lib/components/layout/ModeBar.svelte';
  import Onboarding from './lib/components/Onboarding.svelte';
  import UpdateToast from './lib/components/updater/UpdateToast.svelte';
  import UpdateModal from './lib/components/updater/UpdateModal.svelte';
  import { startEventBridge } from './lib/api/events';
  import { downloads } from './lib/stores/downloads.svelte';
  import { stats } from './lib/stores/stats.svelte';
  import { ui } from './lib/stores/ui.svelte';
  import { updater } from './lib/stores/updater.svelte';
  import './App.css';

  const routes = {
    '/': Downloads,
    '/history': History,
    '/statistics': Statistics,
    '/settings': Settings,
    '/scheduler': Scheduler,
    '/mirror': Mirror,
  };

  // The tray popup window loads the same bundle with #/tray — render it
  // without the app shell.
  let isTrayPopup = $derived(router.location === '/tray');

  let isDragOver = $state(false);
  let showOnboarding = $state(!localStorage.getItem('gosh-fetch-onboarding-done'));

  function handleKeyDown(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === 'n') {
      e.preventDefault();
      push('/');
      ui.openAddModal();
    } else if (mod && e.key === 'k') {
      e.preventDefault();
      ui.requestFocusSearch();
    } else if (mod && e.key === ',') {
      e.preventDefault();
      push('/settings');
    } else if (
      mod &&
      e.key === 'a' &&
      !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)
    ) {
      e.preventDefault();
      ui.requestSelectAll();
    }
  }

  // Text/URL drops come through HTML5 DnD; file drops (.torrent) come
  // through Tauri's native drag-drop events (HTML5 drops carry no paths).
  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    isDragOver = true;
  }

  function handleDragLeave(e: DragEvent) {
    const target = e.currentTarget as HTMLElement;
    if (target === e.target || !target.contains(e.relatedTarget as Node)) {
      isDragOver = false;
    }
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragOver = false;

    const text = e.dataTransfer?.getData('text/plain')?.trim();
    if (text) {
      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      for (const line of lines) {
        try {
          if (line.startsWith('magnet:')) {
            await downloads.addMagnet(line);
          } else if (line.startsWith('http://') || line.startsWith('https://')) {
            await downloads.addDownload(line);
          }
        } catch {
          /* ignore */
        }
      }
      void downloads.fetchDownloads();
    }
  }

  $effect(() => {
    if (isTrayPopup) return;

    // Restore incomplete downloads once on app startup
    void downloads.restoreIncomplete();
    void downloads.fetchDownloads();
    void downloads.loadCompletedHistory();

    // Check for app updates in the background
    void updater.checkForUpdates();

    let cleanupBridge: (() => void) | null = null;
    let cleanupFileDrop: (() => void) | null = null;

    void startEventBridge().then((cleanup) => {
      cleanupBridge = cleanup;
    });

    // Native file drops (real paths, unlike HTML5 drops in a webview)
    void getCurrentWebview()
      .onDragDropEvent(async (event) => {
        if (event.payload.type === 'over') {
          isDragOver = true;
        } else if (event.payload.type === 'drop') {
          isDragOver = false;
          const torrents = event.payload.paths.filter((p) =>
            p.toLowerCase().endsWith('.torrent')
          );
          for (const filePath of torrents) {
            try {
              await downloads.addTorrentFile(filePath);
            } catch {
              /* ignore */
            }
          }
          if (torrents.length > 0) void downloads.fetchDownloads();
        } else {
          isDragOver = false;
        }
      })
      .then((cleanup) => {
        cleanupFileDrop = cleanup;
      });

    document.addEventListener('keydown', handleKeyDown);

    // The window starts hidden; show it now that the UI is mounted
    void getCurrentWindow().show();

    return () => {
      cleanupBridge?.();
      cleanupFileDrop?.();
      document.removeEventListener('keydown', handleKeyDown);
    };
  });
</script>

{#if isTrayPopup}
  <TrayPopup />
{:else}
  <div
    class="app"
    role="application"
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
  >
    <Masthead />
    <ModeBar />

    {#if !stats.isConnected}
      <div class="conn-strip">
        <span class="ms" style="font-size: 13px">wifi_off</span>
        <span>Engine disconnected — reconnecting…</span>
      </div>
    {/if}

    <Router {routes} />

    {#if showOnboarding}
      <Onboarding onComplete={() => (showOnboarding = false)} />
    {/if}

    <UpdateToast />
    <UpdateModal />

    {#if isDragOver}
      <div class="drop-overlay">
        <div class="drop-overlay-content">
          <span class="ms" style="font-size: 44px">place_item</span>
          <p>Drop URL or .torrent file to add download</p>
        </div>
      </div>
    {/if}
  </div>
{/if}
