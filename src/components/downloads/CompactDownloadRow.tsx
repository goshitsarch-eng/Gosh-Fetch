import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import type { Download } from '../../lib/types/download';
import { formatBytes } from '../../lib/utils/format';
import { pauseDownload, resumeDownload, removeDownload } from '../../store/downloadSlice';
import { api } from '../../lib/api';
import type { AppDispatch } from '../../store/store';
import './CompactDownloadRow.css';

interface Props {
  download: Download;
  selected?: boolean;
  onSelect?: (gid: string, selected: boolean) => void;
}

function getCompactIcon(download: Download): { icon: string; className: string } {
  if (download.status === 'paused') return { icon: 'pause', className: 'compact-icon muted' };
  if (download.status === 'error') return { icon: 'error', className: 'compact-icon error' };
  if (download.status === 'complete') return { icon: 'check', className: 'compact-icon success' };
  return { icon: 'download', className: 'compact-icon muted' };
}

function getCompactMeta(download: Download): string {
  if (download.status === 'paused') {
    return `Paused \u2022 ${formatBytes(download.completedSize)} of ${formatBytes(download.totalSize)}`;
  }
  if (download.status === 'error') {
    return `Error \u2022 ${download.errorMessage || 'Download failed'}`;
  }
  if (download.status === 'complete') {
    const when = download.completedAt
      ? `Completed ${new Date(download.completedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
      : 'Completed';
    return `${when} \u2022 ${formatBytes(download.totalSize)}`;
  }
  return formatBytes(download.totalSize);
}

function CompactDownloadRow({ download, selected, onSelect }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const [showConfirm, setShowConfirm] = useState(false);
  const { icon, className } = getCompactIcon(download);
  const meta = getCompactMeta(download);

  async function handleResume() {
    try { await dispatch(resumeDownload(download.gid)); } catch { /* ignore */ }
  }

  async function handleRemove() {
    try { await dispatch(removeDownload({ gid: download.gid, deleteFiles: false })); } catch { /* ignore */ }
    setShowConfirm(false);
  }

  async function handleOpenFolder() {
    try { await api.openFileLocation(download.savePath); } catch { /* ignore */ }
  }

  return (
    <div className={`compact-row${selected ? ' selected' : ''}${download.status === 'paused' ? ' is-paused' : ''}`}>
      {onSelect && (
        <label className="compact-checkbox" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected || false}
            onChange={(e) => onSelect(download.gid, e.target.checked)}
            aria-label={`Select ${download.name}`}
          />
        </label>
      )}
      <div className={className}>
        <span className="material-symbols-outlined">{icon}</span>
      </div>
      <div className="compact-info">
        <h3 className={`compact-name${download.status === 'complete' ? ' completed-strike' : ''}`} title={download.name}>
          {download.name}
        </h3>
        <p className="compact-meta">{meta}</p>
      </div>
      <div className="compact-actions">
        {download.status === 'paused' && (
          <button className="compact-action-btn primary" onClick={handleResume} title="Resume">
            <span className="material-symbols-outlined">play_arrow</span>
          </button>
        )}
        {download.status === 'error' && (
          <button className="compact-action-btn primary" onClick={handleResume} title="Retry">
            <span className="material-symbols-outlined">refresh</span>
          </button>
        )}
        {download.status === 'complete' && (
          <button className="compact-action-btn" onClick={handleOpenFolder} title="Open Folder">
            <span className="material-symbols-outlined">folder</span>
          </button>
        )}
        {showConfirm ? (
          <>
            <button className="compact-action-btn danger" onClick={handleRemove} title="Confirm remove">
              <span className="material-symbols-outlined">check</span>
            </button>
            <button className="compact-action-btn" onClick={() => setShowConfirm(false)} title="Cancel">
              <span className="material-symbols-outlined">close</span>
            </button>
          </>
        ) : (
          <button className="compact-action-btn" onClick={() => setShowConfirm(true)} title="Remove">
            <span className="material-symbols-outlined">close</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default React.memo(CompactDownloadRow);
