import React, { useState } from 'react';
import type { Download } from '../../lib/types/download';
import { formatBytes, formatSpeed, formatProgress, formatEta, getStatusColor, getStatusText } from '../../lib/utils/format';
import { useDispatch } from 'react-redux';
import { pauseDownload, resumeDownload, removeDownload } from '../../store/downloadSlice';
import { api } from '../../lib/api';
import type { AppDispatch } from '../../store/store';
import './DownloadCard.css';

interface Props {
  download: Download;
  selected?: boolean;
  onSelect?: (gid: string, selected: boolean) => void;
}

export default function DownloadCard({ download, selected, onSelect }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteWithFiles, setDeleteWithFiles] = useState(false);

  const progress = formatProgress(download.completedSize, download.totalSize);
  const eta =
    download.status === 'active' && download.downloadSpeed > 0
      ? formatEta(download.totalSize - download.completedSize, download.downloadSpeed)
      : null;

  function getTypeIcon(type: string): string {
    switch (type) {
      case 'torrent':
      case 'magnet':
        return '\uD83E\uDDF2';
      default:
        return '\uD83D\uDD17';
    }
  }

  async function handlePause() {
    try { await dispatch(pauseDownload(download.gid)); } catch (e) { console.error('Failed to pause:', e); }
  }

  async function handleResume() {
    try { await dispatch(resumeDownload(download.gid)); } catch (e) { console.error('Failed to resume:', e); }
  }

  async function handleRemove() {
    try {
      await dispatch(removeDownload({ gid: download.gid, deleteFiles: deleteWithFiles }));
    } catch (e) {
      console.error('Failed to remove:', e);
    } finally {
      setShowDeleteConfirm(false);
      setDeleteWithFiles(false);
    }
  }

  async function handleOpenFolder() {
    try { await api.openFileLocation(download.savePath); } catch (e) { console.error('Failed to open folder:', e); }
  }

  return (
    <>
      <div className={`download-card${selected ? ' selected' : ''}`}>
        {onSelect && (
          <label className="card-checkbox" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={selected || false}
              onChange={(e) => onSelect(download.gid, e.target.checked)}
            />
          </label>
        )}
        <div className="card-main">
          <div className="card-icon">{getTypeIcon(download.downloadType)}</div>
          <div className="card-content">
            <div className="card-header">
              <span className="card-name" title={download.name}>{download.name}</span>
              <span className="card-status" style={{ color: getStatusColor(download.status) }}>
                {getStatusText(download.status, download.downloadSpeed)}
              </span>
            </div>
            <div className="progress-container">
              <div className="progress">
                <div className="progress-bar" style={{ width: `${progress}%` }} />
              </div>
              <span className="progress-text">{progress}%</span>
            </div>
            <div className="card-info">
              <span className="info-size">
                {formatBytes(download.completedSize)} / {formatBytes(download.totalSize)}
              </span>
              {download.status === 'active' && (
                <>
                  <span className="info-speed">
                    {'\u2193'} {formatSpeed(download.downloadSpeed)}
                    {(download.downloadType === 'torrent' || download.downloadType === 'magnet') && (
                      <span className="upload-speed">{'\u2191'} {formatSpeed(download.uploadSpeed)}</span>
                    )}
                  </span>
                  {eta && <span className="info-eta">ETA: {eta}</span>}
                </>
              )}
              {(download.downloadType === 'torrent' || download.downloadType === 'magnet') && download.status === 'active' && (
                <span className="info-peers">
                  {download.seeders} seeders {'\u00B7'} {download.connections} peers
                </span>
              )}
              {download.status === 'error' && download.errorMessage && (
                <span className="info-error">{download.errorMessage}</span>
              )}
            </div>
          </div>
        </div>
        <div className="card-actions">
          {(download.status === 'active' || download.status === 'waiting') && (
            <button className="btn btn-ghost btn-icon" onClick={handlePause} title="Pause">{'\u23F8'}</button>
          )}
          {download.status === 'paused' && (
            <button className="btn btn-ghost btn-icon" onClick={handleResume} title="Resume">{'\u25B6'}</button>
          )}
          {download.status === 'error' && (
            <button className="btn btn-ghost btn-icon" onClick={handleResume} title="Retry">{'\u21BB'}</button>
          )}
          {download.status === 'complete' && (
            <button className="btn btn-ghost btn-icon" onClick={handleOpenFolder} title="Open folder">{'\uD83D\uDCC2'}</button>
          )}
          <button className="btn btn-ghost btn-icon" onClick={() => setShowDeleteConfirm(true)} title="Remove">{'\uD83D\uDDD1'}</button>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="modal-backdrop" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Remove Download</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowDeleteConfirm(false)}>{'\u2715'}</button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to remove &quot;{download.name}&quot;?</p>
              <label className="checkbox-label">
                <input type="checkbox" checked={deleteWithFiles} onChange={(e) => setDeleteWithFiles(e.target.checked)} />
                <span>Also delete downloaded files</span>
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button className="btn btn-destructive" onClick={handleRemove}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
