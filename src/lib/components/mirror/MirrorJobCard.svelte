<script lang="ts">
  import { mirror } from '../../stores/mirror.svelte';
  import { formatBytes, formatDate } from '../../utils/format';
  import type { MirrorJob } from '../../types/mirror';

  let { item }: { item: MirrorJob } = $props();

  const progress = $derived(item.status.progress);
  const jobState = $derived(item.status.state);
  const isCancellable = $derived(
    jobState === 'running' || jobState === 'queued' || jobState === 'paused'
  );

  const bytesPercent = $derived.by((): number | null => {
    if (progress.total_size != null && progress.total_size > 0) {
      return Math.min(100, (progress.completed_size / progress.total_size) * 100);
    }
    if (jobState === 'completed') return 100;
    // Total unknown while work is ongoing: indeterminate
    return null;
  });

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
  <div class="mirror-card-body">
    <div class="mirror-card-icon">
      <span class="material-symbols-outlined">folder_copy</span>
    </div>
    <div class="mirror-card-info">
      <div class="mirror-card-row-top">
        <h4 class="mirror-card-url" title={item.job.root_url}>{item.job.root_url}</h4>
        <div class="mirror-card-actions">
          {#if isCancellable}
            <button class="mirror-card-action-btn" onclick={handleCancel} title="Cancel">
              <span class="material-symbols-outlined">cancel</span>
            </button>
          {/if}
          <button
            class="mirror-card-action-btn danger"
            onclick={() => (showRemoveConfirm = true)}
            title="Remove"
          >
            <span class="material-symbols-outlined">delete</span>
          </button>
        </div>
      </div>

      <div class="mirror-card-meta">
        <span class="mirror-state-badge {jobState}">{jobState}</span>
        <span class="meta-dot">&bull;</span>
        <span>{formatDate(item.job.created_at)}</span>
        {#if progress.failed_children > 0}
          <span class="meta-dot">&bull;</span>
          <span class="mirror-failed-count">{progress.failed_children} failed</span>
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
        <div class="mirror-progress-track">
          {#if bytesPercent != null}
            <div class="mirror-progress-fill" style="width: {bytesPercent}%"></div>
          {:else}
            <div class="mirror-progress-fill indeterminate"></div>
          {/if}
        </div>
      </div>
    </div>
  </div>

  {#if showRemoveConfirm}
    <div
      class="modal-backdrop"
      onclick={() => (showRemoveConfirm = false)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="remove-mirror-title"
    >
      <div class="modal" onclick={(e) => e.stopPropagation()} style="max-width: 440px" role="document">
        <div class="modal-header">
          <h3 class="modal-title" id="remove-mirror-title">Remove Mirror Job</h3>
        </div>
        <div class="modal-body">
          <p>Are you sure you want to remove this mirror job?</p>
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={deleteFiles} />
            <span>Also delete downloaded files</span>
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick={() => (showRemoveConfirm = false)}>Cancel</button>
          <button class="btn btn-destructive" onclick={handleRemove} disabled={isRemoving}>
            {isRemoving ? 'Removing...' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
