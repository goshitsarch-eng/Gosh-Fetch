import React, { useState, useEffect, useRef } from 'react';
import type { Download } from '../../lib/types/download';
import { formatBytes, formatSpeed, formatProgress, formatEta, getFileExtension } from '../../lib/utils/format';
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
          <button className="btn btn-ghost btn-icon" onClick={onCancel} aria-label="Close">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
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

function getTypeIcon(download: Download): string {
  if (download.downloadType === 'torrent' || download.downloadType === 'magnet') return 'hub';
  const ext = getFileExtension(download.name);
  if (['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v'].includes(ext)) return 'movie';
  if (['mp3', 'flac', 'wav', 'aac', 'ogg', 'wma', 'm4a', 'opus'].includes(ext)) return 'music_note';
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'rtf', 'odt', 'epub'].includes(ext)) return 'description';
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico', 'tiff', 'psd', 'raw'].includes(ext)) return 'image';
  if (['zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'zst'].includes(ext)) return 'folder_zip';
  if (['exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm', 'appimage'].includes(ext)) return 'terminal';
  if (['iso'].includes(ext)) return 'folder_zip';
  return 'download';
}

function getTypeBadge(download: Download): { label: string; className: string } | null {
  if (download.downloadType === 'torrent' || download.downloadType === 'magnet') return { label: 'TORRENT', className: 'card-badge purple' };
  const ext = getFileExtension(download.name);
  if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext)) return { label: ext.toUpperCase(), className: 'card-badge blue' };
  if (['mp3', 'flac', 'wav', 'aac', 'ogg'].includes(ext)) return { label: ext.toUpperCase(), className: 'card-badge blue' };
  if (['iso'].includes(ext)) return { label: 'ISO', className: 'card-badge orange' };
  if (['zip', 'tar', 'gz', '7z', 'rar', 'xz'].includes(ext)) return { label: ext === 'gz' ? 'ARCHIVE' : ext.toUpperCase(), className: 'card-badge purple' };
  if (['deb', 'rpm', 'appimage', 'exe', 'msi', 'dmg'].includes(ext)) return { label: ext.toUpperCase(), className: 'card-badge green' };
  if (['pdf', 'doc', 'docx'].includes(ext)) return { label: ext.toUpperCase(), className: 'card-badge blue' };
  return null;
}

function getIconColorClass(download: Download): string {
  if (download.status === 'error') return 'icon-red';
  if (download.downloadType === 'torrent' || download.downloadType === 'magnet') return 'icon-purple';
  const ext = getFileExtension(download.name);
  if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v'].includes(ext)) return 'icon-blue';
  if (['iso', 'zip', 'tar', 'gz', '7z', 'rar'].includes(ext)) return 'icon-orange';
  if (['deb', 'rpm', 'appimage', 'exe', 'msi'].includes(ext)) return 'icon-purple';
  return 'icon-blue';
}

function getStripeColor(download: Download): string {
  if (download.status === 'error') return 'var(--color-destructive)';
  const ext = getFileExtension(download.name);
  if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v'].includes(ext)) return 'var(--color-success)';
  if (download.downloadType === 'torrent' || download.downloadType === 'magnet') return 'var(--icon-color-purple)';
  if (['iso', 'zip', 'tar', 'gz', '7z', 'rar'].includes(ext)) return 'var(--icon-color-orange)';
  return 'var(--color-primary)';
}

function getSourceDomain(download: Download): string | null {
  const url = download.url || download.magnetUri;
  if (!url) return null;
  if (url.startsWith('magnet:')) return 'magnet link';
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
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
  const typeBadge = getTypeBadge(download);
  const sourceDomain = getSourceDomain(download);

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
    try { await api.openDownloadFolder(download.savePath); } catch (e) { console.error('Failed to open folder:', e); }
  }

  return (
    <>
      <div className={`download-card${selected ? ' selected' : ''}`}>
        {/* Top progress stripe */}
        <div className="card-stripe">
          <div
            className="card-stripe-fill"
            style={{ width: `${progress}%`, background: getStripeColor(download) }}
          />
        </div>

        <div className="card-body">
          {/* Icon */}
          <div className={`card-type-icon ${getIconColorClass(download)}`}>
            <span className="material-symbols-outlined">{getTypeIcon(download)}</span>
          </div>

          {/* Info area */}
          <div className="card-info">
            {/* Row 1: Name + hover actions */}
            <div className="card-row-top">
              <h3 className="card-name" title={download.name}>{download.name}</h3>
              <div className="card-actions">
                {(download.status === 'active' || download.status === 'waiting') && (
                  <button className="card-action-btn" onClick={handlePause} title="Pause" aria-label="Pause download">
                    <span className="material-symbols-outlined">pause</span>
                  </button>
                )}
                {download.status === 'paused' && (
                  <button className="card-action-btn" onClick={handleResume} title="Resume" aria-label="Resume download">
                    <span className="material-symbols-outlined">play_arrow</span>
                  </button>
                )}
                {download.status === 'error' && (
                  <button className="card-action-btn" onClick={handleResume} title="Retry" aria-label="Retry download">
                    <span className="material-symbols-outlined">refresh</span>
                  </button>
                )}
                <button className="card-action-btn danger" onClick={() => setShowDeleteConfirm(true)} title="Remove" aria-label="Remove download">
                  <span className="material-symbols-outlined">close</span>
                </button>
                <button className="card-action-btn" onClick={handleOpenFolder} title="Open folder" aria-label="Open folder">
                  <span className="material-symbols-outlined">folder_open</span>
                </button>
              </div>
            </div>

            {/* Row 2: Badge + source domain */}
            <div className="card-meta">
              {typeBadge && <span className={typeBadge.className}>{typeBadge.label}</span>}
              {sourceDomain && (
                <>
                  {typeBadge && <span className="meta-dot">&bull;</span>}
                  <span className="meta-domain">{sourceDomain}</span>
                </>
              )}
            </div>

            {/* Row 3: Progress bar + size */}
            <div className="card-progress-area">
              <div className="card-progress-main">
                <div className="card-progress-labels">
                  <span className="progress-size">
                    {formatBytes(download.completedSize)} <span className="progress-size-total">of {formatBytes(download.totalSize)}</span>
                  </span>
                  <span className="progress-percent" style={{ color: getStripeColor(download) }}>{progress}%</span>
                </div>
                <div className="progress">
                  <div className="progress-bar" style={{ width: `${progress}%` }} />
                </div>
              </div>

              {/* Speed + ETA */}
              {download.status === 'active' && (
                <div className="card-speed-area">
                  <span className="speed-value">{formatSpeed(download.downloadSpeed)}</span>
                  {eta && <span className="speed-eta">ETA: {eta}</span>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Checkbox overlay */}
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
