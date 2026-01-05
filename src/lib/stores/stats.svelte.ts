import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

interface GlobalStats {
  downloadSpeed: number;
  uploadSpeed: number;
  numActive: number;
  numWaiting: number;
  numStopped: number;
}

let stats = $state<GlobalStats>({
  downloadSpeed: 0,
  uploadSpeed: 0,
  numActive: 0,
  numWaiting: 0,
  numStopped: 0,
});

let isConnected = $state(false);

export function getStats() {
  return stats;
}

export function getIsConnected() {
  return isConnected;
}

export async function refreshStats() {
  try {
    const result = await invoke<{
      download_speed: string;
      upload_speed: string;
      num_active: string;
      num_waiting: string;
      num_stopped: string;
    }>('get_global_stats');

    stats = {
      downloadSpeed: parseInt(result.download_speed) || 0,
      uploadSpeed: parseInt(result.upload_speed) || 0,
      numActive: parseInt(result.num_active) || 0,
      numWaiting: parseInt(result.num_waiting) || 0,
      numStopped: parseInt(result.num_stopped) || 0,
    };
    isConnected = true;
  } catch (e) {
    isConnected = false;
  }
}

export function startStatsPolling() {
  // Listen for stats events from backend
  listen<GlobalStats>('global-stats', (event) => {
    stats = event.payload;
    isConnected = true;
  });

  // Also poll periodically
  setInterval(refreshStats, 2000);
  refreshStats();
}
