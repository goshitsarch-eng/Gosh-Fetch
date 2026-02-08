import React, { useEffect, useState } from 'react';
import { Shield, CheckCircle, Github, Zap, Lock, Download } from 'lucide-react';
import { api } from '../lib/api';
import './About.css';

export default function About() {
  const [appInfo, setAppInfo] = useState<any>(null);
  const [engineRunning, setEngineRunning] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const info = await api.getAppInfo();
        setAppInfo(info);
        const versionInfo = await api.getEngineVersion();
        setEngineRunning(versionInfo.running);
      } catch (e) {
        console.error('Failed to load app info:', e);
      }
    })();
  }, []);

  if (!appInfo) return <div className="page"><div className="loading">Loading...</div></div>;

  return (
    <div className="page">
      <header className="page-header"><h1>About</h1></header>
      <div className="about-content">
        {/* Hero */}
        <div className="app-hero">
          <div className="hero-icon-wrapper">
            <img src="/logo.png" alt="Gosh-Fetch" width={80} height={80} />
          </div>
          <h2>{appInfo.name}</h2>
          <span className="version-pill">v{appInfo.version}</span>
          <p className="app-description">{appInfo.description}</p>
        </div>

        {/* Engine */}
        <section className="about-card">
          <div className="about-card-header">
            <h3>Download Engine</h3>
            <span className={`status-indicator ${engineRunning ? 'connected' : 'disconnected'}`}>
              <span className="status-dot" />
              {engineRunning && <span className="status-ping" />}
              {engineRunning ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="engine-grid">
            <div className="engine-detail">
              <span className="detail-label">Engine</span>
              <span className="detail-value">{appInfo.engine.name}</span>
            </div>
            <div className="engine-detail">
              <span className="detail-label">Version</span>
              <span className="detail-value">{appInfo.engine.version}</span>
            </div>
            <div className="engine-detail">
              <span className="detail-label">License</span>
              <span className="detail-value">{appInfo.engine.license}</span>
            </div>
            <div className="engine-detail">
              <span className="detail-label">Source</span>
              <a href={appInfo.engine.url} target="_blank" rel="noopener noreferrer" className="detail-value detail-link">GitHub</a>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="about-card">
          <h3><Zap size={16} /> Features</h3>
          <div className="feature-chips">
            <span className="chip">HTTP/HTTPS</span>
            <span className="chip">BitTorrent</span>
            <span className="chip">Magnet URIs</span>
            <span className="chip">DHT</span>
            <span className="chip">PEX</span>
            <span className="chip">LPD</span>
            <span className="chip">Segmented Downloads</span>
            <span className="chip">Resume Support</span>
            <span className="chip">Native Rust</span>
          </div>
        </section>

        {/* Privacy */}
        <section className="about-card">
          <h3><Shield size={16} /> Privacy</h3>
          <p className="privacy-text">Gosh-Fetch respects your privacy. No telemetry, no analytics, no data collection. All data is stored locally on your device.</p>
          <div className="privacy-checks">
            <span className="privacy-check"><CheckCircle size={14} /> No telemetry or analytics</span>
            <span className="privacy-check"><CheckCircle size={14} /> No data collection</span>
            <span className="privacy-check"><CheckCircle size={14} /> No network activity unless initiated by you</span>
            <span className="privacy-check"><Lock size={14} /> Local Storage Only</span>
          </div>
        </section>

        {/* Footer */}
        <div className="about-footer">
          <p>Made with love and Rust</p>
          <a href={appInfo.repository} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
            <Github size={14} /> View on GitHub
          </a>
        </div>
      </div>
    </div>
  );
}
