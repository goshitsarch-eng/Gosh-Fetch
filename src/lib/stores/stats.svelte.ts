import type { GlobalStats } from '../types/download';

class StatsStore {
  downloadSpeed = $state(0);
  uploadSpeed = $state(0);
  numActive = $state(0);
  numWaiting = $state(0);
  numStopped = $state(0);
  isConnected = $state(false);

  update(s: GlobalStats) {
    this.downloadSpeed = s.downloadSpeed;
    this.uploadSpeed = s.uploadSpeed;
    this.numActive = s.numActive;
    this.numWaiting = s.numWaiting;
    this.numStopped = s.numStopped;
    this.isConnected = true;
  }

  setDisconnected() {
    this.isConnected = false;
  }
}

export const stats = new StatsStore();
