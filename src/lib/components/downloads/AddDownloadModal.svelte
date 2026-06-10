<script lang="ts">
  import type { DownloadOptions, TorrentInfo } from '../../types/download';
  import { api } from '../../api/commands';
  import { selectFile, selectDirectory } from '../../api/system';
  import { downloads } from '../../stores/downloads.svelte';
  import { ui } from '../../stores/ui.svelte';
  import Icon from '../ui/Icon.svelte';
  import TorrentFilePicker from './TorrentFilePicker.svelte';
  import './AddDownloadModal.css';

  let mode = $state<'link' | 'torrent'>('link');
  let urls = $state('');
  let torrentPath = $state('');
  let isSubmitting = $state(false);
  let error = $state<string | null>(null);

  // Advanced options state
  let advOpen = $state(false);
  let saveDir = $state('');
  let outFilename = $state('');
  let speedLimit = $state('');
  let connections = $state('');
  let priority = $state('normal');
  let customHeaders = $state('');
  let checksum = $state('');
  let mirrors = $state('');
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
    if (mirrors.trim()) {
      opts.mirrors = mirrors.split('\n').map(m => m.trim()).filter(m => m.length > 0);
      hasOpts = true;
    }
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

  // Source preview for the first pasted line
  let firstLine = $derived(urls.split('\n').map(l => l.trim()).filter(l => l.length > 0)[0] ?? '');
  let previewIsTorrent = $derived(
    firstLine.startsWith('magnet:') || firstLine.toLowerCase().endsWith('.torrent')
  );
  let previewName = $derived.by(() => {
    if (!firstLine) return '';
    if (firstLine.startsWith('magnet:')) return 'magnet link';
    try {
      const p = new URL(firstLine).pathname.split('/').pop();
      return p || 'download';
    } catch {
      return 'download';
    }
  });
</script>

