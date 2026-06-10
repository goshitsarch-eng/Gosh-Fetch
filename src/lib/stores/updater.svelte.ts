// In-app updater driven by tauri-plugin-updater (pull model: we check on
// startup; download progress comes from the downloadAndInstall callback).
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export type UpdaterPhase = 'idle' | 'available' | 'downloading' | 'downloaded';

class UpdaterStore {
  phase = $state<UpdaterPhase>('idle');
  version = $state<string | null>(null);
  releaseNotes = $state('');
  releaseDate = $state<string | null>(null);
  total = $state(0);
  transferred = $state(0);
  percent = $state(0);
  dismissed = $state(false);

  private update: Update | null = null;

  /** Check GitHub Releases for an update. Quietly no-ops on failure. */
  async checkForUpdates(): Promise<void> {
    try {
      const update = await check();
      if (update) {
        this.update = update;
        this.phase = 'available';
        this.version = update.version;
        this.releaseNotes = update.body ?? '';
        this.releaseDate = update.date ?? null;
        this.dismissed = false;
      }
    } catch (e) {
      console.warn('Update check failed:', e);
    }
  }

  async download(): Promise<void> {
    if (!this.update) return;
    this.phase = 'downloading';
    this.transferred = 0;
    this.percent = 0;
    try {
      await this.update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          this.total = event.data.contentLength ?? 0;
        } else if (event.event === 'Progress') {
          this.transferred += event.data.chunkLength;
          this.percent = this.total > 0 ? Math.min(100, (this.transferred / this.total) * 100) : 0;
        } else if (event.event === 'Finished') {
          this.percent = 100;
        }
      });
      this.phase = 'downloaded';
    } catch (e) {
      console.error('Update download failed:', e);
      this.phase = 'available';
    }
  }

  async installAndRestart(): Promise<void> {
    // downloadAndInstall already installed; restarting activates the update
    await relaunch();
  }

  dismiss() {
    this.dismissed = true;
  }
}

export const updater = new UpdaterStore();
