import React, { useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import Sidebar from './components/layout/Sidebar';
import Downloads from './pages/Downloads';
import Completed from './pages/Completed';
import Settings from './pages/Settings';
import About from './pages/About';
import { updateStats } from './store/statsSlice';
import { setTheme } from './store/themeSlice';
import type { AppDispatch } from './store/store';
import './App.css';

export default function App() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();

  useEffect(() => {
    // Initialize theme
    const saved = localStorage.getItem('gosh-fetch-theme') as 'dark' | 'light' | null;
    dispatch(setTheme(saved ?? 'dark'));

    // Listen for events from sidecar via Electron
    window.electronAPI.onEvent((event: string, data: any) => {
      if (event === 'global-stats') {
        dispatch(updateStats(data));
      }
      if (event === 'navigate') {
        navigate(data);
      }
    });

    return () => {
      window.electronAPI.removeAllListeners('rpc-event');
    };
  }, [dispatch, navigate]);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Downloads />} />
          <Route path="/completed" element={<Completed />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>
    </div>
  );
}
