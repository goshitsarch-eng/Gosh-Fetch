<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { onMount } from 'svelte';

  let appInfo = $state<{
    name: string;
    version: string;
    description: string;
    license: string;
    repository: string;
    engine: {
      name: string;
      version: string;
      url: string;
      license: string;
      description: string;
    };
  } | null>(null);

  let engineRunning = $state<boolean>(false);

  onMount(async () => {
    try {
      appInfo = await invoke('get_app_info');
      const versionInfo = await invoke<{ running: boolean }>('get_engine_version');
      engineRunning = versionInfo.running;
    } catch (e) {
      console.error('Failed to load app info:', e);
    }
  });
</script>

<div class="page">
  <header class="page-header">
    <h1>About</h1>
  </header>

  <div class="about-content">
    {#if appInfo}
      <div class="app-hero">
        <div class="app-icon">&#11015;</div>
        <h2>{appInfo.name}</h2>
        <p class="app-version">Version {appInfo.version}</p>
        <p class="app-description">{appInfo.description}</p>
      </div>

      <section class="about-section">
        <h3>License</h3>
        <div class="card">
          <p>
            {appInfo.name} is free and open source software, licensed under
            <strong>{appInfo.license}</strong>.
          </p>
          <a
            href={appInfo.repository}
            target="_blank"
            rel="noopener noreferrer"
          >
            View source on GitHub
          </a>
        </div>
      </section>

      <section class="about-section">
        <h3>Download Engine</h3>
        <div class="card">
          <div class="attribution-item">
            <div class="attribution-header">
              <strong>{appInfo.engine.name}</strong>
              <span class="version-badge">v{appInfo.engine.version}</span>
              {#if engineRunning}
                <span class="status-badge running">Running</span>
              {:else}
                <span class="status-badge stopped">Stopped</span>
              {/if}
            </div>
            <p>{appInfo.engine.description}</p>
            <p class="attribution-license">
              License: {appInfo.engine.license}
            </p>
            <a
              href={appInfo.engine.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {appInfo.engine.url}
            </a>
          </div>
        </div>
      </section>

      <section class="about-section">
        <h3>Features</h3>
        <div class="card">
          <ul class="feature-list">
            <li>HTTP/HTTPS segmented downloads with resume support</li>
            <li>BitTorrent downloads from .torrent files</li>
            <li>Magnet URI support</li>
            <li>DHT, PEX, and LPD peer discovery</li>
            <li>Native Rust engine - no external dependencies</li>
          </ul>
        </div>
      </section>

      <section class="about-section">
        <h3>Privacy</h3>
        <div class="card">
          <ul class="privacy-list">
            <li>No telemetry or analytics</li>
            <li>No data collection</li>
            <li>No network activity unless explicitly initiated by you</li>
            <li>All data stored locally on your device</li>
          </ul>
        </div>
      </section>

    {:else}
      <div class="loading">Loading...</div>
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
    padding: var(--space-lg);
    border-bottom: 1px solid var(--border-primary);
    background: var(--bg-secondary);
  }

  .page-header h1 {
    font-size: 20px;
    margin: 0;
  }

  .about-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-lg);
  }

  .app-hero {
    text-align: center;
    padding: var(--space-xl) 0;
    margin-bottom: var(--space-lg);
  }

  .app-icon {
    font-size: 64px;
    color: var(--color-primary);
    margin-bottom: var(--space-md);
  }

  .app-hero h2 {
    font-size: 24px;
    margin: 0 0 var(--space-sm);
  }

  .app-version {
    font-size: 14px;
    color: var(--text-muted);
    margin: 0 0 var(--space-md);
  }

  .app-description {
    font-size: 16px;
    color: var(--text-secondary);
    margin: 0;
  }

  .about-section {
    margin-bottom: var(--space-lg);
  }

  .about-section h3 {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: var(--space-sm);
  }

  .card {
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    padding: var(--space-md);
  }

  .card p {
    margin: 0 0 var(--space-sm);
  }

  .card a {
    font-size: 13px;
  }

  .attribution-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .attribution-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .version-badge {
    font-size: 11px;
    padding: 2px 6px;
    background: var(--bg-hover);
    border-radius: var(--radius-sm);
    color: var(--text-muted);
  }

  .status-badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    font-weight: 500;
  }

  .status-badge.running {
    background: color-mix(in srgb, var(--color-success) 20%, transparent);
    color: var(--color-success);
  }

  .status-badge.stopped {
    background: color-mix(in srgb, var(--color-error) 20%, transparent);
    color: var(--color-error);
  }

  .attribution-license {
    font-size: 12px;
    color: var(--text-muted);
  }

  .feature-list,
  .privacy-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .feature-list li,
  .privacy-list li {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) 0;
    color: var(--text-secondary);
  }

  .feature-list li::before {
    content: '>';
    color: var(--color-primary);
    font-weight: bold;
  }

  .privacy-list li::before {
    content: '\2713';
    color: var(--color-success);
    font-weight: bold;
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: var(--text-muted);
  }
</style>
