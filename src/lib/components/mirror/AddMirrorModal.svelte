<script lang="ts">
  import { mirror } from '../../stores/mirror.svelte';
  import { selectDirectory } from '../../api/system';
  import { formatBytes } from '../../utils/format';
  import { defaultMirrorOptions, type MirrorManifest, type MirrorOptions } from '../../types/mirror';
  import type { DownloadOptions } from '../../types/download';

  let { onClose }: { onClose: () => void } = $props();

  const PREVIEW_LIMIT = 50;

  let url = $state('');
  let saveDir = $state('');
  let maxDepth = $state(defaultMirrorOptions().max_depth);
  let sameHostOnly = $state(defaultMirrorOptions().same_host_only);
  let includePatterns = $state('');
  let excludePatterns = $state('');
  let preservePaths = $state(defaultMirrorOptions().preserve_paths);
  let failFast = $state(defaultMirrorOptions().fail_fast);

  let error = $state<string | null>(null);
  let isPreviewing = $state(false);
  let isStarting = $state(false);
  let manifest = $state<MirrorManifest | null>(null);

  function parsePatterns(value: string): string[] {
    return value
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }

  function buildMirrorOptions(): MirrorOptions {
    const opts = defaultMirrorOptions();
    const depth = Number(maxDepth);
    if (Number.isFinite(depth) && depth > 0) opts.max_depth = Math.floor(depth);
    opts.same_host_only = sameHostOnly;
    opts.include_patterns = parsePatterns(includePatterns);
    opts.exclude_patterns = parsePatterns(excludePatterns);
    opts.preserve_paths = preservePaths;
    opts.fail_fast = failFast;
    return opts;
  }

  function buildDownloadOptions(): DownloadOptions | undefined {
    const dir = saveDir.trim();
    return dir ? { dir } : undefined;
  }

  async function handleBrowse() {
    try {
      const dir = await selectDirectory();
      if (dir) saveDir = dir;
    } catch (e) {
      console.error('Failed to select directory:', e);
    }
  }

  async function handlePreview() {
    if (!url.trim()) return;
    error = null;
    isPreviewing = true;
    try {
      manifest = await mirror.discover(url.trim(), buildDownloadOptions(), buildMirrorOptions());
    } catch (e) {
      manifest = null;
      error = e instanceof Error ? e.message : String(e);
    } finally {
      isPreviewing = false;
    }
  }

  async function handleStart() {
    if (!url.trim()) return;
    error = null;
    isStarting = true;
    try {
      await mirror.addJob(url.trim(), buildDownloadOptions(), buildMirrorOptions());
      onClose();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      isStarting = false;
    }
  }
</script>

<div
  class="modal-backdrop"
  onclick={onClose}
  role="dialog"
  aria-modal="true"
  aria-labelledby="add-mirror-title"
>
  <div class="modal mirror-modal" onclick={(e) => e.stopPropagation()} role="document">
    <div class="modal-header">
      <h3 class="modal-title" id="add-mirror-title">New Mirror</h3>
      <button class="mirror-modal-close" onclick={onClose} aria-label="Close">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>

    <div class="modal-body">
      <div class="mirror-field">
        <label for="mirror-url">Directory URL</label>
        <input
          id="mirror-url"
          type="text"
          placeholder="https://example.com/files/"
          bind:value={url}
        />
      </div>

      <div class="mirror-field">
        <label for="mirror-dir">Destination Directory (optional)</label>
        <div class="mirror-dir-row">
          <input
            id="mirror-dir"
            type="text"
            placeholder="Default download directory"
            bind:value={saveDir}
          />
          <button class="mirror-dir-browse" onclick={handleBrowse} title="Browse">
            <span class="material-symbols-outlined">folder_open</span>
          </button>
        </div>
      </div>

      <details class="mirror-advanced">
        <summary>
          <div class="mirror-advanced-summary-left">
            <span class="material-symbols-outlined">tune</span>
            <span>Advanced</span>
          </div>
          <span class="material-symbols-outlined mirror-advanced-chevron">expand_more</span>
        </summary>
        <div class="mirror-advanced-grid">
          <div class="mirror-field">
            <label for="mirror-max-depth">Max Depth</label>
            <input id="mirror-max-depth" type="number" min="1" bind:value={maxDepth} />
          </div>
          <div class="mirror-field">
            <label for="mirror-same-host">Hosts</label>
            <div class="mirror-check-row">
              <input id="mirror-same-host" type="checkbox" bind:checked={sameHostOnly} />
              <label for="mirror-same-host">Same host only</label>
            </div>
          </div>
          <div class="mirror-field full-width">
            <label for="mirror-include">Include Patterns (comma-separated)</label>
            <input
              id="mirror-include"
              type="text"
              placeholder="*.iso, *.img"
              bind:value={includePatterns}
            />
          </div>
          <div class="mirror-field full-width">
            <label for="mirror-exclude">Exclude Patterns (comma-separated)</label>
            <input
              id="mirror-exclude"
              type="text"
              placeholder="*.tmp, *.log"
              bind:value={excludePatterns}
            />
          </div>
          <div class="mirror-field">
            <div class="mirror-check-row">
              <input id="mirror-preserve" type="checkbox" bind:checked={preservePaths} />
              <label for="mirror-preserve">Preserve paths</label>
            </div>
          </div>
          <div class="mirror-field">
            <div class="mirror-check-row">
              <input id="mirror-fail-fast" type="checkbox" bind:checked={failFast} />
              <label for="mirror-fail-fast">Fail fast</label>
            </div>
          </div>
        </div>
      </details>

      {#if error}
        <div class="mirror-modal-error">{error}</div>
      {/if}

      {#if manifest}
        <div class="mirror-preview">
          <div class="mirror-preview-header">
            <span class="material-symbols-outlined">travel_explore</span>
            <span>{manifest.entries.length} file{manifest.entries.length === 1 ? '' : 's'} found</span>
          </div>
          <div class="mirror-preview-list">
            {#each manifest.entries.slice(0, PREVIEW_LIMIT) as entry (entry.url)}
              <div class="mirror-preview-row">
                <span class="mirror-preview-path" title={entry.relative_path}>{entry.relative_path}</span>
                <span class="mirror-preview-size">
                  {entry.size_hint != null ? formatBytes(entry.size_hint) : '--'}
                </span>
              </div>
            {/each}
          </div>
          {#if manifest.entries.length > PREVIEW_LIMIT}
            <div class="mirror-preview-more">
              ...and {manifest.entries.length - PREVIEW_LIMIT} more
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick={onClose}>Cancel</button>
      <button
        class="btn btn-secondary"
        onclick={handlePreview}
        disabled={isPreviewing || isStarting || !url.trim()}
      >
        {#if isPreviewing}
          <span class="material-symbols-outlined spin" style="font-size: 16px">progress_activity</span>
          Discovering...
        {:else}
          <span class="material-symbols-outlined" style="font-size: 16px">travel_explore</span>
          Preview
        {/if}
      </button>
      <button
        class="btn btn-primary"
        onclick={handleStart}
        disabled={isStarting || isPreviewing || !url.trim()}
      >
        <span class="material-symbols-outlined" style="font-size: 16px">folder_copy</span>
        {isStarting ? 'Starting...' : 'Start Mirror'}
      </button>
    </div>
  </div>
</div>
