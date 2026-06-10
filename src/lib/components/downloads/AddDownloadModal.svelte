<script lang="ts">
  import type { DownloadOptions, TorrentInfo } from '../../types/download';
  import { api } from '../../api/commands';
  import { selectFile, selectDirectory } from '../../api/system';
  import { downloads } from '../../stores/downloads.svelte';
  import { ui } from '../../stores/ui.svelte';
  import TorrentFilePicker from './TorrentFilePicker.svelte';
  import './AddDownloadModal.css';

  let mode = $state<'link' | 'torrent'>('link');
  let urls = $state('');
  let torrentPath = $state('');
  let isSubmitting = $state(false);
  let error = $state<string | null>(null);

  // Advanced options state
  let saveDir = $state('');
  let outFilename = $state('');
  let speedLimit = $state('');
  let connections = $state('');
  let priority = $state('normal');
  let customHeaders = $state('');
  let checksum = $state('');
  let sequential = $state(false);

  // File picker state for torrent files
  let torrentInfo = $state<TorrentInfo | null>(null);
  let showFilePicker = $state(false);
  let defaultSavePath = $state('');

  let modalEl = $state<HTMLDivElement | null>(null);

  function onClose() {
    ui.closeAddModal();
  }

  function buildOptions(): DownloadOptions | undefined {
    const opts: DownloadOptions = {};
    let hasOpts = false;

    if (saveDir.trim()) { opts.dir = saveDir.trim(); hasOpts = true; }
    if (outFilename.trim()) { opts.out = outFilename.trim(); hasOpts = true; }
    if (speedLimit.trim() && Number(speedLimit) > 0) {
      opts.maxDownloadLimit = `${speedLimit}M`;
      hasOpts = true;
    }
    if (connections.trim() && Number(connections) > 0) {
      opts.split = connections.trim();
      hasOpts = true;
    }
    if (priority !== 'normal') { opts.priority = priority; hasOpts = true; }
    if (customHeaders.trim()) {
      opts.header = customHeaders.split('\n').map(h => h.trim()).filter(h => h.length > 0);
      hasOpts = true;
    }
    if (checksum.trim()) { opts.checksum = checksum.trim(); hasOpts = true; }
    if (sequential) { opts.sequential = true; hasOpts = true; }

    return hasOpts ? opts : undefined;
  }

  async function handleSubmit() {
    error = null;
    isSubmitting = true;

    try {
      const options = buildOptions();

      if (mode === 'link') {
        const lines = urls.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) {
          error = 'Please provide at least one URL or magnet link';
          isSubmitting = false;
          return;
        }

        const magnetLines: string[] = [];
        const urlLines: string[] = [];
        for (const line of lines) {
          if (line.startsWith('magnet:')) {
            magnetLines.push(line);
          } else {
            urlLines.push(line);
          }
        }

        // Submit magnets
        for (const magnet of magnetLines) {
          await downloads.addMagnet(magnet, options);
        }

        // Submit URLs
        if (urlLines.length === 1) {
          await downloads.addDownload(urlLines[0], options);
        } else if (urlLines.length > 1) {
          await downloads.addUrls(urlLines, options);
        }
      } else if (mode === 'torrent') {
        if (!torrentPath) {
          error = 'Please select a .torrent file';
          isSubmitting = false;
          return;
        }

        // Parse torrent to check if it has multiple files
        try {
          const info = await api.parseTorrentFile(torrentPath);
          if (info.files.length > 1) {
            // Show file picker for multi-file torrents
            torrentInfo = info;
            showFilePicker = true;
            isSubmitting = false;
            return;
          }
        } catch {
          // If parse fails, proceed with adding directly
        }

        await downloads.addTorrentFile(torrentPath, options);
      }

      await downloads.fetchDownloads();
      onClose();
    } catch (e) {
      error = String(e);
    } finally {
      isSubmitting = false;
    }
  }

  async function handleBrowseTorrent() {
    const selected = await selectFile([{ name: 'Torrent files', extensions: ['torrent'] }]);
    if (selected) {
      torrentPath = selected;
    }
  }

  async function handleBrowseDir() {
    const selected = await selectDirectory();
    if (selected) {
      saveDir = selected;
    }
  }

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        urls = urls ? urls + '\n' + text : text;
      }
    } catch { /* ignore */ }
  }

  // Load default save path for file picker
  $effect(() => {
    api.getDefaultDownloadPath()
      .then((path) => { defaultSavePath = path; })
      .catch(() => {});
  });

  async function handleFilePickerConfirm(selectedIndices: number[]) {
    error = null;
    isSubmitting = true;
    try {
      const options = buildOptions() || {};
      // selectFile uses 1-based indices for the engine
      options.selectFile = selectedIndices.map(i => i + 1).join(',');
      await downloads.addTorrentFile(torrentPath, options);
      await downloads.fetchDownloads();
      onClose();
    } catch (e) {
      error = String(e);
      showFilePicker = false;
    } finally {
      isSubmitting = false;
    }
  }

  // Focus trap
  $effect(() => {
    const modal = modalEl;
    if (!modal) return;
    const focusable = modal.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
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
    modal.addEventListener('keydown', trapFocus);
    return () => modal.removeEventListener('keydown', trapFocus);
  });

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') onClose();
  }

  let hasMagnetContent = $derived(urls.split('\n').some(l => l.trim().startsWith('magnet:')));
  let showSequential = $derived(mode === 'torrent' || hasMagnetContent);
</script>

