import React from 'react';
import { NavLink } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { Download, CheckCircle, Settings, Info, ArrowDown, ArrowUp, Sun, Moon } from 'lucide-react';
import { selectStats } from '../../store/statsSlice';
import { selectActiveDownloads, selectCompletedDownloads } from '../../store/downloadSlice';
import { selectTheme, toggleTheme } from '../../store/themeSlice';
import { formatSpeed } from '../../lib/utils/format';
import type { AppDispatch } from '../../store/store';
import './Sidebar.css';

const navItems = [
  { path: '/', label: 'Downloads', icon: <Download size={16} /> },
  { path: '/completed', label: 'Completed', icon: <CheckCircle size={16} /> },
  { path: '/settings', label: 'Settings', icon: <Settings size={16} /> },
  { path: '/about', label: 'About', icon: <Info size={16} /> },
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
          <img src="/logo.png" alt="Gosh-Fetch" className="logo-icon" width={24} height={24} />
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
            <ArrowDown size={12} className="speed-icon" />
            <span className="speed-value">{formatSpeed(stats.downloadSpeed)}</span>
          </div>
          <div className="speed-row">
            <ArrowUp size={12} className="speed-icon" />
            <span className="speed-value">{formatSpeed(stats.uploadSpeed)}</span>
          </div>
        </div>

        <button className="theme-toggle" onClick={() => dispatch(toggleTheme())} title="Toggle theme">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </aside>
  );
}
