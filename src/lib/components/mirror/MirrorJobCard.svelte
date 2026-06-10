<script lang="ts">
  import { mirror } from '../../stores/mirror.svelte';
  import { formatBytes, formatDate } from '../../utils/format';
  import type { MirrorJob } from '../../types/mirror';
  import Icon from '../ui/Icon.svelte';
  import StatusPill from '../ui/StatusPill.svelte';
  import type { PillVariant } from '../ui/StatusPill.svelte';

  let { item }: { item: MirrorJob } = $props();

  const progress = $derived(item.status.progress);
  const jobState = $derived(item.status.state);
  const isCancellable = $derived(
    jobState === 'running' || jobState === 'queued' || jobState === 'paused'
  );

  const pillVariant = $derived.by((): PillVariant => {
    switch (jobState) {
      case 'running':
        return 'active';
      case 'queued':
      case 'empty':
        return 'queued';
      case 'paused':
      case 'partial':
        return 'paused';
      case 'completed':
        return 'done';
      case 'failed':
        return 'error';
      default:
        return 'queued';
    }
  });

  const bytesPercent = $derived.by((): number | null => {
    if (progress.total_size != null && progress.total_size > 0) {
      return Math.min(100, (progress.completed_size / progress.total_size) * 100);
    }
    if (jobState === 'completed') return 100;
    // Total unknown while work is ongoing: indeterminate
    return null;
  });

  const fillVariant = $derived(
    jobState === 'failed' ? 'error' : jobState === 'completed' ? 'done' : jobState === 'running' ? 'active' : 'paused'
  );

  let showRemoveConfirm = $state(false);
  let deleteFiles = $state(false);
  let isRemoving = $state(false);

  async function handleCancel() {
    try {
      await mirror.cancelJob(item.job.id);
    } catch (e) {
      console.error('Failed to cancel mirror job:', e);
    }
  }

  async function handleRemove() {
    isRemoving = true;
    try {
      await mirror.removeJob(item.job.id, deleteFiles);
      showRemoveConfirm = false;
    } catch (e) {
      console.error('Failed to remove mirror job:', e);
    } finally {
      isRemoving = false;
    }
  }
</script>

<div class="mirror-card">
  <div class="dl-icon http"><Icon name="folder_copy" size={19} /></div>

  <div class="mirror-card-info">
    <div class="mirror-card-top">
      <span class="mirror-card-url" title={item.job.root_url}>{item.job.root_url}</span>
      <div class="mirror-card-actions">
        {#if isCancellable}
          <button class="act" onclick={handleCancel} title="Cancel"><Icon name="cancel" /></button>
        {/if}
        <button class="act danger" onclick={() => (showRemoveConfirm = true)} title="Remove">
          <Icon name="delete" />
        </button>
      </div>
    </div>

    <div class="mirror-card-meta">
      <StatusPill variant={pillVariant} label={jobState} />
      <span>{formatDate(item.job.created_at)}</span>
      {#if progress.failed_children > 0}
        <span class="mirror-failed">{progress.failed_children} failed</span>
      {/if}
    </div>

    <div class="mirror-card-progress">
      <div class="mirror-progress-labels">
        <span>{progress.completed_children} / {progress.total_children} files</span>
        <span>
          {formatBytes(progress.completed_size)}{progress.total_size != null
            ? ` of ${formatBytes(progress.total_size)}`
            : ''}
        </span>
      </div>
      <div class="pbar" style="height: 6px">
        {#if bytesPercent != null}
          <div class="pfill {fillVariant}" style="width: {bytesPercent}%"></div>
        {:else}
          <div class="pfill active mirror-indeterminate"></div>
        {/if}
      </div>
    </div>
  </div>

  {#if showRemoveConfirm}
    <div
      class="scrim"
      onclick={(e) => e.target === e.currentTarget && (showRemoveConfirm = false)}
      onkeydown={(e) => e.key === 'Escape' && (showRemoveConfirm = false)}
      role="presentation"
    >
      <div class="modal" style="max-width: 440px" role="dialog" aria-modal="true" aria-labelledby="remove-mirror-title">
        <div class="modal-head">
          <div class="dl-icon"><Icon name="delete" size={19} /></div>
          <div style="flex: 1">
            <div class="ttl" id="remove-mirror-title">Remove Mirror Job</div>
            <div class="sub">{item.job.root_url}</div>
          </div>
          <button class="icon-btn" onclick={() => (showRemoveConfirm = false)} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div class="modal-body">
          <p style="margin: 0; font-size: 13px">Are you sure you want to remove this mirror job?</p>
          <div class="set-row" style="padding: 4px 0; border: none">
            <div class="set-info"><div class="t" style="font-size: 13px">Also delete downloaded files</div></div>
            <button
              class="switch"
              class:on={deleteFiles}
              onclick={() => (deleteFiles = !deleteFiles)}
              aria-pressed={deleteFiles}
              aria-label="Also delete downloaded files"
            ><i></i></button>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" onclick={() => (showRemoveConfirm = false)}>Cancel</button>
          <div class="sp"></div>
          <button class="btn btn-danger" onclick={handleRemove} disabled={isRemoving}>
            {isRemoving ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