{#if showFilePicker && torrentInfo}
  <TorrentFilePicker
    torrentInfo={torrentInfo}
    savePath={saveDir || defaultSavePath}
    onConfirm={handleFilePickerConfirm}
    onCancel={() => (showFilePicker = false)}
  />
{:else}
  <div class="modal-backdrop" onclick={onClose} onkeydown={handleKeyDown} role="dialog" aria-modal="true" aria-labelledby="add-download-title">
    <div class="modal add-modal" onclick={(e) => e.stopPropagation()} bind:this={modalEl}>
      <!-- Header -->
      <div class="add-modal-header">
        <h2 id="add-download-title">Add New Download</h2>
        <button class="close-btn" onclick={onClose} aria-label="Close">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <!-- Body -->
      <div class="add-modal-body">
        <!-- Type Selector -->
        <div class="type-selector" role="tablist" aria-label="Download type">
          <button
            class={`type-selector-btn${mode === 'link' ? ' active' : ''}`}
            role="tab"
            aria-selected={mode === 'link'}
            onclick={() => (mode = 'link')}
          >
            <span class="material-symbols-outlined">link</span>
            Link / Magnet
          </button>
          <button
            class={`type-selector-btn${mode === 'torrent' ? ' active' : ''}`}
            role="tab"
            aria-selected={mode === 'torrent'}
            onclick={() => (mode = 'torrent')}
          >
            <span class="material-symbols-outlined">description</span>
            Torrent File
          </button>
        </div>

        <!-- Link Mode -->
        {#if mode === 'link'}
          <div class="source-section">
            <label>Download Sources</label>
            <div class="source-input-wrapper">
              <textarea
                class="source-textarea"
                bind:value={urls}
                placeholder="Paste URL or Magnet link here (one per line)..."
              ></textarea>
              <button
                class="source-paste-btn"
                onclick={handlePaste}
                title="Paste from Clipboard"
                type="button"
              >
                <span class="material-symbols-outlined">content_paste</span>
              </button>
            </div>
          </div>
        {/if}

        <!-- Torrent Mode -->
        {#if mode === 'torrent'}
          <div class="torrent-section">
            <label>Torrent File</label>
            <div class="torrent-file-picker">
              <input
                type="text"
                value={torrentPath}
                placeholder="Select a .torrent file..."
                readonly
              />
              <button
                class="torrent-browse-btn"
                onclick={handleBrowseTorrent}
                title="Browse for torrent file"
                type="button"
              >
                <span class="material-symbols-outlined">folder_open</span>
              </button>
            </div>
          </div>
        {/if}

        <!-- Advanced Options -->
        <details class="advanced-accordion">
          <summary>
            <div class="advanced-summary-left">
              <span class="material-symbols-outlined">tune</span>
              <span>Advanced Options</span>
            </div>
            <span class="material-symbols-outlined advanced-chevron">expand_more</span>
          </summary>
          <div class="advanced-grid">
            <!-- Save Directory (full width) -->
            <div class="advanced-field full-width">
              <label>Save Directory</label>
              <div class="save-dir-input">
                <input
                  type="text"
                  value={saveDir}
                  readonly
                  placeholder="Default download directory"
                />
                <button class="save-dir-browse" onclick={handleBrowseDir} type="button">
                  <span class="material-symbols-outlined">folder_open</span>
                </button>
              </div>
            </div>

            <!-- Rename File -->
            <div class="advanced-field">
              <label>Rename File</label>
              <input
                type="text"
                bind:value={outFilename}
                placeholder="Original filename"
              />
            </div>

            <!-- Priority -->
            <div class="advanced-field">
              <label>Priority</label>
              <div class="advanced-select-wrapper">
                <select bind:value={priority}>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </select>
                <div class="select-chevron">
                  <span class="material-symbols-outlined">unfold_more</span>
                </div>
              </div>
            </div>

            <!-- Checksum (full width) -->
            <div class="advanced-field full-width">
              <label>Checksum (MD5/SHA)</label>
              <input
                type="text"
                class="mono-input"
                bind:value={checksum}
                placeholder="Optional hash verification string..."
              />
            </div>

            <!-- Speed Limit -->
            <div class="advanced-field">
              <label>Speed Limit (MB/s)</label>
              <input
                type="number"
                min="0"
                value={speedLimit}
                oninput={(e) => (speedLimit = e.currentTarget.value)}
                placeholder="0 = unlimited"
              />
            </div>

            <!-- Connections -->
            <div class="advanced-field">
              <label>Connections</label>
              <input
                type="number"
                min="1"
                max="32"
                value={connections}
                oninput={(e) => (connections = e.currentTarget.value)}
                placeholder="Default"
              />
            </div>

            <!-- Custom Headers (full width) -->
            <div class="advanced-field full-width">
              <label>Custom Headers</label>
              <textarea
                bind:value={customHeaders}
                placeholder={'Authorization: Bearer token\nCookie: session=abc'}
                rows={2}
              ></textarea>
            </div>

            <!-- Sequential Toggle (torrent/magnet only) -->
            {#if showSequential}
              <div class="advanced-field full-width">
                <div class="sequential-toggle">
                  <span>Sequential download</span>
                  <label class="toggle-switch">
                    <input type="checkbox" bind:checked={sequential} />
                    <div class="toggle-track"></div>
                    <div class="toggle-thumb"></div>
                  </label>
                </div>
              </div>
            {/if}
          </div>
        </details>

        {#if error}<div class="add-modal-error">{error}</div>{/if}
      </div>

      <!-- Footer -->
      <div class="add-modal-footer">
        <button class="cancel-btn" onclick={onClose} type="button">
          Cancel
        </button>
        <button class="submit-btn" onclick={handleSubmit} disabled={isSubmitting} type="button">
          <span class="material-symbols-outlined">download</span>
          {isSubmitting ? 'Adding...' : 'Start Download'}
        </button>
      </div>
    </div>
  </div>
{/if}
