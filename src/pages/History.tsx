import React, { useEffect, useState, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  selectCompletedDownloads,
  clearHistory,
  removeDownload,
  fetchDownloads,
  loadCompletedHistory,
} from '../store/downloadSlice';
import { formatBytes, formatDate, getFileExtension } from '../lib/utils/format';
import { api } from '../lib/api';
import type { Download } from '../lib/types/download';
import type { AppDispatch } from '../store/store';
import './History.css';

type CategoryFilter = 'all' | 'documents' | 'software' | 'media' | 'torrents';

const FILTERS: { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'documents', label: 'Documents' },
  { key: 'software', label: 'Software' },
  { key: 'media', label: 'Media' },
  { key: 'torrents', label: 'Torrents' },
];

const DOC_EXTS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'csv', 'odt', 'ods', 'odp', 'epub']);
const SOFTWARE_EXTS = new Set(['exe', 'msi', 'dmg', 'deb', 'rpm', 'appimage', 'sh', 'bat', 'jar', 'apk', 'snap', 'flatpak', 'iso']);
const MEDIA_EXTS = new Set([
  'mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm',
  'mp3', 'flac', 'wav', 'ogg', 'aac', 'm4a',
  'jpg', 'jpeg', 'png', 'gif', 'svg', 'bmp', 'webp',
]);

const ARCHIVE_EXTS = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'zst']);
const VIDEO_EXTS = new Set(['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm']);
const AUDIO_EXTS = new Set(['mp3', 'flac', 'wav', 'ogg', 'aac', 'm4a']);
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'svg', 'bmp', 'webp']);
const SCRIPT_EXTS = new Set(['sh', 'bat', 'py', 'js', 'ts', 'rb', 'pl']);

function getFileCategory(download: Download): CategoryFilter {
  if (download.downloadType === 'torrent' || download.downloadType === 'magnet') return 'torrents';
  const ext = getFileExtension(download.name);
  if (DOC_EXTS.has(ext)) return 'documents';
  if (SOFTWARE_EXTS.has(ext)) return 'software';
  if (MEDIA_EXTS.has(ext)) return 'media';
  return 'all';
}

function getFileTypeIcon(download: Download): { icon: string; colorClass: string } {
  if (download.downloadType === 'torrent' || download.downloadType === 'magnet') {
    return { icon: 'cloud_download', colorClass: 'violet' };
  }
  const ext = getFileExtension(download.name);
  if (ext === 'iso') return { icon: 'album', colorClass: 'orange' };
  if (DOC_EXTS.has(ext)) return { icon: 'description', colorClass: 'blue' };
  if (VIDEO_EXTS.has(ext)) return { icon: 'movie', colorClass: 'purple' };
  if (ARCHIVE_EXTS.has(ext)) return { icon: 'folder_zip', colorClass: 'emerald' };
  if (AUDIO_EXTS.has(ext)) return { icon: 'music_note', colorClass: 'pink' };
  if (IMAGE_EXTS.has(ext)) return { icon: 'image', colorClass: 'rose' };
  if (SCRIPT_EXTS.has(ext)) return { icon: 'terminal', colorClass: 'sky' };
  if (SOFTWARE_EXTS.has(ext)) return { icon: 'apps', colorClass: 'indigo' };
  return { icon: 'insert_drive_file', colorClass: 'slate' };
}

function getSourceDomain(download: Download): string {
  if (download.url) {
    try {
      const url = new URL(download.url);
      return url.hostname;
    } catch { /* ignore */ }
  }
  if (download.downloadType === 'magnet' || download.downloadType === 'torrent') {
    return 'torrent';
  }
  return download.savePath || '';
}

function getStatusBadge(download: Download): { label: string; className: string; icon: string | null } {
  if (download.status === 'complete') {
    return { label: 'Valid', className: 'complete', icon: 'verified' };
  }
  if (download.status === 'error') {
    return { label: 'Error', className: 'error', icon: 'error' };
  }
  return { label: 'N/A', className: 'na', icon: null };
}

