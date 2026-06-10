// Backend event bridge: wires Tauri events into the runes stores.
// Port of the event wiring that lived in App.tsx's main useEffect.
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { push } from 'svelte-spa-router';
import { api } from './commands';
import { performSystemAction } from './system';
import { downloads } from '../stores/downloads.svelte';
import { stats } from '../stores/stats.svelte';
import { notifications } from '../stores/notifications.svelte';
import { mirror } from '../stores/mirror.svelte';
import { ui } from '../stores/ui.svelte';
import type { GlobalStats } from '../types/download';
import type { MirrorJob } from '../types/mirror';

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let onCompletionTriggered = false;

const looksLikeGid = (value: string): boolean =>
  /^[0-9a-f]{16}$/i.test(value) ||
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

/** Find a download gid anywhere in an event payload (engine event shapes vary). */
export function extractGid(payload: any): string {
  if (!payload || typeof payload !== 'object') return '';

  const queue: any[] = [payload];
  const seen = new Set<any>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);

    if (typeof current.gid === 'string' && looksLikeGid(current.gid)) {
      return current.gid;
    }
    if (typeof current.id === 'string' && looksLikeGid(current.id)) {
      return current.id;
    }

    for (const value of Object.values(current)) {
      if (typeof value === 'string' && looksLikeGid(value)) {
        return value;
      }
      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return '';
}

/** Find a download name in an event payload. */
function extractName(payload: any): string | null {
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.name === 'string') return payload.name;
  for (const value of Object.values(payload)) {
    if (value && typeof value === 'object') {
      const name = extractName(value);
      if (name) return name;
    }
  }
  return null;
}

function scheduleDownloadsRefresh(delayMs: number = 100) {
  if (refreshTimer !== null) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void downloads.fetchDownloads();
  }, delayMs);
}

function resetOnCompletionTrigger() {
  onCompletionTriggered = false;
}

function persistDownloadSnapshot(payload: any, refreshHistory: boolean = false) {
  const gid = extractGid(payload);
  if (!gid) {
    if (refreshHistory) void downloads.loadCompletedHistory();
    return;
  }

  void (async () => {
    try {
      const download = await api.getDownloadStatus(gid);
      await api.dbSaveDownload(download);
    } catch {
      // Ignore persistence races (e.g. removed before snapshot)
    } finally {
      if (refreshHistory) {
        void downloads.loadCompletedHistory();
      }
    }
  })();
}

interface SchedulerPrefs {
  scheduleEnabled: boolean;
  forcePauseManual: boolean;
  onCompletion: 'nothing' | 'close' | 'sleep' | 'shutdown';
  forceCloseApps: boolean;
}

function loadSchedulerPrefs(): SchedulerPrefs {
  try {
    const raw = localStorage.getItem('gosh-fetch-scheduler-prefs');
    const parsed = raw ? JSON.parse(raw) : {};
    const onCompletion =
      parsed.onCompletion === 'close' ||
      parsed.onCompletion === 'sleep' ||
      parsed.onCompletion === 'shutdown'
        ? parsed.onCompletion
        : 'nothing';

    return {
      scheduleEnabled: parsed.scheduleEnabled !== false,
      forcePauseManual: Boolean(parsed.forcePauseManual),
      onCompletion,
      forceCloseApps: Boolean(parsed.forceCloseApps),
    };
  } catch {
    return {
      scheduleEnabled: true,
      forcePauseManual: false,
      onCompletion: 'nothing',
      forceCloseApps: false,
    };
  }
}

async function isCurrentTimePausedBySchedule(): Promise<boolean> {
  const rules = await api.getScheduleRules();
  if (!Array.isArray(rules) || rules.length === 0) return false;

  const now = new Date();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const currentDay = dayNames[now.getDay()];
  const currentHour = now.getHours();

  return rules.some((rule: any) => {
    if (!rule || typeof rule !== 'object') return false;

    const startHour = Number(rule.start_hour);
    const endHour = Number(rule.end_hour);
    if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) return false;

    const days = Array.isArray(rule.days) ? rule.days : [];
    const dayMatches = days.length === 0 || days.includes(currentDay);
    if (!dayMatches) return false;

    const hourMatches =
      startHour <= endHour
        ? currentHour >= startHour && currentHour <= endHour
        : currentHour >= startHour || currentHour <= endHour;

    return hourMatches && rule.download_limit === 0;
  });
}

function enforceManualPauseRule(payload: any) {
  const gid = extractGid(payload);
  if (!gid) return;

  void (async () => {
    const prefs = loadSchedulerPrefs();
    if (!prefs.scheduleEnabled || !prefs.forcePauseManual) return;

    try {
      const shouldPause = await isCurrentTimePausedBySchedule();
      if (shouldPause) {
        await downloads.pause(gid);
      }
    } catch {
      // Ignore schedule enforcement errors
    }
  })();
}

