import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { SettingsFormState } from '../../pages/Settings';

interface BitTorrentPanelProps {
  form: SettingsFormState;
  updateField: <K extends keyof SettingsFormState>(key: K, value: SettingsFormState[K]) => void;
  onUpdateTrackers: () => void;
  saveMessage: string | null;
}

export default function BitTorrentPanel({ form, updateField, onUpdateTrackers, saveMessage }: BitTorrentPanelProps) {
  const [trackerText, setTrackerText] = useState('');
  const [isMagnetHandler, setIsMagnetHandler] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const trackers = await api.getTrackerList();
        setTrackerText(trackers.join('\n'));
      } catch {
        // tracker list may not be available
      }
      try {
        const isHandler = await window.electronAPI.isDefaultProtocolClient('magnet');
        setIsMagnetHandler(isHandler);
      } catch {
        // may not be available in dev
      }
    })();
  }, []);

  const lineCount = trackerText.split('\n').filter(l => l.trim()).length;

  async function handleMagnetToggle(enabled: boolean) {
    try {
      if (enabled) {
        await window.electronAPI.setDefaultProtocolClient('magnet');
      } else {
        await window.electronAPI.removeDefaultProtocolClient('magnet');
      }
      setIsMagnetHandler(enabled);
    } catch (e) {
      console.error('Failed to toggle magnet handler:', e);
    }
  }

  return (
    <div className="settings-panel-inner">
      {/* Protocol */}
      <section className="settings-section">
        <div className="settings-section-title">
          <span className="material-symbols-outlined">hub</span>
          <h3>Protocol</h3>
        </div>
        <div className="settings-card settings-card-divided">
          <div className="toggle-row">
            <div className="toggle-row-info">
              <span className="toggle-label">Enable DHT (Distributed Hash Table)</span>
              <span className="toggle-description">Allows finding peers without a tracker. Essential for magnet links.</span>
            </div>
            <label className="toggle-switch">
              <input type="checkbox" checked={form.btEnableDht} onChange={(e) => updateField('btEnableDht', e.target.checked)} />
              <span className="toggle-slider" />
            </label>
          </div>
          <div className="toggle-row">
            <div className="toggle-row-info">
              <span className="toggle-label">Enable PEX (Peer Exchange)</span>
              <span className="toggle-description">Exchanges peer lists with currently connected peers.</span>
            </div>
            <label className="toggle-switch">
              <input type="checkbox" checked={form.btEnablePex} onChange={(e) => updateField('btEnablePex', e.target.checked)} />
              <span className="toggle-slider" />
            </label>
          </div>
          <div className="toggle-row">
            <div className="toggle-row-info">
              <span className="toggle-label">Enable LPD (Local Peer Discovery)</span>
              <span className="toggle-description">Finds peers on your local network (LAN).</span>
            </div>
            <label className="toggle-switch">
              <input type="checkbox" checked={form.btEnableLpd} onChange={(e) => updateField('btEnableLpd', e.target.checked)} />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>
      </section>

      {/* Transfer */}
      <section className="settings-section">
        <div className="settings-section-title">
          <span className="material-symbols-outlined">swap_vert</span>
          <h3>Transfer</h3>
        </div>
        <div className="settings-card settings-card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          {/* Seed Ratio */}
          <div className="slider-with-value">
            <div className="slider-header">
              <label>Auto-Seed Ratio</label>
              <span className="slider-value-badge">{form.btSeedRatio.toFixed(2)}</span>
            </div>
            <div className="slider-body">
              <input
                type="range" min={0} max={5} step={0.1}
                value={form.btSeedRatio}
                onChange={(e) => updateField('btSeedRatio', Number(e.target.value))}
              />
            </div>
            <div className="slider-scale">
              <span>0.0</span><span>1.0</span><span>2.0</span><span>3.0</span><span>4.0</span><span>5.0</span>
            </div>
            <p className="slider-description">Stop seeding automatically when the upload/download ratio reaches this value.</p>
          </div>

          <div style={{ borderTop: '1px solid var(--border-primary)', margin: '0 calc(var(--space-lg) * -1)', padding: '0 var(--space-lg)' }} />

          {/* Max Peers */}
          <div className="input-group">
            <label>Max Peers per Torrent</label>
            <p className="input-description">Maximum number of peers to connect to per torrent.</p>
            <div className="input-with-suffix" style={{ maxWidth: 200 }}>
              <input
                type="number" min={1} max={500}
                value={form.btMaxPeers}
                onChange={(e) => updateField('btMaxPeers', Math.max(1, Math.min(500, Number(e.target.value))))}
              />
              <span className="input-suffix">PEERS</span>
            </div>
          </div>
        </div>
      </section>

      {/* Trackers */}
      <section className="settings-section">
        <div className="settings-section-title">
          <span className="material-symbols-outlined">radar</span>
          <h3>Trackers</h3>
        </div>
        <div className="settings-card settings-card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <div className="tracker-header">
            <div className="tracker-header-info">
              <span className="tracker-title">Custom Tracker List</span>
              <span className="tracker-description">These trackers will be automatically added to all new downloads.</span>
            </div>
            <button className="tracker-update-btn" onClick={onUpdateTrackers}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
              Update from Source
            </button>
          </div>
          <div className="tracker-textarea-wrapper">
            <textarea
              value={trackerText}
              onChange={(e) => setTrackerText(e.target.value)}
              placeholder={"udp://tracker.opentrackr.org:1337/announce\nudp://open.stealth.si:80/announce"}
              rows={6}
            />
            <span className="tracker-line-count">{lineCount} lines</span>
          </div>
          <p className="tracker-footer-note">Enter one URL per line. Supports UDP and HTTP trackers.</p>
          {saveMessage && saveMessage.includes('tracker') && (
            <p style={{ fontSize: 12, color: 'var(--color-success)' }}>{saveMessage}</p>
          )}
        </div>
      </section>

      {/* System Integration */}
      <section className="settings-section">
        <div className="settings-section-title">
          <span className="material-symbols-outlined">terminal</span>
          <h3>System Integration</h3>
        </div>
        <div className="settings-card settings-card-divided">
          <div className="integration-row">
            <div className="integration-row-left">
              <div className="integration-icon magnet">
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>link</span>
              </div>
              <div className="toggle-row-info">
                <span className="toggle-label">Handle magnet: links</span>
                <span className="toggle-description">Capture magnet links from web browsers.</span>
              </div>
            </div>
            <label className="toggle-switch">
              <input type="checkbox" checked={isMagnetHandler} onChange={(e) => handleMagnetToggle(e.target.checked)} />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}
