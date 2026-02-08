import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { api } from '../lib/api';
import { setTheme, selectTheme } from '../store/themeSlice';
import type { Theme } from '../store/themeSlice';
import type { AppDispatch } from '../store/store';
import './Onboarding.css';

interface Props {
  onComplete: () => void;
}

export default function Onboarding({ onComplete }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const currentTheme = useSelector(selectTheme);

  const [step, setStep] = useState(1);
  const [downloadPath, setDownloadPath] = useState('');
  const [alwaysAskLocation, setAlwaysAskLocation] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<Theme>(currentTheme);
  const [torrentHandler, setTorrentHandler] = useState(true);
  const [magnetLinks, setMagnetLinks] = useState(true);
  const [runAtStartup, setRunAtStartup] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);

  // Load defaults on mount
  useEffect(() => {
    (async () => {
      try {
        setDownloadPath(await api.getDefaultDownloadPath());
      } catch {}
      try {
        setAppVersion(await api.getAppVersion());
      } catch {}
      // Check current protocol/login state
      try {
        const isMagnet = await window.electronAPI.isDefaultProtocolClient('magnet');
        setMagnetLinks(isMagnet);
        setTorrentHandler(isMagnet); // torrent handler often tied to magnet
      } catch {}
      try {
        const loginSettings = await window.electronAPI.getLoginItemSettings();
        setRunAtStartup(loginSettings.openAtLogin);
      } catch {}
    })();
  }, []);

  // Apply theme live when user selects
  useEffect(() => {
    dispatch(setTheme(selectedTheme));
  }, [selectedTheme, dispatch]);

  // Focus trap
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const focusable = overlay.querySelectorAll<HTMLElement>(
      'button, input, [tabindex]:not([tabindex="-1"])'
    );
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
    overlay.addEventListener('keydown', trapFocus);
    return () => overlay.removeEventListener('keydown', trapFocus);
  }, [step]);

  const goNext = useCallback(() => setStep(s => Math.min(s + 1, 3)), []);
  const goBack = useCallback(() => setStep(s => Math.max(s - 1, 1)), []);

  async function handleBrowse() {
    const selected = await window.electronAPI.selectDirectory();
    if (selected) setDownloadPath(selected);
  }

  async function handleImportSettings() {
    try {
      const imported = await window.electronAPI.importSettingsFile();
      if (imported) {
        await api.dbSaveSettings(imported);
        await api.applySettingsToEngine(imported);
        localStorage.setItem('gosh-fetch-onboarding-done', '1');
        onComplete();
      }
    } catch (err) {
      console.error('Failed to import settings:', err);
    }
  }

  async function handleFinish() {
    try {
      if (downloadPath) {
        const settings = await api.dbGetSettings();
        settings.download_path = downloadPath;
        settings.theme = selectedTheme;
        await api.dbSaveSettings(settings);
        await api.applySettingsToEngine(settings);
      }

      if (alwaysAskLocation) {
        localStorage.setItem('gosh-fetch-always-ask-location', '1');
      } else {
        localStorage.removeItem('gosh-fetch-always-ask-location');
      }

      // Apply desktop integration settings
      try {
        if (magnetLinks) {
          await window.electronAPI.setDefaultProtocolClient('magnet');
        } else {
          await window.electronAPI.removeDefaultProtocolClient('magnet');
        }
      } catch {}

      try {
        await window.electronAPI.setLoginItemSettings(runAtStartup);
      } catch {}
    } catch (err) {
      console.error('Failed to save onboarding settings:', err);
    }

    localStorage.setItem('gosh-fetch-onboarding-done', '1');
    onComplete();
  }

  return (
    <div className="onboarding-overlay" ref={overlayRef} role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      {step === 1 && (
        <WelcomeStep
          appVersion={appVersion}
          onNext={goNext}
          onImport={handleImportSettings}
        />
      )}

      {step > 1 && (
        <header className="onboarding-header">
          <div className="onboarding-logo">
            <span className="material-symbols-outlined">bolt</span>
            <span>Gosh-Fetch</span>
          </div>
          <div className="onboarding-step-info">
            <span className="onboarding-step-label">Step {step} of 3</span>
            <div className="onboarding-progress-track">
              <div
                className="onboarding-progress-fill"
                style={{ width: `${(step / 3) * 100}%` }}
              />
            </div>
          </div>
        </header>
      )}

      {step === 2 && (
        <SetupStep
          downloadPath={downloadPath}
          alwaysAskLocation={alwaysAskLocation}
          selectedTheme={selectedTheme}
          onBrowse={handleBrowse}
          onAlwaysAskChange={setAlwaysAskLocation}
          onThemeChange={setSelectedTheme}
        />
      )}

      {step === 3 && (
        <IntegrationStep
          torrentHandler={torrentHandler}
          magnetLinks={magnetLinks}
          runAtStartup={runAtStartup}
          onTorrentHandlerChange={setTorrentHandler}
          onMagnetLinksChange={setMagnetLinks}
          onRunAtStartupChange={setRunAtStartup}
        />
      )}

      {step > 1 && (
        <footer className="onboarding-footer">
          <button className="ob-btn-back" onClick={goBack}>
            <span className="material-symbols-outlined">arrow_back</span>
            Back
          </button>
          {step === 2 && (
            <button className="ob-btn-next" onClick={goNext}>
              Next Step
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          )}
          {step === 3 && (
            <button className="ob-btn-next" onClick={handleFinish}>
              Finish Setup
              <span className="material-symbols-outlined">check</span>
            </button>
          )}
        </footer>
      )}
    </div>
  );
}

