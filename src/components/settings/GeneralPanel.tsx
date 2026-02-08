import React from 'react';
import type { SettingsFormState } from '../../pages/Settings';

interface GeneralPanelProps {
  form: SettingsFormState;
  updateField: <K extends keyof SettingsFormState>(key: K, value: SettingsFormState[K]) => void;
  userAgentPresets: [string, string][];
  onBrowseDownloadPath: () => void;
}

export default function GeneralPanel({ form, updateField, userAgentPresets, onBrowseDownloadPath }: GeneralPanelProps) {
  return (
    <div className="settings-panel-inner">
      {/* Downloads */}
      <section className="settings-section">
        <div className="settings-section-title">
          <span className="material-symbols-outlined">folder</span>
          <h3>Downloads</h3>
        </div>
        <div className="settings-card settings-card-divided">
          <div className="general-setting-row">
            <div className="general-setting-info">
              <label>Download Location</label>
              <p>Where downloaded files will be saved</p>
            </div>
            <div className="file-control">
              <input type="text" value={form.downloadPath} readOnly />
              <button className="btn btn-secondary" onClick={onBrowseDownloadPath}>Browse</button>
            </div>
          </div>
          <div className="general-setting-row">
            <div className="general-setting-info">
              <label>Delete Files on Remove</label>
              <p>Delete downloaded files when removing a task</p>
            </div>
            <label className="toggle-switch">
              <input type="checkbox" checked={form.deleteFilesOnRemove} onChange={(e) => updateField('deleteFilesOnRemove', e.target.checked)} />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>
      </section>

      {/* Application */}
      <section className="settings-section">
        <div className="settings-section-title">
          <span className="material-symbols-outlined">settings</span>
          <h3>Application</h3>
        </div>
        <div className="settings-card settings-card-divided">
          <div className="general-setting-row">
            <div className="general-setting-info">
              <label>Notifications</label>
              <p>Show notification when downloads complete</p>
            </div>
            <label className="toggle-switch">
              <input type="checkbox" checked={form.enableNotifications} onChange={(e) => updateField('enableNotifications', e.target.checked)} />
              <span className="toggle-slider" />
            </label>
          </div>
          <div className="general-setting-row">
            <div className="general-setting-info">
              <label>Close to Tray</label>
              <p>Minimize to system tray instead of quitting</p>
            </div>
            <label className="toggle-switch">
              <input type="checkbox" checked={form.closeToTray} onChange={(e) => updateField('closeToTray', e.target.checked)} />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>
      </section>

      {/* User Agent */}
      <section className="settings-section">
        <div className="settings-section-title">
          <span className="material-symbols-outlined">person</span>
          <h3>User Agent</h3>
        </div>
        <div className="settings-card settings-card-padded">
          <div className="input-group">
            <label>HTTP Client Identification</label>
            <p className="input-description">Identify as a different client when downloading</p>
            <select
              className="user-agent-select"
              value={form.userAgent}
              onChange={(e) => updateField('userAgent', e.target.value)}
            >
              {userAgentPresets.map(([name, value]) => (
                <option key={value} value={value}>{name}</option>
              ))}
            </select>
          </div>
        </div>
      </section>
    </div>
  );
}
