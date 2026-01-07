<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { onMount } from 'svelte';

  let appInfo = $state<{
    name: string;
    version: string;
    description: string;
    license: string;
    repository: string;
    attribution: {
      aria2: {
        name: string;
        url: string;
        license: string;
        note: string;
      };
      openssl: {
        name: string;
        url: string;
        license: string;
        note: string;
      };
    };
  } | null>(null);

  let aria2Version = $state<string | null>(null);

  onMount(async () => {
    try {
      appInfo = await invoke('get_app_info');
      const versionInfo = await invoke<{ version: string }>('get_aria2_version');
      aria2Version = versionInfo.version;
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
        <div class="app-icon">⬇</div>
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
            View source on GitHub →
          </a>
        </div>
      </section>

      <section class="about-section">
        <h3>Third-Party Software</h3>
        <div class="card">
          <div class="attribution-item">
            <div class="attribution-header">
              <strong>{appInfo.attribution.aria2.name}</strong>
              {#if aria2Version}
                <span class="version-badge">v{aria2Version}</span>
              {/if}
            </div>
            <p>{appInfo.attribution.aria2.note}</p>
            <p class="attribution-license">
              License: {appInfo.attribution.aria2.license}
            </p>
            <a
              href={appInfo.attribution.aria2.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {appInfo.attribution.aria2.url}
            </a>
          </div>
          <hr class="attribution-divider" />
          <div class="attribution-item">
            <div class="attribution-header">
              <strong>{appInfo.attribution.openssl.name}</strong>
            </div>
            <p>{appInfo.attribution.openssl.note}</p>
            <p class="attribution-license">
              License: {appInfo.attribution.openssl.license}
            </p>
            <a
              href={appInfo.attribution.openssl.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {appInfo.attribution.openssl.url}
            </a>
          </div>
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

  .attribution-license {
    font-size: 12px;
    color: var(--text-muted);
  }

  .attribution-divider {
    border: none;
    border-top: 1px solid var(--border-primary);
    margin: var(--space-md) 0;
  }

  .privacy-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .privacy-list li {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) 0;
    color: var(--text-secondary);
  }

  .privacy-list li::before {
    content: '✓';
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
