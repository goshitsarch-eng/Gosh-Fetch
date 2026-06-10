// Download list store (replaces Redux downloadSlice + orderSlice, which were
// coupled through fetchDownloads.fulfilled).
import { SvelteMap } from 'svelte/reactivity';
import { api } from '../api/commands';
import type { Download, DownloadOptions } from '../types/download';

const ORDER_KEY = 'gosh-fetch-queue-order';

function loadOrder(): string[] {
  try {
    const stored = localStorage.getItem(ORDER_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveOrder(order: string[]) {
  localStorage.setItem(ORDER_KEY, JSON.stringify(order));
}

// Maps queue positions to priority buckets
function getBucket(index: number, total: number): string {
  const ratio = total === 1 ? 0 : index / (total - 1);
  if (ratio <= 0.1) return 'critical';
  if (ratio <= 0.35) return 'high';
  if (ratio <= 0.75) return 'normal';
  return 'low';
}

class DownloadStore {
  byGid = new SvelteMap<string, Download>();
  completedHistory = $state<Download[]>([]);
  isLoading = $state(false);
  error = $state<string | null>(null);
  gidOrder = $state<string[]>(loadOrder());
  isDragging = $state(false);

  all = $derived([...this.byGid.values()]);
  active = $derived(this.all.filter((d) => d.status === 'active' || d.status === 'waiting'));
  paused = $derived(this.all.filter((d) => d.status === 'paused'));
  errored = $derived(this.all.filter((d) => d.status === 'error'));
  completed = $derived.by(() => {
    const engineCompleted = this.all.filter((d) => d.status === 'complete');
    const engineGids = new Set(engineCompleted.map((d) => d.gid));
    const historyOnly = this.completedHistory.filter((d) => !engineGids.has(d.gid));
    return [...engineCompleted, ...historyOnly];
  });

  async fetchDownloads(): Promise<void> {
    this.isLoading = true;
    this.error = null;
    try {
      const downloads = await api.getAllDownloads();
      this.byGid.clear();
      for (const d of downloads) this.byGid.set(d.gid, d);
      this.reconcileOrder(downloads);
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to fetch downloads';
    } finally {
      this.isLoading = false;
    }
  }

  /** Drop order entries for removed downloads, append newcomers. */
  private reconcileOrder(downloads: Download[]) {
    if (this.isDragging) return;
    const currentGids = new Set(downloads.map((d) => d.gid));
    const filtered = this.gidOrder.filter((gid) => currentGids.has(gid));
    const ordered = new Set(filtered);
    for (const d of downloads) {
      if (!ordered.has(d.gid)) filtered.push(d.gid);
    }
    this.gidOrder = filtered;
    saveOrder(filtered);
  }

  async loadCompletedHistory(): Promise<void> {
    this.completedHistory = await api.dbGetCompletedHistory();
  }

  async addDownload(url: string, options?: DownloadOptions): Promise<string> {
    return api.addDownload(url, options);
  }

  async addUrls(urls: string[], options?: DownloadOptions): Promise<string[]> {
    return api.addUrls(urls, options);
  }

  async addMagnet(magnetUri: string, options?: DownloadOptions): Promise<string> {
    return api.addMagnet(magnetUri, options);
  }

  async addTorrentFile(filePath: string, options?: DownloadOptions): Promise<string> {
    return api.addTorrentFile(filePath, options);
  }

  async pause(gid: string): Promise<void> {
    await api.pauseDownload(gid);
  }

  async resume(gid: string): Promise<void> {
    await api.resumeDownload(gid);
  }

  async pauseAll(): Promise<void> {
    await api.pauseAll();
  }

  async resumeAll(): Promise<void> {
    await api.resumeAll();
  }

  async remove(gid: string, deleteFiles?: boolean): Promise<void> {
    let effectiveDeleteFiles = deleteFiles;
    if (effectiveDeleteFiles === undefined) {
      try {
        const settings = await api.dbGetSettings();
        effectiveDeleteFiles = settings.delete_files_on_remove;
      } catch {
        effectiveDeleteFiles = false;
      }
    }

    await api.removeDownload(gid, effectiveDeleteFiles);
    try {
      await api.dbRemoveDownload(gid);
    } catch {
      // Ignore
    }
    this.byGid.delete(gid);
    this.completedHistory = this.completedHistory.filter((d) => d.gid !== gid);
  }

  async clearHistory(): Promise<void> {
    await api.dbClearHistory();
    this.completedHistory = [];
  }

  setOrder(order: string[]) {
    this.gidOrder = order;
    saveOrder(order);
  }

  setDragging(value: boolean) {
    this.isDragging = value;
  }

  /** Sync queue order to priority buckets; only updates items whose bucket changed. */
  async syncPriorities(gidOrder: string[], previousOrder: string[]): Promise<void> {
    const nextTotal = gidOrder.length;
    if (nextTotal === 0) return;

    const previousBuckets = new Map<string, string>();
    const previousTotal = previousOrder.length;
    for (let i = 0; i < previousTotal; i++) {
      previousBuckets.set(previousOrder[i], getBucket(i, previousTotal));
    }

    for (let i = 0; i < nextTotal; i++) {
      const gid = gidOrder[i];
      const bucket = getBucket(i, nextTotal);
      if (previousBuckets.get(gid) === bucket) continue;
      try {
        await api.setPriority(gid, bucket);
      } catch {
        // Download may have been removed between reorder and sync
      }
    }
  }

  /** Re-add downloads recorded as incomplete in the app DB (startup restore). */
  async restoreIncomplete(): Promise<void> {
    const incompleteDownloads = await api.dbLoadIncomplete();
    for (const download of incompleteDownloads) {
      try {
        if (download.downloadType === 'magnet' && download.magnetUri) {
          await api.addMagnet(download.magnetUri);
        } else if (download.downloadType === 'magnet' && download.infoHash) {
          await api.addMagnet(`magnet:?xt=urn:btih:${download.infoHash}`);
        } else if (download.downloadType === 'torrent' && download.magnetUri) {
          await api.addMagnet(download.magnetUri);
        } else if (download.downloadType === 'torrent' && download.infoHash) {
          await api.addMagnet(`magnet:?xt=urn:btih:${download.infoHash}`);
        } else if (download.url) {
          await api.addDownload(download.url);
        }
        await api.dbRemoveDownload(download.gid);
      } catch (e) {
        console.error(`Failed to restore download ${download.name}:`, e);
      }
    }
  }
}

export const downloads = new DownloadStore();
