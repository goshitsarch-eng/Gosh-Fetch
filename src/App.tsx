import React, { useEffect, useCallback, useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import Onboarding from './components/Onboarding';
import Sidebar from './components/layout/Sidebar';
import StatusBar from './components/layout/StatusBar';
import Downloads from './pages/Downloads';
import History from './pages/History';
import Settings from './pages/Settings';
import Scheduler from './pages/Scheduler';
import Statistics from './pages/Statistics';
import { updateStats, setDisconnected, selectIsConnected } from './store/statsSlice';
import { setTheme, applySystemTheme } from './store/themeSlice';
import {
  addDownload,
  addMagnet,
  addTorrentFile,
  fetchDownloads,
  loadCompletedHistory,
  pauseDownload,
  restoreIncomplete,
} from './store/downloadSlice';
import { addNotification } from './store/notificationSlice';
import { setUpdateAvailable, setDownloadProgress, setUpdateDownloaded } from './store/updaterSlice';
import UpdateToast from './components/updater/UpdateToast';
import UpdateModal from './components/updater/UpdateModal';
import { api } from './lib/api';
import type { AppDispatch } from './store/store';
import './App.css';

export default function App() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const isConnected = useSelector(selectIsConnected);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem('gosh-fetch-onboarding-done')
  );

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === 'n') {
      e.preventDefault();
      navigate('/');
      window.dispatchEvent(new CustomEvent('gosh-fetch:open-add-modal'));
    } else if (mod && e.key === 'k') {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('gosh-fetch:focus-search'));
    } else if (mod && e.key === ',') {
      e.preventDefault();
      navigate('/settings');
    } else if (mod && e.key === 'a' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('gosh-fetch:select-all'));
    }
  }, [navigate]);

  // Drag and drop files/URLs onto window
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);

    // Handle dropped files (.torrent)
    if (e.dataTransfer.files.length > 0) {
      for (const file of Array.from(e.dataTransfer.files)) {
        if (file.name.endsWith('.torrent') && (file as any).path) {
          try {
            await dispatch(addTorrentFile({ filePath: (file as any).path }));
          } catch { /* ignore */ }
        }
      }
      dispatch(fetchDownloads());
      return;
    }

    // Handle dropped text (URLs, magnet links)
    const text = e.dataTransfer.getData('text/plain')?.trim();
    if (text) {
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      for (const line of lines) {
        try {
          if (line.startsWith('magnet:')) {
            await dispatch(addMagnet({ magnetUri: line }));
          } else if (line.startsWith('http://') || line.startsWith('https://')) {
            await dispatch(addDownload({ url: line }));
          }
        } catch { /* ignore */ }
      }
      dispatch(fetchDownloads());
    }
  }

  useEffect(() => {
    // Initialize theme
    const saved = localStorage.getItem('gosh-fetch-theme') as 'dark' | 'light' | 'system' | null;
    dispatch(setTheme(saved ?? 'dark'));

    // Restore incomplete downloads once on app startup
    dispatch(restoreIncomplete());
    dispatch(fetchDownloads());
    dispatch(loadCompletedHistory());

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let onCompletionTriggered = false;

    const looksLikeGid = (value: string): boolean =>
      /^[0-9a-f]{16}$/i.test(value) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

    const extractGid = (payload: any): string => {
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
    };

    const scheduleDownloadsRefresh = (delayMs: number = 100) => {
      if (refreshTimer !== null) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        dispatch(fetchDownloads());
      }, delayMs);
    };

    const resetOnCompletionTrigger = () => {
      onCompletionTriggered = false;
    };

    const persistDownloadSnapshot = (payload: any, refreshHistory: boolean = false) => {
      const gid = extractGid(payload);
      if (!gid) {
        if (refreshHistory) dispatch(loadCompletedHistory());
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
            dispatch(loadCompletedHistory());
          }
        }
      })();
    };

    const loadSchedulerPrefs = (): {
      scheduleEnabled: boolean;
      forcePauseManual: boolean;
      onCompletion: 'nothing' | 'close' | 'sleep' | 'shutdown';
      forceCloseApps: boolean;
    } => {
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
    };

    const isCurrentTimePausedBySchedule = async (): Promise<boolean> => {
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
    };

    const enforceManualPauseRule = (payload: any) => {
      const gid = extractGid(payload);
      if (!gid) return;

      void (async () => {
        const prefs = loadSchedulerPrefs();
        if (!prefs.scheduleEnabled || !prefs.forcePauseManual) return;

        try {
          const shouldPause = await isCurrentTimePausedBySchedule();
          if (shouldPause) {
            await dispatch(pauseDownload(gid));
          }
        } catch {
          // Ignore schedule enforcement errors
        }
      })();
    };

    const maybeRunOnCompletionAction = () => {
      void (async () => {
        const prefs = loadSchedulerPrefs();
        if (!prefs.scheduleEnabled || prefs.onCompletion === 'nothing' || onCompletionTriggered) {
          return;
        }

        try {
          const active = await api.getActiveDownloads();
          if (Array.isArray(active) && active.length > 0) return;

          const performed = await window.electronAPI.performSystemAction(
            prefs.onCompletion,
            prefs.forceCloseApps
          );
          if (performed) {
            onCompletionTriggered = true;
          }
        } catch {
          // Ignore action errors so downloads continue to function normally
        }
      })();
    };

    // Listen for events from sidecar via Electron
    const cleanupEvent = window.electronAPI.onEvent((event: string, data: any) => {
      if (event === 'global-stats') {
        dispatch(updateStats(data));
      }
      if (event === 'navigate') {
        navigate(data);
      }
      if (event === 'open-add-modal') {
        window.dispatchEvent(new CustomEvent('gosh-fetch:open-add-modal'));
      }
      if (event === 'open-magnet') {
        const magnetUri = data?.uri;
        if (typeof magnetUri === 'string' && magnetUri.startsWith('magnet:')) {
          navigate('/');
          void dispatch(addMagnet({ magnetUri }))
            .unwrap()
            .then(() => scheduleDownloadsRefresh(0))
            .catch(() => {
              // Ignore malformed magnet links received from OS handlers
            });
        }
      }
      if (event === 'open-torrent-file') {
        const filePath = data?.path;
        const torrentHandlingEnabled = localStorage.getItem('gosh-fetch-handle-torrent-files') !== '0';
        if (typeof filePath === 'string' && filePath.toLowerCase().endsWith('.torrent')) {
          if (!torrentHandlingEnabled) return;
          navigate('/');
          void dispatch(addTorrentFile({ filePath }))
            .unwrap()
            .then(() => scheduleDownloadsRefresh(0))
            .catch(() => {
              // Ignore unreadable file paths from OS handlers
            });
        }
      }
      if (event === 'native-theme-changed') {
        dispatch(applySystemTheme());
      }
      if (event === 'engine-status') {
        if (!data.connected && !data.restarting) {
          dispatch(setDisconnected());
        }
      }
      // Push-based download list refresh on state changes
      if (event === 'download:added') {
        scheduleDownloadsRefresh();
        resetOnCompletionTrigger();
        enforceManualPauseRule(data);
        if (data?.name) {
          dispatch(addNotification({ type: 'added', downloadName: data.name }));
        }
      }
      if (event === 'download:completed') {
        scheduleDownloadsRefresh();
        persistDownloadSnapshot(data, true);
        maybeRunOnCompletionAction();
        if (data?.name) {
          dispatch(addNotification({ type: 'completed', downloadName: data.name }));
        }
      }
      if (event === 'download:failed') {
        scheduleDownloadsRefresh();
        persistDownloadSnapshot(data);
        if (data?.name) {
          dispatch(addNotification({ type: 'failed', downloadName: data.name }));
        }
      }
      if (
        event === 'download:removed' ||
        event === 'download:paused' ||
        event === 'download:resumed' ||
        event === 'download:state-changed'
      ) {
        scheduleDownloadsRefresh();
        if (event === 'download:resumed') {
          resetOnCompletionTrigger();
          enforceManualPauseRule(data);
        } else if (event === 'download:state-changed' || event === 'download:paused') {
          persistDownloadSnapshot(data);
        }
        if (event === 'download:removed') {
          const gid = extractGid(data);
          if (gid) {
            void api.dbRemoveDownload(gid).catch(() => {
              // Ignore races (already removed from DB)
            });
          }
          dispatch(loadCompletedHistory());
        }
      }
      // Auto-updater events
      if (event === 'update-available') {
        dispatch(setUpdateAvailable(data));
      }
      if (event === 'update-progress') {
        dispatch(setDownloadProgress(data));
      }
      if (event === 'update-downloaded') {
        dispatch(setUpdateDownloaded());
      }
    });

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      cleanupEvent();
      document.removeEventListener('keydown', handleKeyDown);
      if (refreshTimer !== null) {
        clearTimeout(refreshTimer);
      }
    };
  }, [dispatch, navigate, handleKeyDown]);

  return (
    <div
      className="app-layout"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Sidebar />
      <div className="main-area">
        <main className="main-content">
          {!isConnected && (
            <div className="connection-banner">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>wifi_off</span>
              <span>Engine disconnected</span>
              <span className="material-symbols-outlined spin" style={{ fontSize: 12 }}>sync</span>
              <span>Reconnecting...</span>
            </div>
          )}
          <Routes>
            <Route path="/" element={<Downloads />} />
            <Route path="/history" element={<History />} />
            <Route path="/statistics" element={<Statistics />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/scheduler" element={<Scheduler />} />
          </Routes>
        </main>
        <StatusBar />
      </div>

      {showOnboarding && <Onboarding onComplete={() => setShowOnboarding(false)} />}

      <UpdateToast />
      <UpdateModal />

      {isDragOver && (
        <div className="drop-overlay">
          <div className="drop-overlay-content">
            <div className="drop-icon">+</div>
            <p>Drop URL or .torrent file to add download</p>
          </div>
        </div>
      )}
    </div>
  );
}
