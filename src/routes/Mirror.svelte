<script lang="ts">
  import { mirror } from '../lib/stores/mirror.svelte';
  import Icon from '../lib/components/ui/Icon.svelte';
  import MirrorJobCard from '../lib/components/mirror/MirrorJobCard.svelte';
  import AddMirrorModal from '../lib/components/mirror/AddMirrorModal.svelte';
  import './Mirror.css';

  let showAddModal = $state(false);

  $effect(() => {
    void mirror.fetchJobs();
  });
</script>

<div class="content page-fade">
  <div class="content-inner" style="max-width: 980px">
    <div class="toolbar">
      <div>
        <span class="tag-label">Recursive HTTP directory mirroring</span>
      </div>
      <div class="toolbar-spacer"></div>
      <button class="btn btn-primary" onclick={() => (showAddModal = true)}>
        <Icon name="add" size={17} /> New Mirror
      </button>
    </div>

    {#if mirror.error}
      <div class="mirror-error-banner">
        <Icon name="error" size={15} />
        <span>{mirror.error}</span>
        <button class="btn btn-ghost" onclick={() => void mirror.fetchJobs()}>Retry</button>
      </div>
    {/if}

    {#if mirror.isLoading && mirror.all.length === 0}
      <div class="empty">
        <Icon name="progress_activity" class="spin" />
        <h3>Loading</h3>
        <p>Fetching mirror jobs…</p>
      </div>
    {:else if mirror.all.length === 0}
      <div class="empty">
        <Icon name="folder_copy" />
        <h3>No mirror jobs</h3>
        <p>Mirror an HTTP directory listing to your disk.</p>
        <button class="btn btn-primary" style="margin-top: 18px" onclick={() => (showAddModal = true)}>
          <Icon name="add" size={17} /> New Mirror
        </button>
      </div>
    {:else}
      <div class="mirror-job-list">
        {#each mirror.all as item (item.job.id)}
          <MirrorJobCard {item} />
        {/each}
      </div>
    {/if}
  </div>

  {#if showAddModal}
    <AddMirrorModal onClose={() => (showAddModal = false)} />
  {/if}
</div>
