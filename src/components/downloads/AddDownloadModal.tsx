import React, { useState, useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import { addDownload, addMagnet, addTorrentFile, addUrls, fetchDownloads } from '../../store/downloadSlice';
import type { AppDispatch } from '../../store/store';
import type { DownloadOptions } from '../../lib/types/download';
import './AddDownloadModal.css';

interface Props {
  onClose: () => void;
}

export default function AddDownloadModal({ onClose }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const [mode, setMode] = useState<'url' | 'torrent' | 'magnet'>('url');
  const [url, setUrl] = useState('');
  const [multiUrlMode, setMultiUrlMode] = useState(false);
  const [multiUrls, setMultiUrls] = useState('');
  const [magnetUri, setMagnetUri] = useState('');
  const [torrentPath, setTorrentPath] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Advanced options state
  const [saveDir, setSaveDir] = useState('');
  const [outFilename, setOutFilename] = useState('');
  const [speedLimit, setSpeedLimit] = useState('');
  const [connections, setConnections] = useState('');
  const [priority, setPriority] = useState('normal');
  const [customHeaders, setCustomHeaders] = useState('');
  const [checksum, setChecksum] = useState('');
  const [sequential, setSequential] = useState(false);

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

      if (mode === 'url') {
        if (multiUrlMode && multiUrls.trim()) {
          const urls = multiUrls.split('\n').map(u => u.trim()).filter(u => u.length > 0);
          if (urls.length === 0) {
            setError('Please provide at least one URL');
            setIsSubmitting(false);
            return;
          }
          await dispatch(addUrls({ urls, options })).unwrap();
        } else if (url.trim()) {
          if (url.trim().startsWith('magnet:')) {
            await dispatch(addMagnet({ magnetUri: url.trim(), options })).unwrap();
          } else {
            await dispatch(addDownload({ url: url.trim(), options })).unwrap();
          }
        } else {
          setError('Please provide a valid URL');
          setIsSubmitting(false);
          return;
        }
      } else if (mode === 'magnet' && magnetUri.trim()) {
        await dispatch(addMagnet({ magnetUri: magnetUri.trim(), options })).unwrap();
      } else if (mode === 'torrent' && torrentPath) {
        await dispatch(addTorrentFile({ filePath: torrentPath, options })).unwrap();
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

  async function handleBrowseDir() {
    const selected = await window.electronAPI.selectDirectory();
    if (selected) {
      setSaveDir(selected);
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
    else if (event.key === 'Enter' && !event.shiftKey && !multiUrlMode) handleSubmit();
  }

  return (
    <div className="modal-backdrop" onClick={onClose} onKeyDown={handleKeyDown} role="dialog" aria-modal="true" aria-labelledby="add-download-title">
      <div className="modal" onClick={(e) => e.stopPropagation()} ref={modalRef}>
        <div className="modal-header">
          <h3 className="modal-title" id="add-download-title">Add Download</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="modal-body">
          <div className="mode-tabs" role="tablist" aria-label="Download type">
            <button className={`mode-tab${mode === 'url' ? ' active' : ''}`} role="tab" aria-selected={mode === 'url'} onClick={() => setMode('url')}>URL</button>
            <button className={`mode-tab${mode === 'magnet' ? ' active' : ''}`} role="tab" aria-selected={mode === 'magnet'} onClick={() => setMode('magnet')}>Magnet</button>
            <button className={`mode-tab${mode === 'torrent' ? ' active' : ''}`} role="tab" aria-selected={mode === 'torrent'} onClick={() => setMode('torrent')}>Torrent File</button>
          </div>

          {mode === 'url' && (
            <div className="form-group">
              <div className="form-group-header">
                <label htmlFor="url">Download URL</label>
                <label className="toggle-label">
                  <input type="checkbox" checked={multiUrlMode} onChange={(e) => setMultiUrlMode(e.target.checked)} />
                  <span>Multiple URLs</span>
                </label>
              </div>
              {multiUrlMode ? (
                <textarea
                  id="urls"
                  value={multiUrls}
                  onChange={(e) => setMultiUrls(e.target.value)}
                  placeholder={"https://example.com/file1.zip\nhttps://example.com/file2.zip"}
                  rows={4}
                  autoFocus
                />
              ) : (
                <input id="url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/file.zip" autoFocus />
              )}
              <p className="help-text">Supports HTTP, HTTPS, and magnet links</p>
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

          {/* Advanced Options */}
          <button
            className="advanced-toggle"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Advanced Options
          </button>

          {showAdvanced && (
            <div className="advanced-options">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="save-dir">Save location</label>
                  <div className="file-input">
                    <input id="save-dir" type="text" value={saveDir} onChange={(e) => setSaveDir(e.target.value)} placeholder="Default download directory" />
                    <button className="btn btn-secondary" onClick={handleBrowseDir}>Browse</button>
                  </div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="out-filename">Output filename</label>
                  <input id="out-filename" type="text" value={outFilename} onChange={(e) => setOutFilename(e.target.value)} placeholder="Auto-detect from URL" />
                </div>
              </div>

              <div className="form-row form-row-2col">
                <div className="form-group">
                  <label htmlFor="speed-limit">Speed limit (MB/s)</label>
                  <input id="speed-limit" type="number" min="0" value={speedLimit} onChange={(e) => setSpeedLimit(e.target.value)} placeholder="0 = unlimited" />
                </div>
                <div className="form-group">
                  <label htmlFor="connections">Connections</label>
                  <input id="connections" type="number" min="1" max="32" value={connections} onChange={(e) => setConnections(e.target.value)} placeholder="Default" />
                </div>
              </div>

              <div className="form-row form-row-2col">
                <div className="form-group">
                  <label htmlFor="priority">Priority</label>
                  <select id="priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="checksum">Checksum</label>
                  <input id="checksum" type="text" value={checksum} onChange={(e) => setChecksum(e.target.value)} placeholder="sha256:... or md5:..." />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="headers">Custom headers</label>
                  <textarea id="headers" value={customHeaders} onChange={(e) => setCustomHeaders(e.target.value)} placeholder={"Authorization: Bearer token\nCookie: session=abc"} rows={2} />
                </div>
              </div>

              {(mode === 'torrent' || mode === 'magnet') && (
                <div className="form-row">
                  <label className="checkbox-label">
                    <input type="checkbox" checked={sequential} onChange={(e) => setSequential(e.target.checked)} />
                    <span>Sequential download</span>
                  </label>
                </div>
              )}
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
