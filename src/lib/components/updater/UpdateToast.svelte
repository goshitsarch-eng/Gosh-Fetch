<script lang="ts">
  import { updater } from '../../stores/updater.svelte';
  import './UpdateToast.css';

  function handleLater() {
    updater.dismiss();
  }

  async function handleUpdateNow() {
    try {
      await updater.download();
    } catch (err) {
      console.error('Failed to start update download:', err);
    }
  }
</script>

{#if updater.phase === 'available' && !updater.dismissed}
  <div class="update-toast" role="alert" aria-live="polite">
    <button class="update-toast-close" onclick={handleLater} aria-label="Close">
      <span class="material-symbols-outlined">close</span>
    </button>

    <div class="update-toast-header">
      <div class="update-toast-icon-badge">
        <span class="material-symbols-outlined">bolt</span>
      </div>
      <div class="update-toast-header-text">
        <span class="update-toast-label">GOSH-FETCH</span>
        <span class="update-toast-version">
          v{updater.version}
          <span class="update-toast-pulse-dot"></span>
        </span>
      </div>
    </div>

    <div class="update-toast-body">
      <h4 class="update-toast-title">New Update Available</h4>
      <p class="update-toast-desc">
        A fresh build is ready to install. This update includes improvements and bug fixes.
      </p>
    </div>

    <div class="update-toast-actions">
      <button class="btn btn-ghost" onclick={handleLater}>Later</button>
      <button class="btn btn-primary" onclick={handleUpdateNow}>
        <span class="material-symbols-outlined" style="font-size: 16px">download</span>
        Update Now
      </button>
    </div>
  </div>
{/if}
