<script lang="ts">
  let {
    theme,
    onThemeChange,
  }: {
    theme: string;
    onThemeChange: (theme: 'dark' | 'light') => void;
  } = $props();
</script>

<div class="settings-panel-inner">
  <section class="settings-section">
    <div class="settings-section-title">
      <span class="material-symbols-outlined">palette</span>
      <h3>Theme</h3>
    </div>
    <div class="settings-card">
      <div class="theme-cards">
        <button
          class="theme-card{theme === 'dark' ? ' selected' : ''}"
          onclick={() => onThemeChange('dark')}
        >
          <span class="material-symbols-outlined" style="font-size: 24px">dark_mode</span>
          <span>Dark</span>
        </button>
        <button
          class="theme-card{theme === 'light' ? ' selected' : ''}"
          onclick={() => onThemeChange('light')}
        >
          <span class="material-symbols-outlined" style="font-size: 24px">light_mode</span>
          <span>Light</span>
        </button>
      </div>
    </div>
  </section>
</div>
