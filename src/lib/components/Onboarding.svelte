<script lang="ts">
  import { api } from '../api/commands';
  import {
    selectFile,
    selectDirectory,
    setRunAtStartup,
    getRunAtStartup,
    setMagnetHandler,
    isMagnetHandler,
  } from '../api/system';
  import { theme } from '../stores/theme.svelte';
  import type { Theme } from '../stores/theme.svelte';
  import './Onboarding.css';

  let { onComplete }: { onComplete: () => void } = $props();

  let step = $state(1);
  let downloadPath = $state('');
  let alwaysAskLocation = $state(false);
  let selectedTheme = $state<Theme>(theme.theme);
  let torrentHandler = $state(true);
  let magnetLinks = $state(true);
  let runAtStartup = $state(false);
  let appVersion = $state('');
  let overlayEl = $state<HTMLDivElement | null>(null);

  // Load defaults on mount
  $effect(() => {
    (async () => {
      try {
        downloadPath = await api.getDefaultDownloadPath();
      } catch {}
      try {
        appVersion = await api.getAppVersion();
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

  function goNext() {
    step = Math.min(step + 1, 3);
  }

  function goBack() {
    step = Math.max(step - 1, 1);
  }

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

<div class="onboarding-overlay" bind:this={overlayEl} role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
  {#if step === 1}
    <!-- Step 1: Welcome -->
    <div class="welcome-step">
      <div class="welcome-bg"></div>

      <header class="welcome-header">
        <div class="welcome-version">
          <span class="material-symbols-outlined">cloud_download</span>
          <span>{appVersion ? `v${appVersion}` : ''}</span>
        </div>
        <div class="welcome-window-controls">
          <button tabindex="-1" aria-label="window control"></button>
          <button tabindex="-1" aria-label="window control"></button>
          <button tabindex="-1" aria-label="window control"></button>
        </div>
      </header>

      <main class="welcome-content">
        <div class="welcome-hero">
          <div class="welcome-logo-ring">
            <div class="welcome-logo-icon">
              <span class="material-symbols-outlined">bolt</span>
            </div>
          </div>
          <div class="welcome-text">
            <h1 id="onboarding-title" class="welcome-title">
              Welcome to <span class="highlight">Gosh-Fetch</span>
            </h1>
            <p class="welcome-subtitle">
              A fast, transparent, and user-centric download manager.
            </p>
          </div>
        </div>

        <div class="welcome-features">
          <div class="welcome-feature-card">
            <div class="feature-icon blue">
              <span class="material-symbols-outlined">speed</span>
            </div>
            <div class="feature-text">
              <h3>Rust-Powered Speed</h3>
              <p>Optimized specifically for low memory usage and high throughput on all connections.</p>
            </div>
          </div>

          <div class="welcome-feature-card">
            <div class="feature-icon emerald">
              <span class="material-symbols-outlined">hub</span>
            </div>
            <div class="feature-text">
              <h3>Native BitTorrent</h3>
              <p>Handle magnet links directly within the app without needing third-party plugins.</p>
            </div>
          </div>

          <div class="welcome-feature-card">
            <div class="feature-icon purple">
              <span class="material-symbols-outlined">security</span>
            </div>
            <div class="feature-text">
              <h3>Privacy First</h3>
              <p>Zero telemetry. Your download history stays local and is never shared.</p>
            </div>
          </div>
        </div>

        <div class="welcome-cta-section">
          <button class="welcome-cta-btn" onclick={goNext}>
            <span>Get Started</span>
            <span class="material-symbols-outlined">arrow_forward</span>
          </button>
          <button class="welcome-import-link" onclick={handleImportSettings}>
            <span class="material-symbols-outlined">file_upload</span>
            Import settings from previous version
          </button>
        </div>
      </main>

      <div class="welcome-bottom-line"></div>
    </div>
  {/if}

  {#if step > 1}
    <header class="onboarding-header">
      <div class="onboarding-logo">
        <span class="material-symbols-outlined">bolt</span>
        <span>Gosh-Fetch</span>
      </div>
      <div class="onboarding-step-info">
        <span class="onboarding-step-label">Step {step} of 3</span>
        <div class="onboarding-progress-track">
          <div
            class="onboarding-progress-fill"
            style="width: {(step / 3) * 100}%"
          ></div>
        </div>
      </div>
    </header>
  {/if}

  {#if step === 2}
    <!-- Step 2: Initial Setup -->
    <div class="setup-step">
      <div class="setup-left-pane">
        <div>
          <div class="setup-left-icon">
            <span class="material-symbols-outlined">folder_managed</span>
          </div>
          <h1>Default Save Location</h1>
          <p class="setup-desc">
            Choose where your files will be saved by default. We recommend selecting a drive with plenty of free space for large downloads.
          </p>
        </div>
        <div class="setup-left-hint">
          <span class="material-symbols-outlined">info</span>
          <p>You can change this later in settings.</p>
        </div>
      </div>

      <div class="setup-right-pane">
        <div class="setup-right-inner">
          <!-- Storage Configuration -->
          <div class="setup-section">
            <h2>Storage Configuration</h2>
            <div class="setup-path-label">Downloads Folder</div>
            <div class="setup-path-row">
              <input
                type="text"
                class="setup-path-input"
                value={downloadPath}
                readonly
              />
              <button class="setup-browse-btn" onclick={handleBrowse}>
                <span class="material-symbols-outlined">folder_open</span>
                Browse
              </button>
            </div>

            <div class="ob-toggle-card">
              <div class="ob-toggle-info">
                <span class="title">Always ask for save location</span>
                <span class="desc">Prompt for destination before every download starts</span>
              </div>
              <label class="ob-toggle">
                <input
                  type="checkbox"
                  bind:checked={alwaysAskLocation}
                />
                <span class="ob-toggle-track"></span>
                <span class="ob-toggle-thumb"></span>
              </label>
            </div>
          </div>

          <div class="setup-divider"></div>

          <!-- Theme Preference -->
          <div class="setup-section">
            <h2>Theme Preference</h2>
            <div class="theme-select-grid">
              <button
                class="theme-select-card{selectedTheme === 'system' ? ' selected' : ''}"
                onclick={() => (selectedTheme = 'system')}
              >
                <div class="theme-select-card-icon system">
                  <span class="material-symbols-outlined">settings_brightness</span>
                </div>
                <span>System</span>
                <div class="theme-check">
                  <span class="material-symbols-outlined">check_circle</span>
                </div>
              </button>

              <button
                class="theme-select-card{selectedTheme === 'light' ? ' selected' : ''}"
                onclick={() => (selectedTheme = 'light')}
              >
                <div class="theme-select-card-icon light">
                  <span class="material-symbols-outlined">light_mode</span>
                </div>
                <span>Light</span>
                <div class="theme-check">
                  <span class="material-symbols-outlined">check_circle</span>
                </div>
              </button>

              <button
                class="theme-select-card{selectedTheme === 'dark' ? ' selected' : ''}"
                onclick={() => (selectedTheme = 'dark')}
              >
                <div class="theme-select-card-icon dark">
                  <span class="material-symbols-outlined">dark_mode</span>
                </div>
                <span>Dark</span>
                <div class="theme-check">
                  <span class="material-symbols-outlined">check_circle</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}

  {#if step === 3}
    <!-- Step 3: Desktop Integration -->
    <div class="integration-step">
      <div class="integration-inner">
        <!-- Step progress -->
        <div class="step-progress">
          <div class="step-progress-header">
            <span class="step-count">Step 3 of 3</span>
            <span class="step-active">Integration</span>
          </div>
          <div class="step-progress-bars">
            <div class="bar completed"></div>
            <div class="bar completed"></div>
            <div class="bar active"></div>
          </div>
          <div class="step-progress-labels">
            <span>Appearance</span>
            <span>Network</span>
            <span class="active">Integration</span>
          </div>
        </div>

        <!-- Heading -->
        <div class="integration-heading">
          <h1>Desktop Integration</h1>
          <p>
            Configure how Gosh-Fetch interacts with your OS. You can change these settings later in preferences.
          </p>
        </div>

        <!-- Toggle cards -->
        <div class="integration-toggles">
          <label class="integration-toggle-card">
            <div class="integration-toggle-left">
              <div class="integration-toggle-icon">
                <span class="material-symbols-outlined">folder_zip</span>
              </div>
              <div class="integration-toggle-text">
                <h3>Default Torrent Handler</h3>
                <p>Automatically open .torrent files with Gosh-Fetch</p>
              </div>
            </div>
            <div class="ob-toggle">
              <input
                type="checkbox"
                bind:checked={torrentHandler}
              />
              <span class="ob-toggle-track"></span>
              <span class="ob-toggle-thumb"></span>
            </div>
          </label>

          <label class="integration-toggle-card">
            <div class="integration-toggle-left">
              <div class="integration-toggle-icon">
                <span class="material-symbols-outlined">link</span>
              </div>
              <div class="integration-toggle-text">
                <h3>Capture Magnet Links</h3>
                <p>Handle magnet: protocols from your web browser</p>
              </div>
            </div>
            <div class="ob-toggle">
              <input
                type="checkbox"
                bind:checked={magnetLinks}
              />
              <span class="ob-toggle-track"></span>
              <span class="ob-toggle-thumb"></span>
            </div>
          </label>

          <label class="integration-toggle-card">
            <div class="integration-toggle-left">
              <div class="integration-toggle-icon">
                <span class="material-symbols-outlined">rocket_launch</span>
              </div>
              <div class="integration-toggle-text">
                <h3>Run at Startup</h3>
                <p>Launch Gosh-Fetch automatically when you log in</p>
              </div>
            </div>
            <div class="ob-toggle">
              <input
                type="checkbox"
                bind:checked={runAtStartup}
              />
              <span class="ob-toggle-track"></span>
              <span class="ob-toggle-thumb"></span>
            </div>
          </label>
        </div>

        <!-- Privacy info box -->
        <div class="privacy-box">
          <div class="privacy-box-inner">
            <div class="privacy-box-content">
              <div class="privacy-badge">
                <span class="material-symbols-outlined">security</span>
                <span>Privacy First</span>
              </div>
              <h3>Zero Telemetry Promise</h3>
              <p>
                Gosh-Fetch runs 100% locally on your machine. We do not collect usage statistics, file metadata, or IP addresses. Your data never leaves your device.
              </p>
            </div>
            <div class="privacy-graphic">
              <span class="material-symbols-outlined">shield_lock</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}

  {#if step > 1}
    <footer class="onboarding-footer">
      <button class="ob-btn-back" onclick={goBack}>
        <span class="material-symbols-outlined">arrow_back</span>
        Back
      </button>
      {#if step === 2}
        <button class="ob-btn-next" onclick={goNext}>
          Next Step
          <span class="material-symbols-outlined">arrow_forward</span>
        </button>
      {/if}
      {#if step === 3}
        <button class="ob-btn-next" onclick={handleFinish}>
          Finish Setup
          <span class="material-symbols-outlined">check</span>
        </button>
      {/if}
    </footer>
  {/if}
</div>
