import React, { useEffect, useCallback, useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import Onboarding from './components/Onboarding';
import Sidebar from './components/layout/Sidebar';
import StatusBar from './components/layout/StatusBar';
import Downloads from './pages/Downloads';
import History from './pages/History';
import Settings from './pages/Settings';
import About from './pages/About';
import { updateStats, setDisconnected, selectIsConnected } from './store/statsSlice';
import { setTheme, applySystemTheme } from './store/themeSlice';
import { addDownload, addMagnet, fetchDownloads, restoreIncomplete } from './store/downloadSlice';
import { addNotification } from './store/notificationSlice';
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
            await dispatch(addDownload({ url: (file as any).path }));
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
        dispatch(fetchDownloads());
        if (data?.name) {
          dispatch(addNotification({ type: 'added', downloadName: data.name }));
        }
      }
      if (event === 'download:completed') {
        dispatch(fetchDownloads());
        if (data?.name) {
          dispatch(addNotification({ type: 'completed', downloadName: data.name }));
        }
      }
      if (event === 'download:failed') {
        dispatch(fetchDownloads());
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
        dispatch(fetchDownloads());
      }
    });

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      cleanupEvent();
      document.removeEventListener('keydown', handleKeyDown);
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
            <Route path="/settings" element={<Settings />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </main>
        <StatusBar />
      </div>

      {showOnboarding && <Onboarding onComplete={() => setShowOnboarding(false)} />}

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
