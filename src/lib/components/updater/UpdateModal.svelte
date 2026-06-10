<script lang="ts">
  import { updater } from '../../stores/updater.svelte';
  import './UpdateModal.css';

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function renderReleaseNotes(md: string): string {
    if (!md) return '<p>No release notes available.</p>';

    let html = md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/^[-*] (.+)$/gm, '<li>$1</li>');

    // Wrap consecutive <li> in <ul>
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    // Remaining plain lines as paragraphs
    html = html
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return '';
        if (trimmed.startsWith('<')) return trimmed;
        return `<p>${trimmed}</p>`;
      })
      .join('\n');

    return html;
  }

  const isComplete = $derived(updater.phase === 'downloaded');

  async function handleInstall() {
    try {
      await updater.installAndRestart();
    } catch (err) {
      console.error('Failed to install update:', err);
    }
  }
</script>

{#if updater.phase === 'downloading' || updater.phase === 'downloaded'}
  <div class="update-modal-backdrop">
    <div class="update-modal" role="dialog" aria-modal="true" aria-labelledby="update-modal-title">
      <!-- Header -->
      <div class="update-modal-header">
        <div class="update-modal-header-left">
          <div class="update-modal-icon-wrap">
            <span class="material-symbols-outlined">cloud_download</span>
          </div>
          <div>
            <h2 id="update-modal-title">Updating Gosh-Fetch</h2>
            <span class="update-modal-target">Target Version v{updater.version}</span>
          </div>
        </div>
        <span class="update-modal-status-pill{isComplete ? ' complete' : ''}">
          <span class="update-modal-status-dot{isComplete ? ' complete' : ''}"></span>
          {isComplete ? 'COMPLETE' : 'IN PROGRESS'}
        </span>
      </div>

      <!-- Progress Section -->
      <div class="update-modal-progress-section">
        <div class="update-modal-progress-info">
          <div class="update-modal-progress-left">
            <span class="update-modal-progress-label">
              {isComplete ? 'Download Complete' : 'Downloading Update...'}
            </span>
            <span class="update-modal-progress-detail">
              {formatBytes(updater.transferred)} / {formatBytes(updater.total)}
            </span>
          </div>
          <span class="update-modal-percent">{Math.round(updater.percent)}%</span>
        </div>
        <div class="update-modal-progress-track">
          <div
            class="update-modal-progress-fill{isComplete ? ' complete' : ''}"
            style="width: {updater.percent}%"
          ></div>
        </div>
      </div>

      <!-- Release Notes -->
      {#if updater.releaseNotes}
        <div class="update-modal-notes-section">
          <div class="update-modal-notes-label">
            <span class="material-symbols-outlined" style="font-size: 16px">sticky_note_2</span>
            <span>RELEASE NOTES</span>
          </div>
          <div class="update-modal-notes-body">
            {@html renderReleaseNotes(updater.releaseNotes)}
          </div>
        </div>
      {/if}

      <!-- Footer -->
      <div class="update-modal-footer">
        {#if isComplete}
          <button class="btn btn-primary" onclick={handleInstall}>
            <span class="material-symbols-outlined" style="font-size: 16px">restart_alt</span>
            Install &amp; Restart
          </button>
        {:else}
          <div class="update-modal-footer-note">
            <span class="material-symbols-outlined spin" style="font-size: 14px">sync</span>
            <span>Gosh-Fetch will restart automatically once the update is ready.</span>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