/* ===========================
   Step 1: Welcome
   =========================== */

function WelcomeStep({
  appVersion,
  onNext,
  onImport,
}: {
  appVersion: string;
  onNext: () => void;
  onImport: () => void;
}) {
  return (
    <div className="welcome-step">
      <div className="welcome-bg" />

      <header className="welcome-header">
        <div className="welcome-version">
          <span className="material-symbols-outlined">cloud_download</span>
          <span>{appVersion ? `v${appVersion}` : ''}</span>
        </div>
        <div className="welcome-window-controls">
          <button tabIndex={-1} />
          <button tabIndex={-1} />
          <button tabIndex={-1} />
        </div>
      </header>

      <main className="welcome-content">
        <div className="welcome-hero">
          <div className="welcome-logo-ring">
            <div className="welcome-logo-icon">
              <span className="material-symbols-outlined">bolt</span>
            </div>
          </div>
          <div className="welcome-text">
            <h1 id="onboarding-title" className="welcome-title">
              Welcome to <span className="highlight">Gosh-Fetch</span>
            </h1>
            <p className="welcome-subtitle">
              A fast, transparent, and user-centric download manager.
            </p>
          </div>
        </div>

        <div className="welcome-features">
          <div className="welcome-feature-card">
            <div className="feature-icon blue">
              <span className="material-symbols-outlined">speed</span>
            </div>
            <div className="feature-text">
              <h3>Rust-Powered Speed</h3>
              <p>Optimized specifically for low memory usage and high throughput on all connections.</p>
            </div>
          </div>

          <div className="welcome-feature-card">
            <div className="feature-icon emerald">
              <span className="material-symbols-outlined">hub</span>
            </div>
            <div className="feature-text">
              <h3>Native BitTorrent</h3>
              <p>Handle magnet links directly within the app without needing third-party plugins.</p>
            </div>
          </div>

          <div className="welcome-feature-card">
            <div className="feature-icon purple">
              <span className="material-symbols-outlined">security</span>
            </div>
            <div className="feature-text">
              <h3>Privacy First</h3>
              <p>Zero telemetry. Your download history stays local and is never shared.</p>
            </div>
          </div>
        </div>

        <div className="welcome-cta-section">
          <button className="welcome-cta-btn" onClick={onNext}>
            <span>Get Started</span>
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
          <button className="welcome-import-link" onClick={onImport}>
            <span className="material-symbols-outlined">file_upload</span>
            Import settings from previous version
          </button>
        </div>
      </main>

      <div className="welcome-bottom-line" />
    </div>
  );
}

