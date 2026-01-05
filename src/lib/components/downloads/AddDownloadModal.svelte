<script lang="ts">
  import { addDownload, addMagnet, addTorrentFile } from '../../stores/downloads.svelte';
  import { open } from '@tauri-apps/plugin-dialog';

  interface Props {
    onClose: () => void;
  }

  let { onClose }: Props = $props();

  let mode = $state<'url' | 'torrent' | 'magnet'>('url');
  let url = $state('');
  let magnetUri = $state('');
  let torrentPath = $state('');
  let isSubmitting = $state(false);
  let error = $state<string | null>(null);

  async function handleSubmit() {
    error = null;
    isSubmitting = true;

    try {
      if (mode === 'url' && url.trim()) {
        // Check if it's a magnet link
        if (url.trim().startsWith('magnet:')) {
          await addMagnet(url.trim());
        } else {
          await addDownload(url.trim());
        }
      } else if (mode === 'magnet' && magnetUri.trim()) {
        await addMagnet(magnetUri.trim());
      } else if (mode === 'torrent' && torrentPath) {
        await addTorrentFile(torrentPath);
      } else {
        error = 'Please provide a valid URL, magnet link, or torrent file';
        isSubmitting = false;
        return;
      }
      onClose();
    } catch (e) {
      error = String(e);
    } finally {
      isSubmitting = false;
    }
  }

  async function handleBrowseTorrent() {
    const selected = await open({
      multiple: false,
      filters: [
        { name: 'Torrent files', extensions: ['torrent'] },
      ],
    });

    if (selected && typeof selected === 'string') {
      torrentPath = selected;
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onClose();
    } else if (event.key === 'Enter' && !event.shiftKey) {
      handleSubmit();
    }
  }
</script>

<div class="modal-backdrop" onclick={onClose} onkeydown={handleKeyDown}>
  <div class="modal" onclick={(e) => e.stopPropagation()}>
    <div class="modal-header">
      <h3 class="modal-title">Add Download</h3>
      <button class="btn btn-ghost btn-icon" onclick={onClose}>
        ✕
      </button>
    </div>

    <div class="modal-body">
      <div class="mode-tabs">
        <button
          class="mode-tab"
          class:active={mode === 'url'}
          onclick={() => (mode = 'url')}
        >
          URL
        </button>
        <button
          class="mode-tab"
          class:active={mode === 'magnet'}
          onclick={() => (mode = 'magnet')}
        >
          Magnet
        </button>
        <button
          class="mode-tab"
          class:active={mode === 'torrent'}
          onclick={() => (mode = 'torrent')}
        >
          Torrent File
        </button>
      </div>

      {#if mode === 'url'}
        <div class="form-group">
          <label for="url">Download URL</label>
          <input
            id="url"
            type="url"
            bind:value={url}
            placeholder="https://example.com/file.zip"
            autofocus
          />
          <p class="help-text">Supports HTTP, HTTPS, FTP, and magnet links</p>
        </div>
      {:else if mode === 'magnet'}
        <div class="form-group">
          <label for="magnet">Magnet Link</label>
          <textarea
            id="magnet"
            bind:value={magnetUri}
            placeholder="magnet:?xt=urn:btih:..."
            rows="3"
          ></textarea>
        </div>
      {:else if mode === 'torrent'}
        <div class="form-group">
          <label>Torrent File</label>
          <div class="file-input">
            <input
              type="text"
              value={torrentPath}
              placeholder="Select a .torrent file"
              readonly
            />
            <button class="btn btn-secondary" onclick={handleBrowseTorrent}>
              Browse
            </button>
          </div>
        </div>
      {/if}

      {#if error}
        <div class="error-message">{error}</div>
      {/if}
    </div>

    <div class="modal-footer">
      <button class="btn btn-secondary" onclick={onClose}>
        Cancel
      </button>
      <button
        class="btn btn-primary"
        onclick={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Adding...' : 'Add Download'}
      </button>
    </div>
  </div>
</div>

<style>
  .mode-tabs {
    display: flex;
    gap: var(--space-xs);
    margin-bottom: var(--space-lg);
    padding: var(--space-xs);
    background: var(--bg-tertiary);
    border-radius: var(--radius-md);
  }

  .mode-tab {
    flex: 1;
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
    transition: all var(--transition-fast);
  }

  .mode-tab:hover {
    color: var(--text-primary);
  }

  .mode-tab.active {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .form-group label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  textarea {
    resize: vertical;
    min-height: 80px;
    font-family: var(--font-mono);
    font-size: 12px;
  }

  .file-input {
    display: flex;
    gap: var(--space-sm);
  }

  .file-input input {
    flex: 1;
  }

  .help-text {
    font-size: 12px;
    color: var(--text-muted);
  }

  .error-message {
    padding: var(--space-sm) var(--space-md);
    background: var(--color-destructive)15;
    border: 1px solid var(--color-destructive)30;
    border-radius: var(--radius-md);
    color: var(--color-destructive);
    font-size: 13px;
    margin-top: var(--space-md);
  }
</style>
