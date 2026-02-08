import React, { useEffect, useState } from 'react';
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
        <div className="app-hero">
          <div className="app-icon">{'\u2B07'}</div>
          <h2>{appInfo.name}</h2>
          <p className="app-version">Version {appInfo.version}</p>
          <p className="app-description">{appInfo.description}</p>
        </div>

        <section className="about-section">
          <h3>License</h3>
          <div className="card">
            <p>{appInfo.name} is free and open source software, licensed under <strong>{appInfo.license}</strong>.</p>
            <a href={appInfo.repository} target="_blank" rel="noopener noreferrer">View source on GitHub</a>
          </div>
        </section>

        <section className="about-section">
          <h3>Download Engine</h3>
          <div className="card">
            <div className="attribution-item">
              <div className="attribution-header">
                <strong>{appInfo.engine.name}</strong>
                <span className="version-badge">v{appInfo.engine.version}</span>
                <span className={`status-badge ${engineRunning ? 'running' : 'stopped'}`}>
                  {engineRunning ? 'Running' : 'Stopped'}
                </span>
              </div>
              <p>{appInfo.engine.description}</p>
              <p className="attribution-license">License: {appInfo.engine.license}</p>
              <a href={appInfo.engine.url} target="_blank" rel="noopener noreferrer">{appInfo.engine.url}</a>
            </div>
          </div>
        </section>

        <section className="about-section">
          <h3>Features</h3>
          <div className="card">
            <ul className="feature-list">
              <li>HTTP/HTTPS segmented downloads with resume support</li>
              <li>BitTorrent downloads from .torrent files</li>
              <li>Magnet URI support</li>
              <li>DHT, PEX, and LPD peer discovery</li>
              <li>Native Rust engine - no external dependencies</li>
            </ul>
          </div>
        </section>

        <section className="about-section">
          <h3>Privacy</h3>
          <div className="card">
            <ul className="privacy-list">
              <li>No telemetry or analytics</li>
              <li>No data collection</li>
              <li>No network activity unless explicitly initiated by you</li>
              <li>All data stored locally on your device</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