{#if showFilePicker && torrentInfo}
  <TorrentFilePicker
    torrentInfo={torrentInfo}
    savePath={saveDir || defaultSavePath}
    onConfirm={handleFilePickerConfirm}
    onCancel={() => (showFilePicker = false)}
  />
{:else}
  <div
    class="scrim"
    onclick={(e) => e.target === e.currentTarget && onClose()}
    onkeydown={handleKeyDown}
    role="presentation"
  >
    <div class="modal" bind:this={modalEl} role="dialog" aria-modal="true" aria-labelledby="add-download-title">
      <div class="modal-head">
        <div class="dl-icon http"><Icon name="add_link" size={21} /></div>
        <div style="flex: 1">
          <div class="ttl" id="add-download-title">Add Download</div>
          <div class="sub">Paste a URL, magnet link, or pick a .torrent file</div>
        </div>
        <button class="icon-btn" onclick={onClose} aria-label="Close"><Icon name="close" /></button>
      </div>

      <div class="modal-body">
        <div class="seg-ctrl" role="tablist" aria-label="Download type">
          <button
            class:on={mode === 'link'}
            role="tab"
            aria-selected={mode === 'link'}
            onclick={() => (mode = 'link')}
          >
            <Icon name="link" size={15} /> Link / Magnet
          </button>
          <button
            class:on={mode === 'torrent'}
            role="tab"
            aria-selected={mode === 'torrent'}
            onclick={() => (mode = 'torrent')}
          >
            <Icon name="description" size={15} /> Torrent File
          </button>
        </div>

        {#if mode === 'link'}
          <div class="field">
            <label for="add-source">Source</label>
            <div class="source-wrap">
              <textarea
                id="add-source"
                class="input mono"
                rows="3"
                bind:value={urls}
                placeholder="https://example.com/file.iso&#10;magnet:?xt=urn:btih:…  (one per line)"
              ></textarea>
              <button class="paste-btn" onclick={handlePaste} title="Paste from clipboard" type="button">
                <Icon name="content_paste" size={16} />
              </button>
            </div>
          </div>

          {#if firstLine}
            <div class="source-preview">
              <Icon
                name={previewIsTorrent ? 'hub' : 'public'}
                size={20}
                style="color: {previewIsTorrent ? 'var(--seed)' : 'var(--accent)'}"
              />
              <div class="sp-info">
                <div class="sp-name">{previewName}</div>
                <div class="sp-sub">{previewIsTorrent ? 'BitTorrent' : 'HTTP / HTTPS'} · saving to {saveDir || defaultSavePath || 'default folder'}</div>
              </div>
              <span class="pill {previewIsTorrent ? 'seed' : 'done'}">
                <span class="pill-dot"></span>{previewIsTorrent ? 'Torrent' : 'Direct'}
              </span>
            </div>
          {/if}
        {/if}

        {#if mode === 'torrent'}
          <div class="field">
            <label for="add-torrent-path">Torrent file</label>
            <div class="input-group">
              <input
                id="add-torrent-path"
                class="input mono"
                type="text"
                value={torrentPath}
                placeholder="Select a .torrent file…"
                readonly
              />
              <button class="addon addon-btn" onclick={handleBrowseTorrent} type="button" title="Browse">
                <Icon name="folder_open" size={17} />
              </button>
            </div>
          </div>
        {/if}

        <div class="disclosure" class:open={advOpen}>
          <button class="disclosure-head" onclick={() => (advOpen = !advOpen)}>
            <Icon name="tune" size={18} /> Advanced options
            <Icon name="expand_more" class="chev" size={20} />
          </button>
          {#if advOpen}
            <div class="disclosure-body">
              <div class="field full">
                <label for="add-save-dir">Save directory</label>
                <div class="input-group">
                  <input
                    id="add-save-dir"
                    class="input mono"
                    type="text"
                    value={saveDir}
                    readonly
                    placeholder="Default download directory"
                  />
                  <button class="addon addon-btn" onclick={handleBrowseDir} type="button" title="Browse">
                    <Icon name="folder" size={17} />
                  </button>
                </div>
              </div>

              <div class="field">
                <label for="add-rename">Custom filename</label>
                <input id="add-rename" class="input" type="text" bind:value={outFilename} placeholder="Auto-detect" />
              </div>

              <div class="field">
                <label id="add-priority-label">Priority</label>
                <div class="seg-ctrl" role="group" aria-labelledby="add-priority-label">
                  {#each ['low', 'normal', 'high', 'critical'] as p (p)}
                    <button class:on={priority === p} onclick={() => (priority = p)}>{p}</button>
                  {/each}
                </div>
              </div>

              <div class="field">
                <label for="add-speed-limit">Speed limit</label>
                <div class="input-group">
                  <input
                    id="add-speed-limit"
                    class="input mono"
                    type="number"
                    min="0"
                    value={speedLimit}
                    oninput={(e) => (speedLimit = e.currentTarget.value)}
                    placeholder="0 = unlimited"
                  />
                  <span class="addon">MB/s</span>
                </div>
              </div>

              <div class="field">
                <label for="add-connections">Connections</label>
                <input
                  id="add-connections"
                  class="input mono"
                  type="number"
                  min="1"
                  max="32"
                  value={connections}
                  oninput={(e) => (connections = e.currentTarget.value)}
                  placeholder="Default"
                />
              </div>

              <div class="field full">
                <label for="add-checksum">Checksum (MD5 / SHA)</label>
                <input
                  id="add-checksum"
                  class="input mono"
                  type="text"
                  bind:value={checksum}
                  placeholder="Optional integrity hash…"
                />
              </div>

              <div class="field full">
                <label for="add-headers">HTTP headers <span class="label-hint">(one per line)</span></label>
                <textarea
                  id="add-headers"
                  class="input mono"
                  bind:value={customHeaders}
                  placeholder={'Authorization: Bearer …\nReferer: https://…'}
                  rows="2"
                ></textarea>
              </div>

              <div class="field full">
                <label for="add-mirrors">Mirror / failover URLs <span class="label-hint">(one per line)</span></label>
                <textarea
                  id="add-mirrors"
                  class="input mono"
                  bind:value={mirrors}
                  placeholder="https://mirror2.example.com/file.iso"
                  rows="2"
                ></textarea>
              </div>

              {#if showSequential}
                <div class="adv-toggle-row full">
                  <div class="set-info">
                    <div class="t" style="font-size: 13px">Sequential download</div>
                    <div class="d">Download pieces in order for streaming media</div>
                  </div>
                  <button
                    class="switch"
                    class:on={sequential}
                    onclick={() => (sequential = !sequential)}
                    aria-pressed={sequential}
                    aria-label="Sequential download"
                  ><i></i></button>
                </div>
              {/if}
            </div>
          {/if}
        </div>

        {#if error}
          <div class="add-error">
            <Icon name="error" size={15} />
            <span>{error}</span>
          </div>
        {/if}
      </div>

      <div class="modal-foot">
        <button class="btn btn-ghost" onclick={onClose} type="button">Cancel</button>
        <div class="sp"></div>
        <button class="btn btn-primary" onclick={handleSubmit} disabled={isSubmitting} type="button">
          <Icon name="download" size={18} />
          {isSubmitting ? 'Adding…' : 'Download now'}
        </button>
      </div>
    </div>
  </div>
{/if}
