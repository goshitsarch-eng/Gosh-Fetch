import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import './About.css';

const TECH_STACK = [
  { name: 'React', icon: 'code', color: '#61DAFB' },
  { name: 'Electron', icon: 'desktop_windows', color: '#9FEAF9' },
  { name: 'Rust', icon: 'settings_suggest', color: '#DEA584' },
  { name: 'SQLite', icon: 'storage', color: '#3e8eb5' },
];

export default function About() {
  const [appInfo, setAppInfo] = useState<any>(null);

  useEffect(() => {
    api.getAppInfo().then(setAppInfo).catch(console.error);
  }, []);

  if (!appInfo) return <div className="page"><div className="about-loading">Loading...</div></div>;

  return (
    <div className="page">
      <div className="about-page">
        {/* Hero */}
        <div className="about-hero">
          <div className="about-icon-box">
            <div className="icon-hover-gradient" />
            <img src="/logo.png" alt="Gosh-Fetch" />
          </div>
          <h1 className="about-title">{appInfo.name}</h1>
          <span className="about-version-badge">v{appInfo.version} Stable</span>
        </div>

        {/* Tech Stack */}
        <div className="about-stack-section">
          <h3 className="about-stack-label">Tech Stack</h3>
          <div className="about-stack-grid">
            {TECH_STACK.map((tech) => (
              <div className="about-stack-card" key={tech.name}>
                <span className="material-symbols-outlined stack-icon" style={{ color: tech.color }}>
                  {tech.icon}
                </span>
                <span className="stack-name">{tech.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Links */}
        <div className="about-footer-links">
          <a className="about-footer-link" href={appInfo.repository} target="_blank" rel="noopener noreferrer">
            <span className="material-symbols-outlined">code</span>
            GitHub Repo
          </a>
          <a className="about-footer-link" href={`${appInfo.repository}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">
            <span className="material-symbols-outlined">gavel</span>
            AGPL-3.0
          </a>
          <a className="about-footer-link report" href={`${appInfo.repository}/issues/new`} target="_blank" rel="noopener noreferrer">
            <span className="material-symbols-outlined">bug_report</span>
            Report Issue
          </a>
        </div>
      </div>
    </div>
  );
}
