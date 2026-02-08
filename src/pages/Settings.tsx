import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { selectTheme, setTheme } from '../store/themeSlice';
import { api } from '../lib/api';
import type { Settings as SettingsType } from '../lib/api';
import type { AppDispatch } from '../store/store';
import GeneralPanel from '../components/settings/GeneralPanel';
import NetworkPanel from '../components/settings/NetworkPanel';
import BitTorrentPanel from '../components/settings/BitTorrentPanel';
import AppearancePanel from '../components/settings/AppearancePanel';
import './Settings.css';

export interface SettingsFormState {
  // General
  downloadPath: string;
  enableNotifications: boolean;
  closeToTray: boolean;
  deleteFilesOnRemove: boolean;
  userAgent: string;
  // Network
  maxConcurrent: number;
  maxConnections: number;
  splitCount: number;
  downloadSpeedLimit: number;
  uploadSpeedLimit: number;
  downloadLimitEnabled: boolean;
  uploadLimitEnabled: boolean;
  proxyType: string;
  proxyHost: string;
  proxyPort: string;
  proxyAuthEnabled: boolean;
  proxyUsername: string;
  proxyPassword: string;
  connectTimeout: number;
  readTimeout: number;
  maxRetries: number;
  allocationMode: string;
  // BitTorrent
  btEnableDht: boolean;
  btEnablePex: boolean;
  btEnableLpd: boolean;
  btMaxPeers: number;
  btSeedRatio: number;
  autoUpdateTrackers: boolean;
}

type SettingsTab = 'general' | 'network' | 'bittorrent' | 'appearance' | 'about';

const defaultForm: SettingsFormState = {
  downloadPath: '',
  enableNotifications: true,
  closeToTray: true,
  deleteFilesOnRemove: false,
  userAgent: 'gosh-dl/0.1.0',
  maxConcurrent: 5,
  maxConnections: 16,
  splitCount: 16,
  downloadSpeedLimit: 10485760,
  uploadSpeedLimit: 10485760,
  downloadLimitEnabled: false,
  uploadLimitEnabled: false,
  proxyType: 'none',
  proxyHost: '',
  proxyPort: '',
  proxyAuthEnabled: false,
  proxyUsername: '',
  proxyPassword: '',
  connectTimeout: 30,
  readTimeout: 60,
  maxRetries: 3,
  allocationMode: 'sparse',
  btEnableDht: true,
  btEnablePex: true,
  btEnableLpd: true,
  btMaxPeers: 55,
  btSeedRatio: 1.0,
  autoUpdateTrackers: true,
};

