<script lang="ts">
  import { mirror } from '../../stores/mirror.svelte';
  import { selectDirectory } from '../../api/system';
  import { formatBytes } from '../../utils/format';
  import { defaultMirrorOptions, type MirrorManifest, type MirrorOptions } from '../../types/mirror';
  import type { DownloadOptions } from '../../types/download';
  import Icon from '../ui/Icon.svelte';
  import Switch from '../ui/Switch.svelte';

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

  let advOpen = $state(false);
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

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<div
  class="scrim"
  onclick={(e) => e.target === e.currentTarget && onClose()}
  onkeydown={handleKeyDown}
  role="presentation"
>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="add-mirror-title">
    <div class="modal-head">
      <div class="dl-icon http"><Icon name="folder_copy" size={21} /></div>
      <div style="flex: 1">
        <div class="ttl" id="add-mirror-title">New Mirror</div>
        <div class="sub">Recursively mirror an HTTP directory listing</div>
      </div>
      <button class="icon-btn" onclick={onClose} aria-label="Close"><Icon name="close" /></button>
    </div>

    <div class="modal-body">
      <div class="field">
        <label for="mirror-url">Directory URL</label>
        <input
          id="mirror-url"
          class="input mono"
          type="text"
          placeholder="https://example.com/files/"
          bind:value={url}
        />
      </div>

      <div class="field">
        <label for="mirror-dir">Destination directory <span class="label-hint">(optional)</span></label>
        <div class="input-group">
          <input
            id="mirror-dir"
            class="input mono"
            type="text"
            placeholder="Default download directory"
            bind:value={saveDir}
          />
          <button class="addon addon-btn" onclick={handleBrowse} title="Browse" type="button">
            <Icon name="folder_open" size={17} />
          </button>
        </div>
      </div>

      <div class="disclosure" class:open={advOpen}>
        <button class="disclosure-head" onclick={() => (advOpen = !advOpen)}>
          <Icon name="tune" size={18} /> Advanced
          <Icon name="expand_more" class="chev" size={20} />
        </button>
        {#if advOpen}
          <div class="disclosure-body">
            <div class="field">
              <label for="mirror-max-depth">Max depth</label>
              <input id="mirror-max-depth" class="input mono" type="number" min="1" bind:value={maxDepth} />
            </div>
            <div class="mirror-adv-toggle">
              <div class="set-info"><div class="t" style="font-size: 13px">Same host only</div></div>
              <Switch on={sameHostOnly} onToggle={() => (sameHostOnly = !sameHostOnly)} label="Same host only" />
            </div>
            <div class="field full">
              <label for="mirror-include">Include patterns <span class="label-hint">(comma-separated)</span></label>
              <input id="mirror-include" class="input mono" type="text" placeholder="*.iso, *.img" bind:value={includePatterns} />
            </div>
            <div class="field full">
              <label for="mirror-exclude">Exclude patterns <span class="label-hint">(comma-separated)</span></label>
              <input id="mirror-exclude" class="input mono" type="text" placeholder="*.tmp, *.log" bind:value={excludePatterns} />
            </div>
            <div class="mirror-adv-toggle">
              <div class="set-info"><div class="t" style="font-size: 13px">Preserve paths</div></div>
              <Switch on={preservePaths} onToggle={() => (preservePaths = !preservePaths)} label="Preserve paths" />
            </div>
            <div class="mirror-adv-toggle">
              <div class="set-info"><div class="t" style="font-size: 13px">Fail fast</div></div>
              <Switch on={failFast} onToggle={() => (failFast = !failFast)} label="Fail fast" />
            </div>
          </div>
        {/if}
      </div>

      {#if error}
        <div class="mirror-modal-error">
          <Icon name="error" size={15} />
          <span>{error}</span>
        </div>
      {/if}

      {#if manifest}
        <div class="mirror-preview">
          <div class="mirror-preview-header">
            <Icon name="travel_explore" size={17} />
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
              …and {manifest.entries.length - PREVIEW_LIMIT} more
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <div class="modal-foot">
      <button class="btn btn-ghost" onclick={onClose}>Cancel</button>
      <div class="sp"></div>
      <button
        class="btn btn-soft"
        onclick={handlePreview}
        disabled={isPreviewing || isStarting || !url.trim()}
      >
        <Icon name="travel_explore" size={16} />
        {isPreviewing ? 'Discovering…' : 'Preview'}
      </button>
      <button
        class="btn btn-primary"
        onclick={handleStart}
        disabled={isStarting || isPreviewing || !url.trim()}
      >
        <Icon name="folder_copy" size={16} />
        {isStarting ? 'Starting…' : 'Start Mirror'}
      </button>
    </div>
  </div>
</div>
