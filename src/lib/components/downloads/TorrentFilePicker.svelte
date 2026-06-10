<script lang="ts">
  import { untrack } from 'svelte';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import type { TorrentInfo } from '../../types/download';
  import { formatBytes } from '../../utils/format';
  import { api } from '../../api/commands';
  import {
    buildTree,
    getFileIcon,
    getAllFileIndicesInFolder,
    getFolderCheckState,
    folderHasMatch,
    type TreeNode,
    type TreeFolder,
  } from '../../utils/torrentTree';
  import './TorrentFilePicker.css';

  let {
    torrentInfo,
    savePath,
    onConfirm,
    onCancel,
  }: {
    torrentInfo: TorrentInfo;
    savePath: string;
    onConfirm: (selectedIndices: number[]) => void;
    onCancel: () => void;
  } = $props();

  let allIndices = $derived(torrentInfo.files.map((f) => f.index));
  // Initial selection is seeded once per mount (the picker is recreated per torrent)
  const selected = new SvelteSet<number>(untrack(() => torrentInfo.files.map((f) => f.index)));
  const priorities = new SvelteMap<number, string>();
  const expandedFolders = new SvelteSet<string>();
  let searchFilter = $state('');
  let diskSpace = $state<{ total: number; free: number } | null>(null);
  let showBulkDropdown = $state(false);
  let modalEl = $state<HTMLDivElement | null>(null);
  let bulkEl = $state<HTMLDivElement | null>(null);

  let tree = $derived(buildTree(torrentInfo.files));

  // Load disk space
  $effect(() => {
    if (savePath) {
      api.getDiskSpace(savePath)
        .then((space) => { diskSpace = space; })
        .catch(() => {});
    }
  });

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

  // Close bulk dropdown on outside click
  $effect(() => {
    if (!showBulkDropdown) return;
    function handleClick(e: MouseEvent) {
      if (bulkEl && !bulkEl.contains(e.target as Node)) {
        showBulkDropdown = false;
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  });

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') onCancel();
  }

  let selectedSize = $derived(
    torrentInfo.files
      .filter((f) => selected.has(f.index))
      .reduce((sum, f) => sum + f.length, 0)
  );

  function getPriority(index: number): string {
    return priorities.get(index) || 'Normal';
  }

  function toggleFile(index: number) {
    if (selected.has(index)) {
      selected.delete(index);
      priorities.set(index, 'Skip');
    } else {
      selected.add(index);
      if (priorities.get(index) === 'Skip') priorities.delete(index);
    }
  }

  function toggleFolder(folder: TreeFolder) {
    const indices = getAllFileIndicesInFolder(folder);
    const allSelected = indices.every((i) => selected.has(i));
    if (allSelected) {
      indices.forEach((i) => {
        selected.delete(i);
        priorities.set(i, 'Skip');
      });
    } else {
      indices.forEach((i) => {
        selected.add(i);
        if (priorities.get(i) === 'Skip') priorities.delete(i);
      });
    }
  }

  function selectAll() {
    allIndices.forEach((i) => {
      selected.add(i);
      if (priorities.get(i) === 'Skip') priorities.delete(i);
    });
  }

  function selectNone() {
    selected.clear();
    allIndices.forEach((i) => priorities.set(i, 'Skip'));
  }

  function setFilePriority(index: number, priority: string) {
    if (priority === 'Skip') {
      selected.delete(index);
    } else if (!selected.has(index)) {
      selected.add(index);
    }
    priorities.set(index, priority);
  }

  function setBulkPriority(priority: string) {
    showBulkDropdown = false;
    const selectedArr = Array.from(selected);
    if (priority === 'Skip') {
      selected.clear();
      selectedArr.forEach((i) => priorities.set(i, 'Skip'));
    } else {
      selectedArr.forEach((i) => priorities.set(i, priority));
    }
  }

  function toggleExpand(folderPath: string) {
    if (expandedFolders.has(folderPath)) expandedFolders.delete(folderPath);
    else expandedFolders.add(folderPath);
  }

  function handleConfirm() {
    onConfirm(Array.from(selected));
  }

  // Check "select all" checkbox state
  let allChecked = $derived(allIndices.length > 0 && allIndices.every((i) => selected.has(i)));
  let someChecked = $derived(!allChecked && allIndices.some((i) => selected.has(i)));

  // Filter matching logic
  let filterLower = $derived(searchFilter.toLowerCase());

  function matchesFilter(name: string): boolean {
    if (!filterLower) return true;
    return name.toLowerCase().includes(filterLower);
  }

  function indentStyle(depth: number): string | undefined {
    return depth > 3 ? `padding-left: ${36 + (depth - 1) * 20}px` : undefined;
  }
</script>

{#snippet treeNodeView(node: TreeNode, depth: number)}
  {#if node.type === 'file'}
    {#if matchesFilter(node.name)}
      {@const isSelected = selected.has(node.index)}
      {@const priority = getPriority(node.index)}
      {@const isSkipped = !isSelected || priority === 'Skip'}
      {@const fileIcon = getFileIcon(node.name)}
      <div class={`file-row${isSkipped ? ' skipped' : ''}${depth > 0 ? ' nested-bg' : ''}`}>
        <div class={`file-row-name${depth > 0 ? ` indent-${Math.min(depth, 3)}` : ''}`} style={indentStyle(depth)}>
          <div class="file-row-expand-spacer"></div>
          <input
            type="checkbox"
            checked={isSelected}
            onchange={() => toggleFile(node.index)}
          />
          <span class={`file-row-icon ${fileIcon.colorClass}`}>
            <span class="ms">{fileIcon.icon}</span>
          </span>
          <span class="file-row-label" title={node.name}>{node.name}</span>
        </div>
        <div class="file-row-size">{formatBytes(node.length)}</div>
        <div class="file-row-priority">
          <div class="priority-select-wrapper">
            <select
              class={`priority-select${priority === 'High' ? ' priority-high' : ''}${priority === 'Skip' ? ' priority-skip' : ''}`}
              value={priority}
              onchange={(e) => setFilePriority(node.index, e.currentTarget.value)}
            >
              <option value="High">High</option>
              <option value="Normal">Normal</option>
              <option value="Low">Low</option>
              <option value="Skip">Skip</option>
            </select>
            <div class="select-chevron">
              <span class="ms">expand_more</span>
            </div>
          </div>
        </div>
      </div>
    {/if}
  {:else if folderHasMatch(node, filterLower)}
    {@const isExpanded = expandedFolders.has(node.path)}
    {@const checkState = getFolderCheckState(node, selected)}
    <div class={`file-row folder-row${depth > 0 ? ' nested-bg' : ''}`}>
      <div class={`file-row-name${depth > 0 ? ` indent-${Math.min(depth, 3)}` : ''}`} style={indentStyle(depth)}>
        <button class="file-row-expand" onclick={() => toggleExpand(node.path)}>
          <span class="ms">
            {isExpanded ? 'expand_more' : 'chevron_right'}
          </span>
        </button>
        <input
          type="checkbox"
          checked={checkState === 'all'}
          indeterminate={checkState === 'some'}
          onchange={() => toggleFolder(node)}
        />
        <span class="file-row-icon icon-yellow">
          <span class="ms">
            {isExpanded ? 'folder_open' : 'folder'}
          </span>
        </span>
        <span class="file-row-label" title={node.name}>{node.name}</span>
      </div>
      <div class="file-row-size">{formatBytes(node.totalSize)}</div>
      <div class="file-row-priority">
        <div class="priority-select-wrapper">
          <select
            class="priority-select"
            value="Normal"
            onchange={(e) => {
              const indices = getAllFileIndicesInFolder(node);
              const value = e.currentTarget.value;
              indices.forEach((i) => setFilePriority(i, value));
              e.currentTarget.value = 'Normal';
            }}
          >
            <option value="High">High</option>
            <option value="Normal">Normal</option>
            <option value="Low">Low</option>
            <option value="Skip">Skip</option>
          </select>
          <div class="select-chevron">
            <span class="ms">expand_more</span>
          </div>
        </div>
      </div>
    </div>
    {#if isExpanded}
      {#each node.children as child (child.type === 'file' ? `file-${child.index}` : `folder-${child.path}`)}
        {@render treeNodeView(child, depth + 1)}
      {/each}
    {/if}
  {/if}
{/snippet}

<div class="scrim" onclick={onCancel} onkeydown={handleKeyDown} role="dialog" aria-modal="true" aria-labelledby="file-picker-title">
  <div class="modal file-picker-modal" onclick={(e) => e.stopPropagation()} bind:this={modalEl}>
    <!-- Header -->
    <div class="file-picker-header">
      <div class="file-picker-header-left">
        <div class="file-picker-icon">
          <span class="ms">folder_zip</span>
        </div>
        <div class="file-picker-title-group">
          <div class="file-picker-title" id="file-picker-title" title={torrentInfo.name}>
            {torrentInfo.name}
          </div>
          <div class="file-picker-subtitle">
            <span class="ms">database</span>
            <span>{formatBytes(torrentInfo.totalSize)} Total</span>
            <span>•</span>
            <span class="file-picker-selected-size">{formatBytes(selectedSize)} Selected</span>
          </div>
        </div>
      </div>
      <div class="file-picker-header-actions">
        <button onclick={onCancel} aria-label="Close">
          <span class="ms">close</span>
        </button>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="file-picker-toolbar">
      <div class="file-picker-search">
        <span class="ms">search</span>
        <input
          type="text"
          placeholder="Filter files by name..."
          bind:value={searchFilter}
        />
      </div>
      <div class="file-picker-toolbar-actions">
        <div class="file-picker-select-btns">
          <button onclick={selectAll}>Select All</button>
          <div class="separator"></div>
          <button onclick={selectNone}>Select None</button>
        </div>
        <div class="file-picker-bulk-priority" bind:this={bulkEl}>
          <button
            class="file-picker-bulk-priority-btn"
            onclick={() => (showBulkDropdown = !showBulkDropdown)}
          >
            <span class="ms">tune</span>
            Set Priority
            <span class="ms">arrow_drop_down</span>
          </button>
          {#if showBulkDropdown}
            <div class="file-picker-bulk-dropdown">
              <button onclick={() => setBulkPriority('High')}>High</button>
              <button onclick={() => setBulkPriority('Normal')}>Normal</button>
              <button onclick={() => setBulkPriority('Low')}>Low</button>
              <button class="priority-skip" onclick={() => setBulkPriority('Skip')}>Do Not Download</button>
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Table Header -->
    <div class="file-picker-table-header">
      <div class="col-name">
        <input
          type="checkbox"
          checked={allChecked}
          indeterminate={someChecked}
          onchange={() => (allChecked ? selectNone() : selectAll())}
        />
        <span>Name</span>
      </div>
      <div class="col-size">Size</div>
      <div class="col-priority">Priority</div>
    </div>

    <!-- File Tree -->
    <div class="file-picker-tree">
      {#each tree as node (node.type === 'file' ? `file-${node.index}` : `folder-${node.path}`)}
        {@render treeNodeView(node, 0)}
      {/each}
    </div>

    <!-- Footer -->
    <div class="file-picker-footer">
      <div class="file-picker-footer-info">
        {#if diskSpace}
          <span>Free space: {formatBytes(diskSpace.free)}</span>
          <span class="separator">•</span>
        {/if}
        {#if savePath}<span>Location: {savePath}</span>{/if}
      </div>
      <div class="file-picker-footer-actions">
        <button class="cancel-btn" onclick={onCancel} type="button">
          Cancel
        </button>
        <button
          class="download-btn"
          onclick={handleConfirm}
          disabled={selected.size === 0}
          type="button"
        >
          <span class="ms">download</span>
          Download Selected
        </button>
      </div>
    </div>
  </div>
</div>