function parseProxyUrl(url: string): Pick<SettingsFormState, 'proxyType' | 'proxyHost' | 'proxyPort' | 'proxyAuthEnabled' | 'proxyUsername' | 'proxyPassword'> {
  if (!url) return { proxyType: 'none', proxyHost: '', proxyPort: '', proxyAuthEnabled: false, proxyUsername: '', proxyPassword: '' };
  const match = url.match(/^(https?|socks[45]?):\/\/(?:([^:]*):([^@]*)@)?([^:/?#]+)(?::(\d+))?/);
  if (!match) return { proxyType: 'none', proxyHost: '', proxyPort: '', proxyAuthEnabled: false, proxyUsername: '', proxyPassword: '' };
  return {
    proxyType: match[1] === 'socks5' || match[1] === 'socks4' ? 'socks5' : match[1],
    proxyHost: match[4] || '',
    proxyPort: match[5] || '',
    proxyAuthEnabled: !!match[2],
    proxyUsername: match[2] ? decodeURIComponent(match[2]) : '',
    proxyPassword: match[3] ? decodeURIComponent(match[3]) : '',
  };
}

function composeProxyUrl(form: SettingsFormState): string {
  if (form.proxyType === 'none' || !form.proxyHost) return '';
  const auth = form.proxyAuthEnabled && form.proxyUsername
    ? `${encodeURIComponent(form.proxyUsername)}:${encodeURIComponent(form.proxyPassword)}@`
    : '';
  const port = form.proxyPort ? `:${form.proxyPort}` : '';
  return `${form.proxyType}://${auth}${form.proxyHost}${port}`;
}

const NAV_ITEMS: { tab: SettingsTab; icon: string; label: string }[] = [
  { tab: 'general', icon: 'settings', label: 'General' },
  { tab: 'network', icon: 'wifi_tethering', label: 'Network' },
  { tab: 'bittorrent', icon: 'cloud_download', label: 'BitTorrent' },
  { tab: 'appearance', icon: 'palette', label: 'Appearance' },
  { tab: 'about', icon: 'info', label: 'About' },
];

const PANEL_META: Record<Exclude<SettingsTab, 'about'>, { title: string; subtitle: string }> = {
  general: { title: 'General Settings', subtitle: 'Configure download behavior, notifications, and application preferences.' },
  network: { title: 'Network & Reliability', subtitle: 'Configure connection limits, bandwidth throttles, proxy servers, and disk allocation strategies.' },
  bittorrent: { title: 'BitTorrent Settings', subtitle: 'Configure protocol behavior, transfer limits, and tracker preferences.' },
  appearance: { title: 'Appearance', subtitle: 'Customize the look and feel of Gosh-Fetch.' },
};

export default function Settings() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const theme = useSelector(selectTheme);

  const initialTab = (searchParams.get('tab') as SettingsTab) || 'general';
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    NAV_ITEMS.some(n => n.tab === initialTab) ? initialTab : 'general'
  );

  const [form, setForm] = useState<SettingsFormState>(defaultForm);
  const [userAgentPresets, setUserAgentPresets] = useState<[string, string][]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const savedSnapshot = useRef<string>('');

  const isDirty = savedSnapshot.current ? JSON.stringify(form) !== savedSnapshot.current : false;

  const updateField = useCallback(<K extends keyof SettingsFormState>(key: K, value: SettingsFormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  function handleTabChange(tab: SettingsTab) {
    if (tab === 'about') {
      navigate('/about');
      return;
    }
    setActiveTab(tab);
    setSearchParams({ tab });
  }

  // Load settings on mount
  useEffect(() => {
    (async () => {
      try {
        const presets = await api.getUserAgentPresets();
        setUserAgentPresets(presets);

        const settings = await api.dbGetSettings();
        let downloadPath = settings.download_path;
        if (downloadPath === '~/Downloads') {
          downloadPath = await api.getDefaultDownloadPath();
        }

        const proxy = parseProxyUrl(settings.proxy_url);

        const loaded: SettingsFormState = {
          downloadPath,
          enableNotifications: settings.enable_notifications,
          closeToTray: settings.close_to_tray,
          deleteFilesOnRemove: settings.delete_files_on_remove,
          userAgent: settings.user_agent,
          maxConcurrent: settings.max_concurrent_downloads,
          maxConnections: settings.max_connections_per_server,
          splitCount: settings.split_count,
          downloadSpeedLimit: settings.download_speed_limit || 10485760,
          uploadSpeedLimit: settings.upload_speed_limit || 10485760,
          downloadLimitEnabled: settings.download_speed_limit > 0,
          uploadLimitEnabled: settings.upload_speed_limit > 0,
          ...proxy,
          connectTimeout: settings.connect_timeout,
          readTimeout: settings.read_timeout,
          maxRetries: settings.max_retries,
          allocationMode: settings.allocation_mode,
          btEnableDht: settings.bt_enable_dht,
          btEnablePex: settings.bt_enable_pex,
          btEnableLpd: settings.bt_enable_lpd,
          btMaxPeers: settings.bt_max_peers,
          btSeedRatio: settings.bt_seed_ratio,
          autoUpdateTrackers: settings.auto_update_trackers,
        };

        setForm(loaded);
        await api.setCloseToTray(settings.close_to_tray);

        setTimeout(() => {
          savedSnapshot.current = JSON.stringify(loaded);
        }, 100);
      } catch (e) {
        console.error('Failed to load settings:', e);
        try {
          const path = await api.getDefaultDownloadPath();
          setForm(prev => ({ ...prev, downloadPath: path }));
        } catch {}
      }
    })();
  }, []);

  async function handleSave() {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const settings: SettingsType = {
        download_path: form.downloadPath,
        max_concurrent_downloads: form.maxConcurrent,
        max_connections_per_server: form.maxConnections,
        split_count: form.splitCount,
        download_speed_limit: form.downloadLimitEnabled ? form.downloadSpeedLimit : 0,
        upload_speed_limit: form.uploadLimitEnabled ? form.uploadSpeedLimit : 0,
        user_agent: form.userAgent,
        enable_notifications: form.enableNotifications,
        close_to_tray: form.closeToTray,
        theme,
        bt_enable_dht: form.btEnableDht,
        bt_enable_pex: form.btEnablePex,
        bt_enable_lpd: form.btEnableLpd,
        bt_max_peers: form.btMaxPeers,
        bt_seed_ratio: form.btSeedRatio,
        auto_update_trackers: form.autoUpdateTrackers,
        delete_files_on_remove: form.deleteFilesOnRemove,
        proxy_url: composeProxyUrl(form),
        connect_timeout: form.connectTimeout,
        read_timeout: form.readTimeout,
        max_retries: form.maxRetries,
        allocation_mode: form.allocationMode,
      };

      await api.dbSaveSettings(settings);
      await api.setCloseToTray(form.closeToTray);
      await api.applySettingsToEngine(settings);
      setSaveMessage('Settings saved successfully');
      savedSnapshot.current = JSON.stringify(form);
    } catch (e) {
      setSaveMessage(`Failed to save: ${e}`);
    } finally {
      setIsSaving(false);
    }
  }

  function handleResetDefaults() {
    setForm(prev => ({
      ...defaultForm,
      downloadPath: prev.downloadPath, // keep current download path
    }));
  }

  async function handleBrowseDownloadPath() {
    const selected = await window.electronAPI.selectDirectory();
    if (selected) updateField('downloadPath', selected);
  }

  function handleThemeChange(newTheme: 'dark' | 'light') {
    dispatch(setTheme(newTheme));
  }

  async function handleUpdateTrackers() {
    try {
      const trackers = await api.updateTrackerList();
      setSaveMessage(`Updated ${trackers.length} trackers`);
    } catch (e) {
      setSaveMessage(`Failed to update trackers: ${e}`);
    }
  }

  const meta = activeTab !== 'about' ? PANEL_META[activeTab] : null;

  return (
    <div className="settings-layout">
      {/* Sidebar */}
      <nav className="settings-sidebar">
        <div className="settings-sidebar-header">
          <div className="settings-sidebar-brand">
            <div className="brand-icon">
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>bolt</span>
            </div>
            <div className="brand-info">
              <span className="brand-name">Gosh-Fetch</span>
              <span className="brand-version">Settings</span>
            </div>
          </div>
        </div>
        <div className="settings-sidebar-nav">
          {NAV_ITEMS.map(({ tab, icon, label }) => (
            <button
              key={tab}
              className={`settings-nav-item${activeTab === tab ? ' active' : ''}`}
              onClick={() => handleTabChange(tab)}
            >
              <span className="material-symbols-outlined">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Main content */}
      <div className="settings-main">
        {meta && (
          <header className="settings-panel-header">
            <div className="settings-panel-title">
              <h2>{meta.title}</h2>
              <p>{meta.subtitle}</p>
            </div>
            <div className="settings-panel-actions">
              {isDirty && <span className="save-indicator dirty">Unsaved changes</span>}
              {saveMessage && (
                <span className={`save-indicator${saveMessage.startsWith('Failed') ? ' error' : ' success'}`}>
                  {saveMessage}
                </span>
              )}
              <button className="btn btn-ghost" onClick={handleResetDefaults}>Reset Defaults</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>save</span>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </header>
        )}

        <div className="settings-panel-scroll">
          {activeTab === 'general' && (
            <GeneralPanel
              form={form}
              updateField={updateField}
              userAgentPresets={userAgentPresets}
              onBrowseDownloadPath={handleBrowseDownloadPath}
            />
          )}
          {activeTab === 'network' && (
            <NetworkPanel form={form} updateField={updateField} />
          )}
          {activeTab === 'bittorrent' && (
            <BitTorrentPanel
              form={form}
              updateField={updateField}
              onUpdateTrackers={handleUpdateTrackers}
              saveMessage={saveMessage}
            />
          )}
          {activeTab === 'appearance' && (
            <AppearancePanel theme={theme} onThemeChange={handleThemeChange} />
          )}
        </div>
      </div>
    </div>
  );
}
