import React, { useState, useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { addDownload, addMagnet, addTorrentFile, addUrls, fetchDownloads } from '../../store/downloadSlice';
import type { AppDispatch } from '../../store/store';
import type { DownloadOptions, TorrentInfo } from '../../lib/types/download';
import { api } from '../../lib/api';
import TorrentFilePicker from './TorrentFilePicker';
import './AddDownloadModal.css';

interface Props {
  onClose: () => void;
}

export default function AddDownloadModal({ onClose }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const [mode, setMode] = useState<'link' | 'torrent'>('link');
  const [urls, setUrls] = useState('');
  const [torrentPath, setTorrentPath] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Advanced options state
  const [saveDir, setSaveDir] = useState('');
  const [outFilename, setOutFilename] = useState('');
  const [speedLimit, setSpeedLimit] = useState('');
  const [connections, setConnections] = useState('');
  const [priority, setPriority] = useState('normal');
  const [customHeaders, setCustomHeaders] = useState('');
  const [checksum, setChecksum] = useState('');
  const [sequential, setSequential] = useState(false);

  // File picker state for torrent files
  const [torrentInfo, setTorrentInfo] = useState<TorrentInfo | null>(null);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [defaultSavePath, setDefaultSavePath] = useState('');

  function buildOptions(): DownloadOptions | undefined {
    const opts: DownloadOptions = {};
    let hasOpts = false;

    if (saveDir.trim()) { opts.dir = saveDir.trim(); hasOpts = true; }
    if (outFilename.trim()) { opts.out = outFilename.trim(); hasOpts = true; }
    if (speedLimit.trim() && Number(speedLimit) > 0) {
      opts.maxDownloadLimit = `${speedLimit}M`;
      hasOpts = true;
    }
    if (connections.trim() && Number(connections) > 0) {
      opts.split = connections.trim();
      hasOpts = true;
    }
    if (priority !== 'normal') { opts.priority = priority; hasOpts = true; }
    if (customHeaders.trim()) {
      opts.header = customHeaders.split('\n').map(h => h.trim()).filter(h => h.length > 0);
      hasOpts = true;
    }
    if (checksum.trim()) { opts.checksum = checksum.trim(); hasOpts = true; }
    if (sequential) { opts.sequential = true; hasOpts = true; }

    return hasOpts ? opts : undefined;
  }

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);

    try {
      const options = buildOptions();

      if (mode === 'link') {
        const lines = urls.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) {
          setError('Please provide at least one URL or magnet link');
          setIsSubmitting(false);
          return;
        }

        const magnetLines: string[] = [];
        const urlLines: string[] = [];
        for (const line of lines) {
          if (line.startsWith('magnet:')) {
            magnetLines.push(line);
          } else {
            urlLines.push(line);
          }
        }

        // Submit magnets
        for (const magnet of magnetLines) {
          await dispatch(addMagnet({ magnetUri: magnet, options })).unwrap();
        }

        // Submit URLs
        if (urlLines.length === 1) {
          await dispatch(addDownload({ url: urlLines[0], options })).unwrap();
        } else if (urlLines.length > 1) {
          await dispatch(addUrls({ urls: urlLines, options })).unwrap();
        }
      } else if (mode === 'torrent') {
        if (!torrentPath) {
          setError('Please select a .torrent file');
          setIsSubmitting(false);
          return;
        }

        // Parse torrent to check if it has multiple files
        try {
          const info = await api.parseTorrentFile(torrentPath);
          if (info.files.length > 1) {
            // Show file picker for multi-file torrents
            setTorrentInfo(info);
            setShowFilePicker(true);
            setIsSubmitting(false);
            return;
          }
        } catch {
          // If parse fails, proceed with adding directly
        }

        await dispatch(addTorrentFile({ filePath: torrentPath, options })).unwrap();
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

  async function handleBrowseDir() {
    const selected = await window.electronAPI.selectDirectory();
    if (selected) {
      setSaveDir(selected);
    }
  }

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrls(prev => prev ? prev + '\n' + text : text);
      }
    } catch {}
  }

  // Load default save path for file picker
  useEffect(() => {
    api.getDefaultDownloadPath().then(setDefaultSavePath).catch(() => {});
  }, []);

  async function handleFilePickerConfirm(selectedIndices: number[]) {
    setError(null);
    setIsSubmitting(true);
    try {
      const options = buildOptions() || {};
      // selectFile uses 1-based indices for the engine
      options.selectFile = selectedIndices.map(i => i + 1).join(',');
      await dispatch(addTorrentFile({ filePath: torrentPath, options })).unwrap();
      await dispatch(fetchDownloads());
      onClose();
    } catch (e) {
      setError(String(e));
      setShowFilePicker(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;
    const focusable = modal.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();

    function trapFocus(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }
    modal.addEventListener('keydown', trapFocus);
    return () => modal.removeEventListener('keydown', trapFocus);
  }, []);

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') onClose();
  }

  const hasMagnetContent = urls.split('\n').some(l => l.trim().startsWith('magnet:'));
  const showSequential = mode === 'torrent' || hasMagnetContent;

  if (showFilePicker && torrentInfo) {
    return (
      <TorrentFilePicker
        torrentInfo={torrentInfo}
        savePath={saveDir || defaultSavePath}
        onConfirm={handleFilePickerConfirm}
        onCancel={() => setShowFilePicker(false)}
      />
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose} onKeyDown={handleKeyDown} role="dialog" aria-modal="true" aria-labelledby="add-download-title">
      <div className="modal add-modal" onClick={(e) => e.stopPropagation()} ref={modalRef}>
        {/* Header */}
        <div className="add-modal-header">
          <h2 id="add-download-title">Add New Download</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="add-modal-body">
          {/* Type Selector */}
          <div className="type-selector" role="tablist" aria-label="Download type">
            <button
              className={`type-selector-btn${mode === 'link' ? ' active' : ''}`}
              role="tab"
              aria-selected={mode === 'link'}
              onClick={() => setMode('link')}
            >
              <span className="material-symbols-outlined">link</span>
              Link / Magnet
            </button>
            <button
              className={`type-selector-btn${mode === 'torrent' ? ' active' : ''}`}
              role="tab"
              aria-selected={mode === 'torrent'}
              onClick={() => setMode('torrent')}
            >
              <span className="material-symbols-outlined">description</span>
              Torrent File
            </button>
          </div>

          {/* Link Mode */}
          {mode === 'link' && (
            <div className="source-section">
              <label>Download Sources</label>
              <div className="source-input-wrapper">
                <textarea
                  className="source-textarea"
                  value={urls}
                  onChange={(e) => setUrls(e.target.value)}
                  placeholder="Paste URL or Magnet link here (one per line)..."
                  autoFocus
                />
                <button
                  className="source-paste-btn"
                  onClick={handlePaste}
                  title="Paste from Clipboard"
                  type="button"
                >
                  <span className="material-symbols-outlined">content_paste</span>
                </button>
              </div>
            </div>
          )}

          {/* Torrent Mode */}
          {mode === 'torrent' && (
            <div className="torrent-section">
              <label>Torrent File</label>
              <div className="torrent-file-picker">
                <input
                  type="text"
                  value={torrentPath}
                  placeholder="Select a .torrent file..."
                  readOnly
                />
                <button
                  className="torrent-browse-btn"
                  onClick={handleBrowseTorrent}
                  title="Browse for torrent file"
                  type="button"
                >
                  <span className="material-symbols-outlined">folder_open</span>
                </button>
              </div>
            </div>
          )}

          {/* Advanced Options */}
          <details className="advanced-accordion">
            <summary>
              <div className="advanced-summary-left">
                <span className="material-symbols-outlined">tune</span>
                <span>Advanced Options</span>
              </div>
              <span className="material-symbols-outlined advanced-chevron">expand_more</span>
            </summary>
            <div className="advanced-grid">
              {/* Save Directory (full width) */}
              <div className="advanced-field full-width">
                <label>Save Directory</label>
                <div className="save-dir-input">
                  <input
                    type="text"
                    value={saveDir}
                    readOnly
                    placeholder="Default download directory"
                  />
                  <button className="save-dir-browse" onClick={handleBrowseDir} type="button">
                    <span className="material-symbols-outlined">folder_open</span>
                  </button>
                </div>
              </div>

              {/* Rename File */}
              <div className="advanced-field">
                <label>Rename File</label>
                <input
                  type="text"
                  value={outFilename}
                  onChange={(e) => setOutFilename(e.target.value)}
                  placeholder="Original filename"
                />
              </div>

              {/* Priority */}
              <div className="advanced-field">
                <label>Priority</label>
                <div className="advanced-select-wrapper">
                  <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="normal">Normal</option>
                    <option value="low">Low</option>
                  </select>
                  <div className="select-chevron">
                    <span className="material-symbols-outlined">unfold_more</span>
                  </div>
                </div>
              </div>

              {/* Checksum (full width) */}
              <div className="advanced-field full-width">
                <label>Checksum (MD5/SHA)</label>
                <input
                  type="text"
                  className="mono-input"
                  value={checksum}
                  onChange={(e) => setChecksum(e.target.value)}
                  placeholder="Optional hash verification string..."
                />
              </div>

              {/* Speed Limit */}
              <div className="advanced-field">
                <label>Speed Limit (MB/s)</label>
                <input
                  type="number"
                  min="0"
                  value={speedLimit}
                  onChange={(e) => setSpeedLimit(e.target.value)}
                  placeholder="0 = unlimited"
                />
              </div>

              {/* Connections */}
              <div className="advanced-field">
                <label>Connections</label>
                <input
                  type="number"
                  min="1"
                  max="32"
                  value={connections}
                  onChange={(e) => setConnections(e.target.value)}
                  placeholder="Default"
                />
              </div>

              {/* Custom Headers (full width) */}
              <div className="advanced-field full-width">
                <label>Custom Headers</label>
                <textarea
                  value={customHeaders}
                  onChange={(e) => setCustomHeaders(e.target.value)}
                  placeholder={"Authorization: Bearer token\nCookie: session=abc"}
                  rows={2}
                />
              </div>

              {/* Sequential Toggle (torrent/magnet only) */}
              {showSequential && (
                <div className="advanced-field full-width">
                  <div className="sequential-toggle">
                    <span>Sequential download</span>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={sequential}
                        onChange={(e) => setSequential(e.target.checked)}
                      />
                      <div className="toggle-track" />
                      <div className="toggle-thumb" />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </details>

          {error && <div className="add-modal-error">{error}</div>}
        </div>

        {/* Footer */}
        <div className="add-modal-footer">
          <button className="cancel-btn" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="submit-btn" onClick={handleSubmit} disabled={isSubmitting} type="button">
            <span className="material-symbols-outlined">download</span>
            {isSubmitting ? 'Adding...' : 'Start Download'}
          </button>
        </div>
      </div>
    </div>
  );
}
