// Cross-component UI signals (replaces the window CustomEvent channel:
// gosh-fetch:open-add-modal / focus-search / select-all).
class UiStore {
  addModalOpen = $state(false);
  /** Incrementing counters: components $effect on these to react to signals. */
  focusSearchTick = $state(0);
  selectAllTick = $state(0);

  openAddModal() {
    this.addModalOpen = true;
  }

  closeAddModal() {
    this.addModalOpen = false;
  }

  requestFocusSearch() {
    this.focusSearchTick++;
  }

  requestSelectAll() {
    this.selectAllTick++;
  }
}

export const ui = new UiStore();
