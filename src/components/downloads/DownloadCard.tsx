import React, { useState, useEffect, useRef } from 'react';
import type { Download } from '../../lib/types/download';
import { Magnet, Link, FileDown, Pause, Play, RotateCcw, FolderOpen, Trash2, X, ArrowDown, ArrowUp } from 'lucide-react';
import { formatBytes, formatSpeed, formatProgress, formatEta, getFileExtension, getStatusColor, getStatusText } from '../../lib/utils/format';
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
      <div className="modal" onClick={(e) => e.stopPropagation()} ref={modalRef} style={{ maxWidth: '440px' }}>
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

function getTypeBadge(download: Download): { label: string; className: string } | null {
  if (download.status === 'paused') return { label: 'PAUSED', className: 'tag tag-orange' };
  if (download.status === 'error') return { label: 'ERROR', className: 'tag tag-red' };
  if (download.downloadType === 'torrent' || download.downloadType === 'magnet') return { label: 'TORRENT', className: 'tag tag-purple' };
  const ext = getFileExtension(download.name);
  if (ext === 'iso') return { label: 'ISO', className: 'tag tag-blue' };
  if (ext === 'zip' || ext === 'tar' || ext === 'gz' || ext === '7z' || ext === 'rar') return { label: ext.toUpperCase(), className: 'tag tag-blue' };
  if (ext === 'deb' || ext === 'rpm' || ext === 'appimage') return { label: ext.toUpperCase(), className: 'tag tag-green' };
  return null;
}

function getIconBg(download: Download): string {
  if (download.status === 'paused') return 'card-type-icon orange';
  if (download.status === 'error') return 'card-type-icon red';
  if (download.downloadType === 'torrent' || download.downloadType === 'magnet') return 'card-type-icon purple';
  return 'card-type-icon blue';
}

function DownloadCard({ download, selected, onSelect }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteWithFiles, setDeleteWithFiles] = useState(false);

  const progress = formatProgress(download.completedSize, download.totalSize);
  const eta =
    download.status === 'active' && download.downloadSpeed > 0
      ? formatEta(download.totalSize - download.completedSize, download.downloadSpeed)
      : null;
  const isPaused = download.status === 'paused';
  const typeBadge = getTypeBadge(download);

  function getTypeIcon(type: string) {
    switch (type) {
      case 'torrent':
      case 'magnet':
        return <Magnet size={16} />;
      default:
        return <FileDown size={16} />;
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
      <div className={`download-card${selected ? ' selected' : ''}${isPaused ? ' paused' : ''}`}>
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
        <div className={getIconBg(download)}>
          {getTypeIcon(download.downloadType)}
        </div>
        <div className="card-content">
          <div className="card-name-row">
            <span className="card-name" title={download.name}>{download.name}</span>
            {typeBadge && <span className={typeBadge.className}>{typeBadge.label}</span>}
          </div>
          <div className="progress-container">
            <div className="progress">
              <div className="progress-bar" style={{ width: `${progress}%` }} />
            </div>
            <span className="progress-text">{progress}%</span>
          </div>
        </div>
        <div className="card-col card-col-size">
          <span className="col-value">{formatBytes(download.completedSize)}</span>
          <span className="col-label">of {formatBytes(download.totalSize)}</span>
        </div>
        <div className="card-col card-col-speed">
          {download.status === 'active' ? (
            <>
              <span className="col-value speed-down">
                <ArrowDown size={10} /> {formatSpeed(download.downloadSpeed)}
              </span>
              {(download.downloadType === 'torrent' || download.downloadType === 'magnet') && (
                <span className="col-label speed-up">
                  <ArrowUp size={10} /> {formatSpeed(download.uploadSpeed)}
                </span>
              )}
            </>
          ) : (
            <span className="col-value" style={{ color: getStatusColor(download.status) }}>
              {getStatusText(download.status, download.downloadSpeed)}
            </span>
          )}
        </div>
        <div className="card-col card-col-eta">
          {download.status === 'active' && eta ? (
            <>
              <span className="col-value">{eta}</span>
              <span className="col-label">remaining</span>
            </>
          ) : download.status === 'active' && (download.downloadType === 'torrent' || download.downloadType === 'magnet') ? (
            <span className="col-label">{download.seeders}S / {download.connections}P</span>
          ) : null}
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

function downloadCardComparator(prev: Props, next: Props): boolean {
  return (
    prev.download.gid === next.download.gid &&
    prev.download.status === next.download.status &&
    prev.download.completedSize === next.download.completedSize &&
    prev.download.downloadSpeed === next.download.downloadSpeed &&
    prev.download.uploadSpeed === next.download.uploadSpeed &&
    prev.download.connections === next.download.connections &&
    prev.download.seeders === next.download.seeders &&
    prev.download.errorMessage === next.download.errorMessage &&
    prev.selected === next.selected
  );
}

export default React.memo(DownloadCard, downloadCardComparator);
