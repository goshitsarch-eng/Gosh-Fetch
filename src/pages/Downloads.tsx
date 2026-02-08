import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import DownloadCard from '../components/downloads/DownloadCard';
import AddDownloadModal from '../components/downloads/AddDownloadModal';
import {
  selectDownloads,
  selectActiveDownloads,
  selectPausedDownloads,
  selectErrorDownloads,
  fetchDownloads,
  loadCompletedHistory,
  restoreIncomplete,
  pauseAll,
  resumeAll,
} from '../store/downloadSlice';
import { selectStats } from '../store/statsSlice';
import { formatSpeed } from '../lib/utils/format';
import type { AppDispatch } from '../store/store';
import './Downloads.css';

export default function Downloads() {
  const dispatch = useDispatch<AppDispatch>();
  const allDownloads = useSelector(selectDownloads);
  const activeDownloads = useSelector(selectActiveDownloads);
  const pausedDownloads = useSelector(selectPausedDownloads);
  const errorDownloads = useSelector(selectErrorDownloads);
  const stats = useSelector(selectStats);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'error'>('all');

  useEffect(() => {
    dispatch(loadCompletedHistory());
    dispatch(restoreIncomplete());
    dispatch(fetchDownloads());
    const interval = setInterval(() => dispatch(fetchDownloads()), 1000);
    return () => clearInterval(interval);
  }, [dispatch]);

  const filteredDownloads = allDownloads.filter(d => d.status !== 'complete').filter(d => {
    switch (filter) {
      case 'active': return d.status === 'active' || d.status === 'waiting';
      case 'paused': return d.status === 'paused';
      case 'error': return d.status === 'error';
      default: return true;
    }
  });

  return (
    <div className="page">
      <header className="page-header">
        <div className="header-left">
          <h1>Downloads</h1>
          <div className="header-stats">
            <span className="stat"><span className="stat-icon">{'\u2193'}</span> {formatSpeed(stats.downloadSpeed)}</span>
            <span className="stat"><span className="stat-icon">{'\u2191'}</span> {formatSpeed(stats.uploadSpeed)}</span>
            <span className="stat-divider">|</span>
            <span className="stat">{stats.numActive} active</span>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => dispatch(pauseAll())}>{'\u23F8'} Pause All</button>
          <button className="btn btn-secondary btn-sm" onClick={() => dispatch(resumeAll())}>{'\u25B6'} Resume All</button>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>+ Add Download</button>
        </div>
      </header>

      <div className="filter-bar">
        <button className={`filter-btn${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>All</button>
        <button className={`filter-btn${filter === 'active' ? ' active' : ''}`} onClick={() => setFilter('active')}>Active ({activeDownloads.length})</button>
        <button className={`filter-btn${filter === 'paused' ? ' active' : ''}`} onClick={() => setFilter('paused')}>Paused ({pausedDownloads.length})</button>
        <button className={`filter-btn${filter === 'error' ? ' active' : ''}`} onClick={() => setFilter('error')}>Errors ({errorDownloads.length})</button>
      </div>

      <div className="downloads-list">
        {filteredDownloads.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">{'\uD83D\uDCE5'}</div>
            <h3>No downloads</h3>
            <p>Click &quot;Add Download&quot; to get started</p>
          </div>
        ) : (
          filteredDownloads.map(download => <DownloadCard key={download.gid} download={download} />)
        )}
      </div>

      {showAddModal && <AddDownloadModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
}