function maybeRunOnCompletionAction() {
  void (async () => {
    const prefs = loadSchedulerPrefs();
    if (!prefs.scheduleEnabled || prefs.onCompletion === 'nothing' || onCompletionTriggered) {
      return;
    }

    try {
      const active = await api.getActiveDownloads();
      if (Array.isArray(active) && active.length > 0) return;

      const performed = await performSystemAction(prefs.onCompletion, prefs.forceCloseApps);
      if (performed) {
        onCompletionTriggered = true;
      }
    } catch {
      // Ignore action errors so downloads continue to function normally
    }
  })();
}

function handleOpenMagnet(magnetUri: unknown) {
  if (typeof magnetUri === 'string' && magnetUri.startsWith('magnet:')) {
    push('/');
    void downloads
      .addMagnet(magnetUri)
      .then(() => scheduleDownloadsRefresh(0))
      .catch(() => {
        // Ignore malformed magnet links received from OS handlers
      });
  }
}

function handleOpenTorrentFile(filePath: unknown) {
  const torrentHandlingEnabled = localStorage.getItem('gosh-fetch-handle-torrent-files') !== '0';
  if (typeof filePath === 'string' && filePath.toLowerCase().endsWith('.torrent')) {
    if (!torrentHandlingEnabled) return;
    push('/');
    void downloads
      .addTorrentFile(filePath)
      .then(() => scheduleDownloadsRefresh(0))
      .catch(() => {
        // Ignore unreadable file paths from OS handlers
      });
  }
}

/**
 * Wire all backend events into the stores. Returns a cleanup function.
 * Call once from App.svelte when it mounts.
 */
export async function startEventBridge(): Promise<() => void> {
  const unlisteners: UnlistenFn[] = await Promise.all([
    listen<GlobalStats>('global-stats', (e) => stats.update(e.payload)),

    listen<string>('navigate', (e) => push(e.payload)),
    listen('open-add-modal', () => ui.openAddModal()),
    listen<{ uri: string }>('open-magnet', (e) => handleOpenMagnet(e.payload?.uri)),
    listen<{ path: string }>('open-torrent-file', (e) => handleOpenTorrentFile(e.payload?.path)),
    listen<{ connected: boolean; restarting: boolean }>('engine-status', (e) => {
      if (!e.payload.connected && !e.payload.restarting) {
        stats.setDisconnected();
      }
    }),

    // Push-based download list refresh on state changes
    listen('download:added', (e) => {
      scheduleDownloadsRefresh();
      resetOnCompletionTrigger();
      enforceManualPauseRule(e.payload);
      const name = extractName(e.payload);
      if (name) notifications.add('added', name);
    }),
    listen('download:completed', (e) => {
      scheduleDownloadsRefresh();
      persistDownloadSnapshot(e.payload, true);
      maybeRunOnCompletionAction();
      const name = extractName(e.payload);
      if (name) notifications.add('completed', name);
    }),
    listen('download:failed', (e) => {
      scheduleDownloadsRefresh();
      persistDownloadSnapshot(e.payload);
      const name = extractName(e.payload);
      if (name) notifications.add('failed', name);
    }),
    listen('download:removed', (e) => {
      scheduleDownloadsRefresh();
      const gid = extractGid(e.payload);
      if (gid) {
        void api.dbRemoveDownload(gid).catch(() => {
          // Ignore races (already removed from DB)
        });
      }
      void downloads.loadCompletedHistory();
    }),
    listen('download:paused', (e) => {
      scheduleDownloadsRefresh();
      persistDownloadSnapshot(e.payload);
    }),
    listen('download:resumed', (e) => {
      scheduleDownloadsRefresh();
      resetOnCompletionTrigger();
      enforceManualPauseRule(e.payload);
    }),
    listen('download:state-changed', (e) => {
      scheduleDownloadsRefresh();
      persistDownloadSnapshot(e.payload);
    }),

    // Recursive mirroring job lifecycle
    listen<MirrorJob>('recursive:added', (e) => mirror.applyUpsert(e.payload)),
    listen<MirrorJob>('recursive:updated', (e) => mirror.applyUpsert(e.payload)),
    listen<{ id: string }>('recursive:removed', (e) => mirror.applyRemoved(e.payload.id)),
  ]);

  // Tell the backend we're ready; it returns magnet/.torrent open requests
  // that arrived before the listeners above were wired (cold start).
  try {
    const pending = await api.getPendingOpenRequests();
    for (const request of pending) {
      if (request.kind === 'magnet') {
        handleOpenMagnet(request.uri);
      } else if (request.kind === 'torrentFile') {
        handleOpenTorrentFile(request.path);
      }
    }
  } catch {
    // Backend may not be initialized yet; requests stay queued
  }

  // System theme changes (replaces Electron's native-theme-changed event)
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystemThemeChange = async () => {
    const { theme } = await import('../stores/theme.svelte');
    theme.applySystemTheme();
  };
  media.addEventListener('change', onSystemThemeChange);

  return () => {
    unlisteners.forEach((u) => u());
    media.removeEventListener('change', onSystemThemeChange);
    if (refreshTimer !== null) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  };
}
