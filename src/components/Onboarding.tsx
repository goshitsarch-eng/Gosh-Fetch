import React, { useState, useEffect, useRef } from 'react';
import { FolderOpen } from 'lucide-react';
import { api } from '../lib/api';
import './Onboarding.css';

interface Props {
  onComplete: () => void;
}

export default function Onboarding({ onComplete }: Props) {
  const [downloadPath, setDownloadPath] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const path = await api.getDefaultDownloadPath();
        setDownloadPath(path);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;
    const focusable = modal.querySelectorAll<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])');
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

  async function handleBrowse() {
    const selected = await window.electronAPI.selectDirectory();
    if (selected) setDownloadPath(selected);
  }

  async function handleFinish() {
    if (downloadPath) {
      try {
        const settings = await api.dbGetSettings();
        settings.download_path = downloadPath;
        await api.dbSaveSettings(settings);
        await api.applySettingsToEngine(settings);
      } catch {}
    }
    localStorage.setItem('gosh-fetch-onboarding-done', '1');
    onComplete();
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="modal onboarding-modal" ref={modalRef}>
        <div className="onboarding-content">
          <img src="/logo.png" alt="Gosh-Fetch" className="onboarding-logo" />
          <h2 id="onboarding-title">Welcome to Gosh-Fetch</h2>
          <p className="onboarding-subtitle">A fast, modern download manager</p>

          <div className="onboarding-section">
            <label>Download Location</label>
            <div className="onboarding-path">
              <input type="text" value={downloadPath} readOnly />
              <button className="btn btn-secondary" onClick={handleBrowse}>
                <FolderOpen size={14} /> Browse
              </button>
            </div>
            <p className="onboarding-hint">You can change this later in Settings</p>
          </div>

          <div className="onboarding-tips">
            <p><strong>Quick tips:</strong></p>
            <ul>
              <li>Drag and drop URLs or .torrent files to start downloads</li>
              <li>Press <kbd>Ctrl+N</kbd> to add a new download</li>
              <li>Drag downloads to reorder priority</li>
            </ul>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary btn-lg" onClick={handleFinish}>Get Started</button>
        </div>
      </div>
    </div>
  );
}