/* ===========================
   Step 2: Initial Setup
   =========================== */

function SetupStep({
  downloadPath,
  alwaysAskLocation,
  selectedTheme,
  onBrowse,
  onAlwaysAskChange,
  onThemeChange,
}: {
  downloadPath: string;
  alwaysAskLocation: boolean;
  selectedTheme: Theme;
  onBrowse: () => void;
  onAlwaysAskChange: (v: boolean) => void;
  onThemeChange: (t: Theme) => void;
}) {
  return (
    <div className="setup-step">
      <div className="setup-left-pane">
        <div>
          <div className="setup-left-icon">
            <span className="material-symbols-outlined">folder_managed</span>
          </div>
          <h1>Default Save Location</h1>
          <p className="setup-desc">
            Choose where your files will be saved by default. We recommend selecting a drive with plenty of free space for large downloads.
          </p>
        </div>
        <div className="setup-left-hint">
          <span className="material-symbols-outlined">info</span>
          <p>You can change this later in settings.</p>
        </div>
      </div>

      <div className="setup-right-pane">
        <div className="setup-right-inner">
          {/* Storage Configuration */}
          <div className="setup-section">
            <h2>Storage Configuration</h2>
            <div className="setup-path-label">Downloads Folder</div>
            <div className="setup-path-row">
              <input
                type="text"
                className="setup-path-input"
                value={downloadPath}
                readOnly
              />
              <button className="setup-browse-btn" onClick={onBrowse}>
                <span className="material-symbols-outlined">folder_open</span>
                Browse
              </button>
            </div>

            <div className="ob-toggle-card">
              <div className="ob-toggle-info">
                <span className="title">Always ask for save location</span>
                <span className="desc">Prompt for destination before every download starts</span>
              </div>
              <label className="ob-toggle">
                <input
                  type="checkbox"
                  checked={alwaysAskLocation}
                  onChange={(e) => onAlwaysAskChange(e.target.checked)}
                />
                <span className="ob-toggle-track" />
                <span className="ob-toggle-thumb" />
              </label>
            </div>
          </div>

          <div className="setup-divider" />

          {/* Theme Preference */}
          <div className="setup-section">
            <h2>Theme Preference</h2>
            <div className="theme-select-grid">
              <button
                className={`theme-select-card${selectedTheme === 'system' ? ' selected' : ''}`}
                onClick={() => onThemeChange('system')}
              >
                <div className="theme-select-card-icon system">
                  <span className="material-symbols-outlined">settings_brightness</span>
                </div>
                <span>System</span>
                <div className="theme-check">
                  <span className="material-symbols-outlined">check_circle</span>
                </div>
              </button>

              <button
                className={`theme-select-card${selectedTheme === 'light' ? ' selected' : ''}`}
                onClick={() => onThemeChange('light')}
              >
                <div className="theme-select-card-icon light">
                  <span className="material-symbols-outlined">light_mode</span>
                </div>
                <span>Light</span>
                <div className="theme-check">
                  <span className="material-symbols-outlined">check_circle</span>
                </div>
              </button>

              <button
                className={`theme-select-card${selectedTheme === 'dark' ? ' selected' : ''}`}
                onClick={() => onThemeChange('dark')}
              >
                <div className="theme-select-card-icon dark">
                  <span className="material-symbols-outlined">dark_mode</span>
                </div>
                <span>Dark</span>
                <div className="theme-check">
                  <span className="material-symbols-outlined">check_circle</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===========================
   Step 3: Desktop Integration
   =========================== */

function IntegrationStep({
  torrentHandler,
  magnetLinks,
  runAtStartup,
  onTorrentHandlerChange,
  onMagnetLinksChange,
  onRunAtStartupChange,
}: {
  torrentHandler: boolean;
  magnetLinks: boolean;
  runAtStartup: boolean;
  onTorrentHandlerChange: (v: boolean) => void;
  onMagnetLinksChange: (v: boolean) => void;
  onRunAtStartupChange: (v: boolean) => void;
}) {
  return (
    <div className="integration-step">
      <div className="integration-inner">
        {/* Step progress */}
        <div className="step-progress">
          <div className="step-progress-header">
            <span className="step-count">Step 3 of 3</span>
            <span className="step-active">Integration</span>
          </div>
          <div className="step-progress-bars">
            <div className="bar completed" />
            <div className="bar completed" />
            <div className="bar active" />
          </div>
          <div className="step-progress-labels">
            <span>Appearance</span>
            <span>Network</span>
            <span className="active">Integration</span>
          </div>
        </div>

        {/* Heading */}
        <div className="integration-heading">
          <h1>Desktop Integration</h1>
          <p>
            Configure how Gosh-Fetch interacts with your OS. You can change these settings later in preferences.
          </p>
        </div>

        {/* Toggle cards */}
        <div className="integration-toggles">
          <label className="integration-toggle-card">
            <div className="integration-toggle-left">
              <div className="integration-toggle-icon">
                <span className="material-symbols-outlined">folder_zip</span>
              </div>
              <div className="integration-toggle-text">
                <h3>Default Torrent Handler</h3>
                <p>Automatically open .torrent files with Gosh-Fetch</p>
              </div>
            </div>
            <div className="ob-toggle">
              <input
                type="checkbox"
                checked={torrentHandler}
                onChange={(e) => onTorrentHandlerChange(e.target.checked)}
              />
              <span className="ob-toggle-track" />
              <span className="ob-toggle-thumb" />
            </div>
          </label>

          <label className="integration-toggle-card">
            <div className="integration-toggle-left">
              <div className="integration-toggle-icon">
                <span className="material-symbols-outlined">link</span>
              </div>
              <div className="integration-toggle-text">
                <h3>Capture Magnet Links</h3>
                <p>Handle magnet: protocols from your web browser</p>
              </div>
            </div>
            <div className="ob-toggle">
              <input
                type="checkbox"
                checked={magnetLinks}
                onChange={(e) => onMagnetLinksChange(e.target.checked)}
              />
              <span className="ob-toggle-track" />
              <span className="ob-toggle-thumb" />
            </div>
          </label>

          <label className="integration-toggle-card">
            <div className="integration-toggle-left">
              <div className="integration-toggle-icon">
                <span className="material-symbols-outlined">rocket_launch</span>
              </div>
              <div className="integration-toggle-text">
                <h3>Run at Startup</h3>
                <p>Launch Gosh-Fetch automatically when you log in</p>
              </div>
            </div>
            <div className="ob-toggle">
              <input
                type="checkbox"
                checked={runAtStartup}
                onChange={(e) => onRunAtStartupChange(e.target.checked)}
              />
              <span className="ob-toggle-track" />
              <span className="ob-toggle-thumb" />
            </div>
          </label>
        </div>

        {/* Privacy info box */}
        <div className="privacy-box">
          <div className="privacy-box-inner">
            <div className="privacy-box-content">
              <div className="privacy-badge">
                <span className="material-symbols-outlined">security</span>
                <span>Privacy First</span>
              </div>
              <h3>Zero Telemetry Promise</h3>
              <p>
                Gosh-Fetch runs 100% locally on your machine. We do not collect usage statistics, file metadata, or IP addresses. Your data never leaves your device.
              </p>
            </div>
            <div className="privacy-graphic">
              <span className="material-symbols-outlined">shield_lock</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
