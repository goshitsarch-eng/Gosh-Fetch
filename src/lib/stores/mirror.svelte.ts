// Recursive directory mirroring jobs (gosh-dl 0.5.0+).
import { SvelteMap } from 'svelte/reactivity';
import { api } from '../api/commands';
import type { DownloadOptions } from '../types/download';
import type { MirrorJob, MirrorManifest, MirrorOptions } from '../types/mirror';

class MirrorStore {
  jobs = new SvelteMap<string, MirrorJob>();
  isLoading = $state(false);
  error = $state<string | null>(null);

  all = $derived(
    [...this.jobs.values()].sort((a, b) => b.job.created_at.localeCompare(a.job.created_at))
  );

  async fetchJobs(): Promise<void> {
    this.isLoading = true;
    this.error = null;
    try {
      const jobs = await api.listRecursiveJobs();
      this.jobs.clear();
      for (const j of jobs) this.jobs.set(j.job.id, j);
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.isLoading = false;
    }
  }

  async discover(
    url: string,
    options?: DownloadOptions,
    recursive?: MirrorOptions
  ): Promise<MirrorManifest> {
    return api.discoverRecursive(url, options, recursive);
  }

  async addJob(
    url: string,
    options?: DownloadOptions,
    recursive?: MirrorOptions
  ): Promise<MirrorJob> {
    const job = await api.addRecursive(url, options, recursive);
    this.jobs.set(job.job.id, job);
    return job;
  }

  async cancelJob(id: string, deleteFiles: boolean = false): Promise<void> {
    await api.cancelRecursiveJob(id, deleteFiles);
  }

  async removeJob(id: string, deleteFiles: boolean = false): Promise<void> {
    await api.removeRecursiveJob(id, deleteFiles);
    this.jobs.delete(id);
  }

  /** Upsert from recursive:added / recursive:updated events. */
  applyUpsert(payload: MirrorJob) {
    if (payload?.job?.id) {
      this.jobs.set(payload.job.id, payload);
    }
  }

  /** Remove from recursive:removed events. */
  applyRemoved(id: string) {
    this.jobs.delete(id);
  }
}

export const mirror = new MirrorStore();
