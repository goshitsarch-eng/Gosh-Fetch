import React, { useEffect, useCallback, useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { WifiOff, RefreshCw } from 'lucide-react';
import Onboarding from './components/Onboarding';
import Sidebar from './components/layout/Sidebar';
import Downloads from './pages/Downloads';
import Completed from './pages/Completed';
import Settings from './pages/Settings';
import About from './pages/About';
import { updateStats, setDisconnected, selectIsConnected } from './store/statsSlice';
import { setTheme } from './store/themeSlice';
import { addDownload, addMagnet, fetchDownloads } from './store/downloadSlice';
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
      // Trigger add modal via custom event
      window.dispatchEvent(new CustomEvent('gosh-fetch:open-add-modal'));
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
    const saved = localStorage.getItem('gosh-fetch-theme') as 'dark' | 'light' | null;
    dispatch(setTheme(saved ?? 'dark'));

    // Listen for events from sidecar via Electron
    const cleanupEvent = window.electronAPI.onEvent((event: string, data: any) => {
      if (event === 'global-stats') {
        dispatch(updateStats(data));
      }
      if (event === 'navigate') {
        navigate(data);
      }
      if (event === 'engine-status') {
        if (!data.connected && !data.restarting) {
          dispatch(setDisconnected());
        }
      }
      // Push-based download list refresh on state changes
      if (
        event === 'download:added' ||
        event === 'download:completed' ||
        event === 'download:failed' ||
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
      <main className="main-content">
        {!isConnected && (
          <div className="connection-banner">
            <WifiOff size={14} />
            <span>Engine disconnected</span>
            <RefreshCw size={12} className="spin" />
            <span>Reconnecting...</span>
          </div>
        )}
        <Routes>
          <Route path="/" element={<Downloads />} />
          <Route path="/completed" element={<Completed />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>

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
