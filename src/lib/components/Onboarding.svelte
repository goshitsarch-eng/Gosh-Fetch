<script lang="ts">
  import { getVersion } from '@tauri-apps/api/app';
  import { api } from '../api/commands';
  import {
    selectFile,
    selectDirectory,
    setRunAtStartup,
    getRunAtStartup,
    setMagnetHandler,
    isMagnetHandler,
  } from '../api/system';
  import { theme, ACCENTS } from '../stores/theme.svelte';
  import type { Theme } from '../stores/theme.svelte';
  import Icon from './ui/Icon.svelte';
  import Switch from './ui/Switch.svelte';
  import Segmented from './ui/Segmented.svelte';
  import './Onboarding.css';

  let { onComplete }: { onComplete: () => void } = $props();

  let step = $state(0);
  let downloadPath = $state('');
  let alwaysAskLocation = $state(false);
  let selectedTheme = $state<Theme>(theme.theme);
  let torrentHandler = $state(true);
  let magnetLinks = $state(true);
  let runAtStartup = $state(false);
  let appVersion = $state('');
  let overlayEl = $state<HTMLDivElement | null>(null);

  const STEPS = [
    { art: 'downloading', title: 'Welcome to Gosh-Fetch' },
    { art: 'folder_open', title: 'Where should downloads go?' },
    { art: 'tune', title: 'System integration' },
  ];

  // Load defaults on mount
  $effect(() => {
    (async () => {
      try {
        downloadPath = await api.getDefaultDownloadPath();
      } catch {}
      try {
        appVersion = await getVersion();
      } catch {}
      // Check current protocol/login state
      try {
        const isMagnet = await isMagnetHandler();
        magnetLinks = isMagnet;
        const savedTorrentHandler = localStorage.getItem('gosh-fetch-handle-torrent-files');
        if (savedTorrentHandler == null) {
          torrentHandler = isMagnet;
        } else {
          torrentHandler = savedTorrentHandler === '1';
        }
      } catch {}
      try {
        runAtStartup = await getRunAtStartup();
      } catch {}
    })();
  });

  // Apply theme live when user selects
  $effect(() => {
    theme.setTheme(selectedTheme);
  });

  // Focus trap
  $effect(() => {
    // re-run when the step changes
    void step;
    const overlay = overlayEl;
    if (!overlay) return;
    const focusable = overlay.querySelectorAll<HTMLElement>(
      'button, input, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();

    function trapFocus(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }
    overlay.addEventListener('keydown', trapFocus);
    return () => overlay.removeEventListener('keydown', trapFocus);
  });

  const isLast = $derived(step === STEPS.length - 1);

  async function handleBrowse() {
    const selected = await selectDirectory();
    if (selected) downloadPath = selected;
  }

  async function handleImportSettings() {
    try {
      const path = await selectFile([{ name: 'JSON', extensions: ['json'] }]);
      if (!path) return;
      const imported = await api.readSettingsJson(path);
      if (imported) {
        await api.dbSaveSettings(imported);
        await api.applySettingsToEngine(imported);
        localStorage.setItem('gosh-fetch-onboarding-done', '1');
        onComplete();
      }
    } catch (err) {
      console.error('Failed to import settings:', err);
    }
  }

  function handleSkip() {
    localStorage.setItem('gosh-fetch-onboarding-done', '1');
    onComplete();
  }

  async function handleFinish() {
    try {
      if (downloadPath) {
        const settings = await api.dbGetSettings();
        settings.download_path = downloadPath;
        settings.theme = selectedTheme;
        await api.dbSaveSettings(settings);
        await api.applySettingsToEngine(settings);
      }

      if (alwaysAskLocation) {
        localStorage.setItem('gosh-fetch-always-ask-location', '1');
      } else {
        localStorage.removeItem('gosh-fetch-always-ask-location');
      }
      localStorage.setItem('gosh-fetch-handle-torrent-files', torrentHandler ? '1' : '0');

      // Apply desktop integration settings.
      // On macOS magnet: registration is install-time, so this may fail silently.
      try {
        await setMagnetHandler(magnetLinks);
      } catch {}

      try {
        await setRunAtStartup(runAtStartup);
      } catch {}
    } catch (err) {
      console.error('Failed to save onboarding settings:', err);
    }

    localStorage.setItem('gosh-fetch-onboarding-done', '1');
    onComplete();
  }
</script>

<div class="ob-scrim" bind:this={overlayEl} role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
  <div class="modal ob-modal">
    <div class="ob-head">
      <div class="brand-mark ob-mark"><Icon name={STEPS[step].art} fill size={32} /></div>
      <div class="ob-title" id="onboarding-title">{STEPS[step].title}</div>
      {#if step === 0}
        <div class="ob-sub">
          A fast, private download manager for HTTP and BitTorrent — powered by a
          native Rust engine.{appVersion ? ` v${appVersion}` : ''}
        </div>
      {:else if step === 1}
        <div class="ob-sub">Pick a default save location. You can always change it per download.</div>
      {:else}
        <div class="ob-sub">Choose how Gosh-Fetch works with your desktop. All optional.</div>
      {/if}
    </div>

    <div class="modal-body ob-body">
      {#if step === 0}
        <div class="ob-feature-grid">
          <div class="ob-feature">
            <Icon name="bolt" fill size={20} style="color: var(--accent)" />
            <div>
              <div class="ft">Multi-segment</div>
              <div class="fd">Up to 128 parallel parts</div>
            </div>
          </div>
          <div class="ob-feature">
            <Icon name="hub" fill size={20} style="color: var(--accent)" />
            <div>
              <div class="ft">BitTorrent</div>
              <div class="fd">Magnet, DHT, PEX &amp; LPD</div>
            </div>
          </div>
          <div class="ob-feature">
            <Icon name="lock" fill size={20} style="color: var(--accent)" />
            <div>
              <div class="ft">Fully private</div>
              <div class="fd">No accounts, no telemetry</div>
            </div>
          </div>
          <div class="ob-feature">
            <Icon name="devices" fill size={20} style="color: var(--accent)" />
            <div>
              <div class="ft">Cross-platform</div>
              <div class="fd">Linux, macOS &amp; Windows</div>
            </div>
          </div>
        </div>
        <button class="ob-import-link" onclick={handleImportSettings}>
          <Icon name="file_upload" size={15} /> Import settings from a previous version
        </button>
      {/if}

      {#if step === 1}
        <div class="field">
          <label for="ob-download-path">Default download folder</label>
          <div class="input-group">
            <input id="ob-download-path" class="input mono" type="text" value={downloadPath} readonly />
            <button class="addon ob-addon-btn" onclick={handleBrowse} type="button">
              <Icon name="folder" size={16} /> Browse
            </button>
          </div>
        </div>

        <div class="set-row" style="border: none; padding: 8px 0 0">
          <div class="set-info">
            <div class="t" style="font-size: 13px">Always ask for save location</div>
            <div class="d">Prompt for destination before every download starts</div>
          </div>
          <Switch on={alwaysAskLocation} onToggle={() => (alwaysAskLocation = !alwaysAskLocation)} label="Always ask for save location" />
        </div>

        <div class="set-row" style="border: none; padding: 0">
          <div class="set-info">
            <div class="t" style="font-size: 13px">Theme</div>
            <div class="d">Paper (light) or Console (dark)</div>
          </div>
          <Segmented
            value={selectedTheme}
            options={[
              { v: 'light', l: 'Paper' },
              { v: 'dark', l: 'Console' },
              { v: 'system', l: 'Auto' },
            ]}
            onChange={(v) => (selectedTheme = v as Theme)}
            label="Theme"
          />
        </div>

        <div class="set-row" style="border: none; padding: 0">
          <div class="set-info">
            <div class="t" style="font-size: 13px">Signal color</div>
            <div class="d">Active / download highlight</div>
          </div>
          <div class="ob-accents">
            {#each ACCENTS as a (a.v)}
              <button
                class="ob-accent"
                class:on={theme.accent === a.v}
                style="background: hsl({a.v} 100% 50%)"
                title={a.name}
                aria-label={a.name}
                aria-pressed={theme.accent === a.v}
                onclick={() => theme.setAccent(a.v)}
              ></button>
            {/each}
          </div>
        </div>
      {/if}

      {#if step === 2}
        <div class="set-row">
          <div class="set-info">
            <div class="t">Default torrent handler</div>
            <div class="d">Automatically open .torrent files with Gosh-Fetch</div>
          </div>
          <Switch on={torrentHandler} onToggle={() => (torrentHandler = !torrentHandler)} label="Default torrent handler" />
        </div>
        <div class="set-row">
          <div class="set-info">
            <div class="t">Capture magnet links</div>
            <div class="d">Handle magnet: protocols from your web browser</div>
          </div>
          <Switch on={magnetLinks} onToggle={() => (magnetLinks = !magnetLinks)} label="Capture magnet links" />
        </div>
        <div class="set-row">
          <div class="set-info">
            <div class="t">Run at startup</div>
            <div class="d">Launch Gosh-Fetch automatically when you log in</div>
          </div>
          <Switch on={runAtStartup} onToggle={() => (runAtStartup = !runAtStartup)} label="Run at startup" />
        </div>

        <div class="ob-privacy">
          <Icon name="shield_lock" fill size={22} style="color: var(--accent-strong); flex: none" />
          <div>
            <b>Zero telemetry.</b> Gosh-Fetch runs 100% locally — no usage
            statistics, file metadata, or IP addresses ever leave your device.
          </div>
        </div>
      {/if}
    </div>

    <div class="modal-foot">
      <div class="ob-dots">
        {#each STEPS as _, i (i)}
          <span class="ob-dot" class:on={i === step}></span>
        {/each}
      </div>
      <div class="sp"></div>
      {#if step > 0}
        <button class="btn btn-ghost" onclick={() => (step = Math.max(0, step - 1))}>Back</button>
      {/if}
      {#if step === 0}
        <button class="btn btn-ghost" onclick={handleSkip}>Skip</button>
      {/if}
      {#if isLast}
        <button class="btn btn-primary" onclick={handleFinish}>
          <Icon name="check" size={17} /> Get started
        </button>
      {:else}
        <button class="btn btn-primary" onclick={() => (step = Math.min(STEPS.length - 1, step + 1))}>
          Continue
        </button>
      {/if}
    </div>
  </div>
</div>
