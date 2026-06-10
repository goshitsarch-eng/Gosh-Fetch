<script lang="ts">
  import { dndzone } from 'svelte-dnd-action';
  import { flip } from 'svelte/animate';
  import type { Snippet } from 'svelte';
  import { downloads } from '../../stores/downloads.svelte';
  import type { Download } from '../../types/download';
  import './SortableList.css';

  interface DndItem {
    id: string;
    download: Download;
  }

  let {
    items,
    renderItem,
  }: {
    items: Download[];
    renderItem: Snippet<[Download]>;
  } = $props();

  const flipDurationMs = 200;

  // svelte-dnd-action mutates the list during drag, so keep a local copy that
  // only syncs from the prop while no drag is in progress.
  let dndItems = $state<DndItem[]>([]);
  let dragInProgress = $state(false);

  $effect(() => {
    const mapped = items.map((d) => ({ id: d.gid, download: d }));
    if (!dragInProgress) {
      dndItems = mapped;
    }
  });

  function handleConsider(e: CustomEvent<{ items: DndItem[] }>) {
    dragInProgress = true;
    dndItems = e.detail.items;
    downloads.setDragging(true);
  }

  function handleFinalize(e: CustomEvent<{ items: DndItem[] }>) {
    dndItems = e.detail.items;

    const prevOrder = downloads.gidOrder;
    const visibleOrder = dndItems.map((i) => i.id);

    // Reorder the visible gids within the full queue order, preserving the
    // positions of gids that are not in this list (paused/completed etc.).
    const visibleSet = new Set(visibleOrder);
    let vi = 0;
    const newOrder = prevOrder.map((gid) => (visibleSet.has(gid) ? visibleOrder[vi++] : gid));
    for (; vi < visibleOrder.length; vi++) newOrder.push(visibleOrder[vi]);

    downloads.setOrder(newOrder);
    void downloads.syncPriorities(newOrder, prevOrder);
    downloads.setDragging(false);
    dragInProgress = false;
  }
</script>

<div
  class="downloads-list"
  use:dndzone={{ items: dndItems, flipDurationMs, dropTargetStyle: {} }}
  onconsider={handleConsider}
  onfinalize={handleFinalize}
>
  {#each dndItems as item (item.id)}
    <div class="sortable-card-wrapper" animate:flip={{ duration: flipDurationMs }}>
      <div class="drag-handle">
        <span class="material-symbols-outlined" style="font-size: 16px">drag_indicator</span>
      </div>
      {@render renderItem(item.download)}
    </div>
  {/each}
</div>
