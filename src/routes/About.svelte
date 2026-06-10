<script lang="ts">
  import { api } from '../lib/api/commands';
  import './About.css';

  const TECH_STACK = [
    { name: 'Svelte', icon: 'code', color: '#FF3E00' },
    { name: 'Tauri', icon: 'desktop_windows', color: '#FFC131' },
    { name: 'Rust', icon: 'settings_suggest', color: '#DEA584' },
    { name: 'SQLite', icon: 'storage', color: '#3e8eb5' },
  ];

  let appInfo = $state<any>(null);

  $effect(() => {
    api.getAppInfo().then((info) => (appInfo = info)).catch(console.error);
  });
</script>

{#if !appInfo}
  <div class="page"><div class="about-loading">Loading...</div></div>
{:else}
  <div class="page">
    <div class="about-page">
      <!-- Hero -->
      <div class="about-hero">
        <div class="about-icon-box">
          <div class="icon-hover-gradient"></div>
          <img src="/logo.png" alt="Gosh-Fetch" />
        </div>
        <h1 class="about-title">{appInfo.name}</h1>
        <span class="about-version-badge">v{appInfo.version} Stable</span>
      </div>

      <!-- Tech Stack -->
      <div class="about-stack-section">
        <h3 class="about-stack-label">Tech Stack</h3>
        <div class="about-stack-grid">
          {#each TECH_STACK as tech (tech.name)}
            <div class="about-stack-card">
              <span class="material-symbols-outlined stack-icon" style="color: {tech.color}">
                {tech.icon}
              </span>
              <span class="stack-name">{tech.name}</span>
            </div>
          {/each}
        </div>
      </div>

      <!-- Footer Links -->
      <div class="about-footer-links">
        <a class="about-footer-link" href={appInfo.repository} target="_blank" rel="noopener noreferrer">
          <span class="material-symbols-outlined">code</span>
          GitHub Repo
        </a>
        <a
          class="about-footer-link"
          href={`${appInfo.repository}/blob/main/LICENSE`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span class="material-symbols-outlined">gavel</span>
          AGPL-3.0
        </a>
        <a
          class="about-footer-link report"
          href={`${appInfo.repository}/issues/new`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span class="material-symbols-outlined">bug_report</span>
          Report Issue
        </a>
      </div>
    </div>
  </div>
{/if}
