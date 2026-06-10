<script lang="ts">
  import { mirror } from '../lib/stores/mirror.svelte';
  import MirrorJobCard from '../lib/components/mirror/MirrorJobCard.svelte';
  import AddMirrorModal from '../lib/components/mirror/AddMirrorModal.svelte';
  import './Mirror.css';

  let showAddModal = $state(false);

  $effect(() => {
    void mirror.fetchJobs();
  });
</script>

<div class="page">
  <header class="mirror-header">
    <div>
      <h2>Mirror</h2>
      <p>Recursively mirror HTTP directory listings to your disk.</p>
    </div>
    <button class="btn btn-primary" onclick={() => (showAddModal = true)}>
      <span class="material-symbols-outlined" style="font-size: 20px">add</span>
      New Mirror
    </button>
  </header>

  <div class="mirror-content">
    {#if mirror.error}
      <div class="mirror-error-banner">
        <span class="material-symbols-outlined" style="font-size: 14px">error</span>
        <span>{mirror.error}</span>
        <button class="btn btn-ghost btn-sm" onclick={() => void mirror.fetchJobs()}>Retry</button>
      </div>
    {/if}

    {#if mirror.isLoading && mirror.all.length === 0}
      <div class="mirror-empty">
        <span class="material-symbols-outlined spin" style="font-size: 32px">progress_activity</span>
        <p>Loading mirror jobs...</p>
      </div>
    {:else if mirror.all.length === 0}
      <div class="mirror-empty">
        <div class="mirror-empty-icon">
          <span class="material-symbols-outlined">folder_copy</span>
        </div>
        <h3>No mirror jobs</h3>
        <p>Mirror an HTTP directory listing to your disk.</p>
        <button class="btn btn-primary" onclick={() => (showAddModal = true)} style="margin-top: var(--space-md)">
          <span class="material-symbols-outlined" style="font-size: 14px">add</span>
          New Mirror
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
</div>

{#if showAddModal}
  <AddMirrorModal onClose={() => (showAddModal = false)} />
{/if}
