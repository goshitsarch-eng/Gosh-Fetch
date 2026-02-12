import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectDownloads, selectActiveDownloads, selectPausedDownloads, selectCompletedDownloads } from '../../store/downloadSlice';
import { formatBytes } from '../../lib/utils/format';
import './Sidebar.css';

interface NavItem {
  label: string;
  icon: string;
  filter: string | null;
  countSelector: 'all' | 'active' | 'paused' | 'completed';
}

const navItems: NavItem[] = [
  { label: 'All Downloads', icon: 'list', filter: null, countSelector: 'all' },
  { label: 'Active', icon: 'play_circle', filter: 'active', countSelector: 'active' },
  { label: 'Paused', icon: 'pause_circle', filter: 'paused', countSelector: 'paused' },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const allDownloads = useSelector(selectDownloads);
  const activeDownloads = useSelector(selectActiveDownloads);
  const pausedDownloads = useSelector(selectPausedDownloads);
  const completedDownloads = useSelector(selectCompletedDownloads);

  const [diskSpace, setDiskSpace] = useState<{ total: number; free: number } | null>(null);

  useEffect(() => {
    async function loadDiskSpace() {
      try {
        const space = await window.electronAPI.getDiskSpace();
        setDiskSpace(space);
      } catch { /* ignore */ }
    }
    loadDiskSpace();
    const interval = setInterval(loadDiskSpace, 30000);
    return () => clearInterval(interval);
  }, []);

  const currentFilter = location.pathname === '/' ? (searchParams.get('filter') || null) : '__settings__';

  function getCount(selector: NavItem['countSelector']): number {
    switch (selector) {
      case 'all': return allDownloads.filter(d => d.status !== 'complete').length;
      case 'active': return activeDownloads.length;
      case 'paused': return pausedDownloads.length;
      case 'completed': return completedDownloads.length;
    }
  }

  function handleNavClick(filter: string | null) {
    if (filter) {
      navigate(`/?filter=${filter}`);
    } else {
      navigate('/');
    }
  }

  const diskUsedPercent = diskSpace ? Math.round(((diskSpace.total - diskSpace.free) / diskSpace.total) * 100) : 0;

  return (
    <aside className="sidebar">
      <div className="sidebar-inner">
        {/* Header */}
        <div className="sidebar-header">
          <div className="logo">
            <div className="logo-icon-wrapper">
              <span className="material-symbols-outlined">bolt</span>
            </div>
            <div className="logo-info">
              <span className="logo-text">Gosh-Fetch</span>
              <span className="logo-subtitle">v2.0.1 &bull; Stable</span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const isActive = currentFilter === item.filter;
            const count = getCount(item.countSelector);
            return (
              <button
                key={item.label}
                className={`nav-item${isActive ? ' active' : ''}`}
                onClick={() => handleNavClick(item.filter)}
              >
                <span
                  className="material-symbols-outlined nav-icon"
                  style={isActive ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" } : undefined}
                >
                  {item.icon}
                </span>
                <span className="nav-label">{item.label}</span>
                {count > 0 && (
                  <span className={`nav-badge${isActive ? ' active' : ''}`}>{count}</span>
                )}
              </button>
            );
          })}

          {/* History Link */}
          <button
            className={`nav-item${location.pathname === '/history' ? ' active' : ''}`}
            onClick={() => navigate('/history')}
          >
            <span
              className="material-symbols-outlined nav-icon"
              style={location.pathname === '/history' ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" } : undefined}
            >
              history
            </span>
            <span className="nav-label">History</span>
            {completedDownloads.length > 0 && (
              <span className={`nav-badge${location.pathname === '/history' ? ' active' : ''}`}>{completedDownloads.length}</span>
            )}
          </button>

          {/* Statistics Link */}
          <button
            className={`nav-item${location.pathname === '/statistics' ? ' active' : ''}`}
            onClick={() => navigate('/statistics')}
          >
            <span
              className="material-symbols-outlined nav-icon"
              style={location.pathname === '/statistics' ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" } : undefined}
            >
              monitoring
            </span>
            <span className="nav-label">Statistics</span>
          </button>

          {/* Scheduler Link */}
          <button
            className={`nav-item${location.pathname === '/scheduler' ? ' active' : ''}`}
            onClick={() => navigate('/scheduler')}
          >
            <span
              className="material-symbols-outlined nav-icon"
              style={location.pathname === '/scheduler' ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" } : undefined}
            >
              calendar_month
            </span>
            <span className="nav-label">Scheduler</span>
          </button>
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          {/* Storage Widget */}
          {diskSpace && (
            <div className="storage-widget">
              <div className="storage-header">
                <span className="storage-label">Storage</span>
                <span className="storage-percent">{diskUsedPercent}%</span>
              </div>
              <div className="storage-bar">
                <div className="storage-bar-fill" style={{ width: `${diskUsedPercent}%` }} />
              </div>
              <span className="storage-detail">
                {formatBytes(diskSpace.free)} free of {formatBytes(diskSpace.total)}
              </span>
            </div>
          )}

          {/* Settings Link */}
          <button
            className={`nav-item settings-link${location.pathname === '/settings' ? ' active' : ''}`}
            onClick={() => navigate('/settings')}
          >
            <span className="material-symbols-outlined nav-icon">settings</span>
            <span className="nav-label">Settings</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
