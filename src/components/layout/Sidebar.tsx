import React from 'react';
import { NavLink } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { selectStats } from '../../store/statsSlice';
import { selectActiveDownloads, selectCompletedDownloads } from '../../store/downloadSlice';
import { selectTheme, toggleTheme } from '../../store/themeSlice';
import { formatSpeed } from '../../lib/utils/format';
import type { AppDispatch } from '../../store/store';
import './Sidebar.css';

const navItems = [
  { path: '/', label: 'Downloads', icon: '\u2193' },
  { path: '/completed', label: 'Completed', icon: '\u2713' },
  { path: '/settings', label: 'Settings', icon: '\u2699' },
  { path: '/about', label: 'About', icon: '\u2139' },
];

export default function Sidebar() {
  const dispatch = useDispatch<AppDispatch>();
  const stats = useSelector(selectStats);
  const activeDownloads = useSelector(selectActiveDownloads);
  const completedDownloads = useSelector(selectCompletedDownloads);
  const theme = useSelector(selectTheme);

  function getBadgeCount(path: string): number | null {
    if (path === '/') return activeDownloads.length || null;
    if (path === '/completed') return completedDownloads.length || null;
    return null;
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo">
          <span className="logo-icon">{'\u2B07'}</span>
          <span className="logo-text">Gosh-Fetch</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const count = getBadgeCount(item.path);
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {count ? <span className="nav-badge">{count}</span> : null}
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="speed-display">
          <div className="speed-row">
            <span className="speed-icon">{'\u2193'}</span>
            <span className="speed-value">{formatSpeed(stats.downloadSpeed)}</span>
          </div>
          <div className="speed-row">
            <span className="speed-icon">{'\u2191'}</span>
            <span className="speed-value">{formatSpeed(stats.uploadSpeed)}</span>
          </div>
        </div>

        <button className="theme-toggle" onClick={() => dispatch(toggleTheme())} title="Toggle theme">
          {theme === 'dark' ? '\u2600' : '\u263E'}
        </button>
      </div>
    </aside>
  );
}
