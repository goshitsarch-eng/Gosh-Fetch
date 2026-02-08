import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { addDownload, addMagnet, addTorrentFile, fetchDownloads } from '../../store/downloadSlice';
import type { AppDispatch } from '../../store/store';
import './AddDownloadModal.css';

interface Props {
  onClose: () => void;
}

export default function AddDownloadModal({ onClose }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const [mode, setMode] = useState<'url' | 'torrent' | 'magnet'>('url');
  const [url, setUrl] = useState('');
  const [magnetUri, setMagnetUri] = useState('');
  const [torrentPath, setTorrentPath] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);

    try {
      if (mode === 'url' && url.trim()) {
        if (url.trim().startsWith('magnet:')) {
          await dispatch(addMagnet({ magnetUri: url.trim() })).unwrap();
        } else {
          await dispatch(addDownload({ url: url.trim() })).unwrap();
        }
      } else if (mode === 'magnet' && magnetUri.trim()) {
        await dispatch(addMagnet({ magnetUri: magnetUri.trim() })).unwrap();
      } else if (mode === 'torrent' && torrentPath) {
        await dispatch(addTorrentFile({ filePath: torrentPath })).unwrap();
      } else {
        setError('Please provide a valid URL, magnet link, or torrent file');
        setIsSubmitting(false);
        return;
      }
      await dispatch(fetchDownloads());
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBrowseTorrent() {
    const selected = await window.electronAPI.selectFile({
      filters: [{ name: 'Torrent files', extensions: ['torrent'] }],
    });
    if (selected) {
      setTorrentPath(selected);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') onClose();
    else if (event.key === 'Enter' && !event.shiftKey) handleSubmit();
  }

  return (
    <div className="modal-backdrop" onClick={onClose} onKeyDown={handleKeyDown}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Add Download</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>{'\u2715'}</button>
        </div>

        <div className="modal-body">
          <div className="mode-tabs">
            <button className={`mode-tab${mode === 'url' ? ' active' : ''}`} onClick={() => setMode('url')}>URL</button>
            <button className={`mode-tab${mode === 'magnet' ? ' active' : ''}`} onClick={() => setMode('magnet')}>Magnet</button>
            <button className={`mode-tab${mode === 'torrent' ? ' active' : ''}`} onClick={() => setMode('torrent')}>Torrent File</button>
          </div>

          {mode === 'url' && (
            <div className="form-group">
              <label htmlFor="url">Download URL</label>
              <input id="url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/file.zip" autoFocus />
              <p className="help-text">Supports HTTP, HTTPS, FTP, and magnet links</p>
            </div>
          )}

          {mode === 'magnet' && (
            <div className="form-group">
              <label htmlFor="magnet">Magnet Link</label>
              <textarea id="magnet" value={magnetUri} onChange={(e) => setMagnetUri(e.target.value)} placeholder="magnet:?xt=urn:btih:..." rows={3} />
            </div>
          )}

          {mode === 'torrent' && (
            <div className="form-group">
              <label>Torrent File</label>
              <div className="file-input">
                <input type="text" value={torrentPath} placeholder="Select a .torrent file" readOnly />
                <button className="btn btn-secondary" onClick={handleBrowseTorrent}>Browse</button>
              </div>
            </div>
          )}

          {error && <div className="error-message">{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Adding...' : 'Add Download'}
          </button>
        </div>
      </div>
    </div>
  );
}