function HistoryRow({ download, onDelete }: { download: Download; onDelete: (gid: string) => void }) {
  const { icon, colorClass } = getFileTypeIcon(download);
  const source = getSourceDomain(download);
  const status = getStatusBadge(download);

  async function handleOpenFolder() {
    try {
      await api.openFileLocation(download.savePath);
    } catch (e) {
      console.error('Failed to open folder:', e);
    }
  }

  async function handleOpenFile() {
    try {
      await api.openFileLocation(download.savePath);
    } catch (e) {
      console.error('Failed to open file:', e);
    }
  }

  return (
    <tr>
      <td>
        <div className={`history-type-icon ${colorClass}`}>
          <span className="material-symbols-outlined">{icon}</span>
        </div>
      </td>
      <td>
        <div className="history-filename">
          <span className="history-filename-name" title={download.name}>{download.name}</span>
          <span className="history-filename-source" title={source}>{source}</span>
        </div>
      </td>
      <td><span className="history-size">{formatBytes(download.totalSize)}</span></td>
      <td><span className="history-date">{download.completedAt ? formatDate(download.completedAt) : formatDate(download.createdAt)}</span></td>
      <td style={{ textAlign: 'center' }}>
        <span className={`history-status-badge ${status.className}`}>
          {status.icon && <span className="material-symbols-outlined">{status.icon}</span>}
          {status.label}
        </span>
      </td>
      <td>
        <div className="history-actions">
          <button className="history-action-btn" onClick={handleOpenFolder} title="Open Folder">
            <span className="material-symbols-outlined">folder</span>
          </button>
          <button className="history-action-btn" onClick={handleOpenFile} title="Open File">
            <span className="material-symbols-outlined">open_in_new</span>
          </button>
          <button className="history-action-btn delete" onClick={() => onDelete(download.gid)} title="Delete">
            <span className="material-symbols-outlined">delete</span>
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function History() {
  const dispatch = useDispatch<AppDispatch>();
  const completedDownloads = useSelector(selectCompletedDownloads);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>('all');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    dispatch(loadCompletedHistory());
    dispatch(fetchDownloads());
    const interval = setInterval(() => dispatch(fetchDownloads()), 1000);
    return () => clearInterval(interval);
  }, [dispatch]);

  const filteredDownloads = useMemo(() => {
    let items = completedDownloads;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(d => d.name.toLowerCase().includes(q));
    }

    if (activeFilter !== 'all') {
      items = items.filter(d => {
        const cat = getFileCategory(d);
        return cat === activeFilter || cat === 'all';
      });
    }

    return items;
  }, [completedDownloads, searchQuery, activeFilter]);

  async function handleClearHistory() {
    setIsClearing(true);
    await dispatch(clearHistory());
    setIsClearing(false);
    setShowClearConfirm(false);
  }

  async function handleDeleteItem(gid: string) {
    await dispatch(removeDownload({ gid, deleteFiles: false }));
    dispatch(loadCompletedHistory());
  }

  return (
    <div className="history-page">
      <header className="history-header">
        <div className="history-header-top">
          <div>
            <h2>Download History</h2>
            <p>Manage and review your completed downloads.</p>
          </div>
          {completedDownloads.length > 0 && (
            <button className="btn-clear-history" onClick={() => setShowClearConfirm(true)}>
              <span className="material-symbols-outlined">delete_sweep</span>
              Clear History
            </button>
          )}
        </div>
        <div className="history-toolbar">
          <div className="history-search">
            <span className="material-symbols-outlined search-icon">search</span>
            <input
              type="text"
              placeholder="Search filenames, types, or checksums..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="history-filters">
            {FILTERS.map(f => (
              <button
                key={f.key}
                className={`filter-pill${activeFilter === f.key ? ' active' : ''}`}
                onClick={() => setActiveFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="history-table-container">
        {filteredDownloads.length === 0 ? (
          <div className="history-empty">
            <span className="material-symbols-outlined">history</span>
            <h3>{completedDownloads.length === 0 ? 'No download history' : 'No matching downloads'}</h3>
            <p>{completedDownloads.length === 0 ? 'Completed downloads will appear here.' : 'Try adjusting your search or filters.'}</p>
          </div>
        ) : (
          <>
            <div className="history-table-wrapper">
              <table className="history-table">
                <thead>
                  <tr>
                    <th className="col-type">Type</th>
                    <th>Filename</th>
                    <th className="col-size">Size</th>
                    <th className="col-date">Date</th>
                    <th className="col-status">Status</th>
                    <th className="col-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDownloads.map(d => (
                    <HistoryRow key={d.gid} download={d} onDelete={handleDeleteItem} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="history-count">
              Showing {filteredDownloads.length} of {completedDownloads.length} items
            </div>
          </>
        )}
      </div>

      {showClearConfirm && (
        <div className="modal-backdrop" onClick={() => setShowClearConfirm(false)} role="dialog" aria-modal="true" aria-labelledby="clear-history-title">
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h3 className="modal-title" id="clear-history-title">Clear History</h3>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to clear download history? This will not delete the downloaded files.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowClearConfirm(false)}>Cancel</button>
              <button className="btn btn-destructive" onClick={handleClearHistory} disabled={isClearing}>
                {isClearing ? 'Clearing...' : 'Clear History'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
