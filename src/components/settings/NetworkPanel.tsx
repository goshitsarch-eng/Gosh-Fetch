import React, { useState } from 'react';
import type { SettingsFormState } from '../../pages/Settings';

interface NetworkPanelProps {
  form: SettingsFormState;
  updateField: <K extends keyof SettingsFormState>(key: K, value: SettingsFormState[K]) => void;
}

export default function NetworkPanel({ form, updateField }: NetworkPanelProps) {
  const [dlUnit, setDlUnit] = useState<'MB/s' | 'KB/s'>('MB/s');
  const [ulUnit, setUlUnit] = useState<'MB/s' | 'KB/s'>('KB/s');

  function bytesToDisplay(bytes: number, unit: 'MB/s' | 'KB/s'): string {
    if (bytes === 0) return '0';
    const divisor = unit === 'MB/s' ? 1048576 : 1024;
    return String(Math.round(bytes / divisor));
  }

  function displayToBytes(value: string, unit: 'MB/s' | 'KB/s'): number {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0) return 0;
    const multiplier = unit === 'MB/s' ? 1048576 : 1024;
    return num * multiplier;
  }

  return (
    <div className="settings-panel-inner">
      <p className="settings-panel-description">
        Configure connection limits, global bandwidth throttles, proxy servers, and disk allocation strategies to optimize your download performance.
      </p>

      {/* Throughput & Connections */}
      <section className="settings-section">
        <div className="settings-section-title">
          <span className="material-symbols-outlined">speed</span>
          <h3>Throughput &amp; Connections</h3>
        </div>
        <div className="settings-grid">
          {/* Concurrent Downloads - full width */}
          <div className="settings-grid-full">
            <div className="settings-card settings-card-padded">
              <div className="slider-with-value">
                <div className="slider-header">
                  <div>
                    <label>Concurrent Downloads</label>
                    <p className="slider-description" style={{ marginTop: 4 }}>Maximum number of active downloads allowed at once.</p>
                  </div>
                  <span className="slider-value-large">{form.maxConcurrent}</span>
                </div>
                <div className="slider-body">
                  <input
                    type="range" min={1} max={20} value={form.maxConcurrent}
                    onChange={(e) => updateField('maxConcurrent', Number(e.target.value))}
                  />
                </div>
                <div className="slider-scale"><span>1</span><span>20</span></div>
              </div>
            </div>
          </div>
          {/* Connections per Server */}
          <div className="settings-card settings-card-padded">
            <div className="input-group">
              <label>Connections per Server</label>
              <p className="input-description">Max parallel streams per host.</p>
              <div className="input-with-suffix">
                <input
                  type="number" min={1} max={64}
                  value={form.maxConnections}
                  onChange={(e) => updateField('maxConnections', Math.max(1, Math.min(64, Number(e.target.value))))}
                />
                <span className="input-suffix">CONN</span>
              </div>
            </div>
          </div>
          {/* Segments per Download */}
          <div className="settings-card settings-card-padded">
            <div className="input-group">
              <label>Segments per Download</label>
              <p className="input-description">Split files into multiple parts.</p>
              <div className="input-with-suffix">
                <input
                  type="number" min={1} max={128}
                  value={form.splitCount}
                  onChange={(e) => updateField('splitCount', Math.max(1, Math.min(128, Number(e.target.value))))}
                />
                <span className="input-suffix">PARTS</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Global Speed Limits */}
      <section className="settings-section">
        <div className="settings-section-title">
          <span className="material-symbols-outlined">swap_vert</span>
          <h3>Global Speed Limits</h3>
        </div>
        <div className="settings-grid">
          {/* Download Limit */}
          <div className="speed-limit-card">
            <div className="speed-limit-header">
              <div className="speed-limit-label">
                <div className="speed-limit-icon download">
                  <span className="material-symbols-outlined">download</span>
                </div>
                <div className="speed-limit-label-text">
                  <label>Download Limit</label>
                  <p>Cap incoming traffic speed.</p>
                </div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox" checked={form.downloadLimitEnabled}
                  onChange={(e) => updateField('downloadLimitEnabled', e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
            </div>
            <div className={`speed-limit-inputs${!form.downloadLimitEnabled ? ' disabled' : ''}`}>
              <input
                type="text"
                value={form.downloadLimitEnabled ? bytesToDisplay(form.downloadSpeedLimit, dlUnit) : '0'}
                onChange={(e) => updateField('downloadSpeedLimit', displayToBytes(e.target.value, dlUnit))}
                disabled={!form.downloadLimitEnabled}
                placeholder="0"
              />
              <select value={dlUnit} onChange={(e) => setDlUnit(e.target.value as 'MB/s' | 'KB/s')} disabled={!form.downloadLimitEnabled}>
                <option value="MB/s">MB/s</option>
                <option value="KB/s">KB/s</option>
              </select>
            </div>
          </div>
          {/* Upload Limit */}
          <div className="speed-limit-card">
            <div className="speed-limit-header">
              <div className="speed-limit-label">
                <div className="speed-limit-icon upload">
                  <span className="material-symbols-outlined">upload</span>
                </div>
                <div className="speed-limit-label-text">
                  <label>Upload Limit</label>
                  <p>Cap outgoing traffic speed.</p>
                </div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox" checked={form.uploadLimitEnabled}
                  onChange={(e) => updateField('uploadLimitEnabled', e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
            </div>
            <div className={`speed-limit-inputs${!form.uploadLimitEnabled ? ' disabled' : ''}`}>
              <input
                type="text"
                value={form.uploadLimitEnabled ? bytesToDisplay(form.uploadSpeedLimit, ulUnit) : '0'}
                onChange={(e) => updateField('uploadSpeedLimit', displayToBytes(e.target.value, ulUnit))}
                disabled={!form.uploadLimitEnabled}
                placeholder="0"
              />
              <select value={ulUnit} onChange={(e) => setUlUnit(e.target.value as 'MB/s' | 'KB/s')} disabled={!form.uploadLimitEnabled}>
                <option value="KB/s">KB/s</option>
                <option value="MB/s">MB/s</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Proxy Settings */}
      <section className="settings-section">
        <div className="settings-section-title">
          <span className="material-symbols-outlined">vpn_lock</span>
          <h3>Proxy Settings</h3>
        </div>
        <div className="settings-card settings-card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          {/* Proxy Type */}
          <div className="input-group settings-grid-full">
            <label>Proxy Type</label>
            <select
              value={form.proxyType}
              onChange={(e) => updateField('proxyType', e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="none">None (Direct Connection)</option>
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
              <option value="socks5">SOCKS5</option>
            </select>
          </div>

          {form.proxyType !== 'none' && (
            <>
              {/* Host & Port */}
              <div className="settings-grid">
                <div className="input-group">
                  <label>Host / IP</label>
                  <div className="input-with-icon">
                    <span className="material-symbols-outlined input-icon">dns</span>
                    <input
                      type="text" value={form.proxyHost}
                      onChange={(e) => updateField('proxyHost', e.target.value)}
                      placeholder="192.168.1.50"
                    />
                  </div>
                </div>
                <div className="input-group">
                  <label>Port</label>
                  <div className="input-with-icon">
                    <span className="material-symbols-outlined input-icon">tag</span>
                    <input
                      type="number" value={form.proxyPort}
                      onChange={(e) => updateField('proxyPort', e.target.value)}
                      placeholder="1080"
                    />
                  </div>
                </div>
              </div>

              {/* Authentication */}
              <div className="proxy-auth-card">
                <div className="proxy-auth-header">
                  <label>Authentication</label>
                  <label className="toggle-switch">
                    <input
                      type="checkbox" checked={form.proxyAuthEnabled}
                      onChange={(e) => updateField('proxyAuthEnabled', e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
                {form.proxyAuthEnabled && (
                  <div className="proxy-auth-fields">
                    <div>
                      <span className="field-label">Username</span>
                      <input
                        type="text" value={form.proxyUsername}
                        onChange={(e) => updateField('proxyUsername', e.target.value)}
                        placeholder="Optional"
                      />
                    </div>
                    <div>
                      <span className="field-label">Password</span>
                      <input
                        type="password" value={form.proxyPassword}
                        onChange={(e) => updateField('proxyPassword', e.target.value)}
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Reliability & Disk */}
      <section className="settings-section">
        <div className="settings-section-title">
          <span className="material-symbols-outlined">verified_user</span>
          <h3>Reliability &amp; Disk</h3>
        </div>
        <div className="settings-grid">
          {/* Auto Retry */}
          <div className="settings-card settings-card-padded">
            <div className="input-group">
              <label>Automatic Retry Attempts</label>
              <p className="input-description">Retries on connection failure.</p>
              <div className="stepper-control">
                <button
                  className="stepper-btn"
                  onClick={() => updateField('maxRetries', Math.max(0, form.maxRetries - 1))}
                >
                  <span className="material-symbols-outlined">remove</span>
                </button>
                <span className="stepper-value">{form.maxRetries}</span>
                <button
                  className="stepper-btn"
                  onClick={() => updateField('maxRetries', Math.min(20, form.maxRetries + 1))}
                >
                  <span className="material-symbols-outlined">add</span>
                </button>
              </div>
            </div>
          </div>
          {/* Allocation Mode */}
          <div className="settings-card settings-card-padded">
            <div className="input-group">
              <label>File Allocation Mode</label>
              <p className="input-description">How space is reserved on disk.</p>
              <div className="segmented-control">
                {['none', 'sparse', 'full'].map((mode) => (
                  <button
                    key={mode}
                    className={`segment${form.allocationMode === mode ? ' active' : ''}`}
                    onClick={() => updateField('allocationMode', mode)}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {/* Connect Timeout */}
          <div className="settings-card settings-card-padded">
            <div className="input-group">
              <label>Connect Timeout</label>
              <p className="input-description">Seconds to wait for connection.</p>
              <div className="range-control-inline">
                <input
                  type="range" min={5} max={120} value={form.connectTimeout}
                  onChange={(e) => updateField('connectTimeout', Number(e.target.value))}
                />
                <span className="range-value">{form.connectTimeout}s</span>
              </div>
            </div>
          </div>
          {/* Read Timeout */}
          <div className="settings-card settings-card-padded">
            <div className="input-group">
              <label>Read Timeout</label>
              <p className="input-description">Seconds to wait for data.</p>
              <div className="range-control-inline">
                <input
                  type="range" min={10} max={300} value={form.readTimeout}
                  onChange={(e) => updateField('readTimeout', Number(e.target.value))}
                />
                <span className="range-value">{form.readTimeout}s</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
