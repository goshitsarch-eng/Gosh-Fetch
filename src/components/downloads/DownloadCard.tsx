import React, { useState, useEffect, useRef } from 'react';
import type { Download } from '../../lib/types/download';
import { Magnet, Link, Pause, Play, RotateCcw, FolderOpen, Trash2, X, ArrowDown, ArrowUp } from 'lucide-react';
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

function DeleteConfirmModal({ downloadName, deleteWithFiles, onDeleteWithFilesChange, onConfirm, onCancel }: {
  downloadName: string;
  deleteWithFiles: boolean;
  onDeleteWithFilesChange: (v: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;
    const focusable = modal.querySelectorAll<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();

    function trapFocus(e: KeyboardEvent) {
      if (e.key === 'Escape') { onCancel(); return; }
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }
    modal.addEventListener('keydown', trapFocus);
    return () => modal.removeEventListener('keydown', trapFocus);
  }, [onCancel]);

  return (
    <div className="modal-backdrop" onClick={onCancel} role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title">
      <div className="modal" onClick={(e) => e.stopPropagation()} ref={modalRef}>
        <div className="modal-header">
          <h3 className="modal-title" id="delete-confirm-title">Remove Download</h3>
          <button className="btn btn-ghost btn-icon" onClick={onCancel} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="modal-body">
          <p>Are you sure you want to remove &quot;{downloadName}&quot;?</p>
          <label className="checkbox-label">
            <input type="checkbox" checked={deleteWithFiles} onChange={(e) => onDeleteWithFilesChange(e.target.checked)} />
            <span>Also delete downloaded files</span>
          </label>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-destructive" onClick={onConfirm}>Remove</button>
        </div>
      </div>
    </div>
  );
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

  function getTypeIcon(type: string) {
    switch (type) {
      case 'torrent':
      case 'magnet':
        return <Magnet size={18} />;
      default:
        return <Link size={18} />;
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
              aria-label={`Select ${download.name}`}
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
                    <ArrowDown size={12} /> {formatSpeed(download.downloadSpeed)}
                    {(download.downloadType === 'torrent' || download.downloadType === 'magnet') && (
                      <span className="upload-speed"><ArrowUp size={12} /> {formatSpeed(download.uploadSpeed)}</span>
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
            <button className="btn btn-ghost btn-icon" onClick={handlePause} title="Pause" aria-label="Pause download"><Pause size={16} /></button>
          )}
          {download.status === 'paused' && (
            <button className="btn btn-ghost btn-icon" onClick={handleResume} title="Resume" aria-label="Resume download"><Play size={16} /></button>
          )}
          {download.status === 'error' && (
            <button className="btn btn-ghost btn-icon" onClick={handleResume} title="Retry" aria-label="Retry download"><RotateCcw size={16} /></button>
          )}
          {download.status === 'complete' && (
            <button className="btn btn-ghost btn-icon" onClick={handleOpenFolder} title="Open folder" aria-label="Open folder"><FolderOpen size={16} /></button>
          )}
          <button className="btn btn-ghost btn-icon" onClick={() => setShowDeleteConfirm(true)} title="Remove" aria-label="Remove download"><Trash2 size={16} /></button>
        </div>
      </div>

      {showDeleteConfirm && (
        <DeleteConfirmModal
          downloadName={download.name}
          deleteWithFiles={deleteWithFiles}
          onDeleteWithFilesChange={setDeleteWithFiles}
          onConfirm={handleRemove}
          onCancel={() => { setShowDeleteConfirm(false); setDeleteWithFiles(false); }}
        />
      )}
    </>
  );
}
