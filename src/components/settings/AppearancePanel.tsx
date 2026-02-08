import React from 'react';

interface AppearancePanelProps {
  theme: string;
  onThemeChange: (theme: 'dark' | 'light') => void;
}

export default function AppearancePanel({ theme, onThemeChange }: AppearancePanelProps) {
  return (
    <div className="settings-panel-inner">
      <section className="settings-section">
        <div className="settings-section-title">
          <span className="material-symbols-outlined">palette</span>
          <h3>Theme</h3>
        </div>
        <div className="settings-card">
          <div className="theme-cards">
            <button
              className={`theme-card${theme === 'dark' ? ' selected' : ''}`}
              onClick={() => onThemeChange('dark')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 24 }}>dark_mode</span>
              <span>Dark</span>
            </button>
            <button
              className={`theme-card${theme === 'light' ? ' selected' : ''}`}
              onClick={() => onThemeChange('light')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 24 }}>light_mode</span>
              <span>Light</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
