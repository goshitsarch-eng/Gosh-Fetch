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
  pauseDownload,
  resumeDownload,
  removeDownload,
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
  const [selectedGids, setSelectedGids] = useState<Set<string>>(new Set());

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

  const hasSelection = selectedGids.size > 0;
  const allSelected = filteredDownloads.length > 0 && filteredDownloads.every(d => selectedGids.has(d.gid));

  function handleSelect(gid: string, selected: boolean) {
    setSelectedGids(prev => {
      const next = new Set(prev);
      if (selected) next.add(gid);
      else next.delete(gid);
      return next;
    });
  }

  function handleSelectAll() {
    if (allSelected) {
      setSelectedGids(new Set());
    } else {
      setSelectedGids(new Set(filteredDownloads.map(d => d.gid)));
    }
  }

  async function handleBatchPause() {
    for (const gid of selectedGids) {
      try { await dispatch(pauseDownload(gid)); } catch { /* ignore */ }
    }
    setSelectedGids(new Set());
  }

  async function handleBatchResume() {
    for (const gid of selectedGids) {
      try { await dispatch(resumeDownload(gid)); } catch { /* ignore */ }
    }
    setSelectedGids(new Set());
  }

  async function handleBatchRemove() {
    for (const gid of selectedGids) {
      try { await dispatch(removeDownload({ gid, deleteFiles: false })); } catch { /* ignore */ }
    }
    setSelectedGids(new Set());
  }

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
        <label className="select-all-checkbox">
          <input type="checkbox" checked={allSelected} onChange={handleSelectAll} disabled={filteredDownloads.length === 0} />
        </label>
        <button className={`filter-btn${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>All</button>
        <button className={`filter-btn${filter === 'active' ? ' active' : ''}`} onClick={() => setFilter('active')}>Active ({activeDownloads.length})</button>
        <button className={`filter-btn${filter === 'paused' ? ' active' : ''}`} onClick={() => setFilter('paused')}>Paused ({pausedDownloads.length})</button>
        <button className={`filter-btn${filter === 'error' ? ' active' : ''}`} onClick={() => setFilter('error')}>Errors ({errorDownloads.length})</button>
      </div>

      {hasSelection && (
        <div className="batch-action-bar">
          <span className="batch-count">{selectedGids.size} selected</span>
          <button className="btn btn-secondary btn-sm" onClick={handleBatchPause}>{'\u23F8'} Pause</button>
          <button className="btn btn-secondary btn-sm" onClick={handleBatchResume}>{'\u25B6'} Resume</button>
          <button className="btn btn-destructive btn-sm" onClick={handleBatchRemove}>{'\uD83D\uDDD1'} Remove</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelectedGids(new Set())}>Clear</button>
        </div>
      )}

      <div className="downloads-list">
        {filteredDownloads.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">{'\uD83D\uDCE5'}</div>
            <h3>No downloads</h3>
            <p>Click &quot;Add Download&quot; to get started</p>
          </div>
        ) : (
          filteredDownloads.map(download => (
            <DownloadCard
              key={download.gid}
              download={download}
              selected={selectedGids.has(download.gid)}
              onSelect={handleSelect}
            />
          ))
        )}
      </div>

      {showAddModal && <AddDownloadModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
}
