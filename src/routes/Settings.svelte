<script module lang="ts">
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

  export type SettingsTab = 'general' | 'network' | 'bittorrent' | 'appearance' | 'about';
</script>

<script lang="ts">
  import { push, router } from 'svelte-spa-router';
  import { theme } from '../lib/stores/theme.svelte';
  import { api } from '../lib/api/commands';
  import type { Settings as SettingsType } from '../lib/types/settings';
  import { selectDirectory } from '../lib/api/system';
  import GeneralPanel from '../lib/components/settings/GeneralPanel.svelte';
  import NetworkPanel from '../lib/components/settings/NetworkPanel.svelte';
  import BitTorrentPanel from '../lib/components/settings/BitTorrentPanel.svelte';
  import AppearancePanel from '../lib/components/settings/AppearancePanel.svelte';
  import About from './About.svelte';
  import './Settings.css';

  const defaultForm: SettingsFormState = {
    downloadPath: '',
    enableNotifications: true,
    closeToTray: true,
    deleteFilesOnRemove: false,
    userAgent: 'gosh-dl/0.3.2',
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

  function composeProxyUrl(f: SettingsFormState): string {
    if (f.proxyType === 'none' || !f.proxyHost) return '';
    const auth = f.proxyAuthEnabled && f.proxyUsername
      ? `${encodeURIComponent(f.proxyUsername)}:${encodeURIComponent(f.proxyPassword)}@`
      : '';
    const port = f.proxyPort ? `:${f.proxyPort}` : '';
    return `${f.proxyType}://${auth}${f.proxyHost}${port}`;
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

  const initialTab = (new URLSearchParams(router.querystring ?? '').get('tab') as SettingsTab) || 'general';
  let activeTab = $state<SettingsTab>(
    NAV_ITEMS.some(n => n.tab === initialTab) ? initialTab : 'general'
  );

  let form = $state<SettingsFormState>({ ...defaultForm });
  let userAgentPresets = $state<[string, string][]>([]);
  let isSaving = $state(false);
  let saveMessage = $state<string | null>(null);
  let showResetConfirm = $state(false);
  let savedSnapshot = $state('');

  let isDirty = $derived(savedSnapshot ? JSON.stringify($state.snapshot(form)) !== savedSnapshot : false);

  function updateField<K extends keyof SettingsFormState>(key: K, value: SettingsFormState[K]) {
    form[key] = value;
  }

  function handleTabChange(tab: SettingsTab) {
    activeTab = tab;
    push(`/settings?tab=${tab}`);
  }

  // Load settings on mount
  $effect(() => {
    (async () => {
      try {
        const presets = await api.getUserAgentPresets();
        userAgentPresets = presets;

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

        form = loaded;
        await api.setCloseToTray(settings.close_to_tray);

        setTimeout(() => {
          savedSnapshot = JSON.stringify(loaded);
        }, 100);
      } catch (e) {
        console.error('Failed to load settings:', e);
        try {
          const path = await api.getDefaultDownloadPath();
          form.downloadPath = path;
        } catch {}
      }
    })();
  });

  async function handleSave() {
    isSaving = true;
    saveMessage = null;

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
        theme: theme.theme,
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
      saveMessage = 'Settings saved successfully';
      savedSnapshot = JSON.stringify($state.snapshot(form));
    } catch (e) {
      saveMessage = `Failed to save: ${e}`;
    } finally {
      isSaving = false;
    }
  }

  function handleResetDefaults() {
    form = {
      ...defaultForm,
      downloadPath: form.downloadPath, // keep current download path
    };
  }

  async function handleBrowseDownloadPath() {
    const selected = await selectDirectory();
    if (selected) updateField('downloadPath', selected);
  }

  function handleThemeChange(newTheme: 'dark' | 'light') {
    theme.setTheme(newTheme);
  }

  async function handleUpdateTrackers() {
    try {
      const trackers = await api.updateTrackerList();
      saveMessage = `Updated ${trackers.length} trackers`;
    } catch (e) {
      saveMessage = `Failed to update trackers: ${e}`;
    }
  }

  let meta = $derived(activeTab !== 'about' ? PANEL_META[activeTab] : null);
</script>

<div class="settings-layout">
  <!-- Sidebar -->
  <nav class="settings-sidebar">
    <div class="settings-sidebar-header">
      <div class="settings-sidebar-brand">
        <div class="brand-icon">
          <span class="material-symbols-outlined" style="font-size: 20px">bolt</span>
        </div>
        <div class="brand-info">
          <span class="brand-name">Gosh-Fetch</span>
          <span class="brand-version">Settings</span>
        </div>
      </div>
    </div>
    <div class="settings-sidebar-nav">
      {#each NAV_ITEMS as { tab, icon, label } (tab)}
        <button
          class="settings-nav-item{activeTab === tab ? ' active' : ''}"
          onclick={() => handleTabChange(tab)}
        >
          <span class="material-symbols-outlined">{icon}</span>
          <span>{label}</span>
        </button>
      {/each}
    </div>
  </nav>

  <!-- Main content -->
  <div class="settings-main">
    {#if meta}
      <header class="settings-panel-header">
        <div class="settings-panel-title">
          <h2>{meta.title}</h2>
          <p>{meta.subtitle}</p>
        </div>
        <div class="settings-panel-actions">
          {#if isDirty}
            <span class="save-indicator dirty">Unsaved changes</span>
          {/if}
          {#if saveMessage}
            <span class="save-indicator{saveMessage.startsWith('Failed') ? ' error' : ' success'}">
              {saveMessage}
            </span>
          {/if}
          <button class="btn btn-ghost" onclick={() => (showResetConfirm = true)}>Reset Defaults</button>
          <button class="btn btn-primary" onclick={handleSave} disabled={isSaving}>
            <span class="material-symbols-outlined" style="font-size: 16px">save</span>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </header>
    {/if}

    <div class="settings-panel-scroll">
      {#if activeTab === 'general'}
        <GeneralPanel
          {form}
          {updateField}
          {userAgentPresets}
          onBrowseDownloadPath={handleBrowseDownloadPath}
        />
      {/if}
      {#if activeTab === 'network'}
        <NetworkPanel {form} {updateField} />
      {/if}
      {#if activeTab === 'bittorrent'}
        <BitTorrentPanel
          {form}
          {updateField}
          onUpdateTrackers={handleUpdateTrackers}
          {saveMessage}
        />
      {/if}
      {#if activeTab === 'appearance'}
        <AppearancePanel theme={theme.theme} onThemeChange={handleThemeChange} />
      {/if}
      {#if activeTab === 'about'}
        <About />
      {/if}
    </div>
  </div>
  {#if showResetConfirm}
    <div class="modal-backdrop" onclick={() => (showResetConfirm = false)}>
      <div class="modal reset-confirm-modal" onclick={(e) => e.stopPropagation()}>
        <div class="reset-confirm-icon">
          <span class="material-symbols-outlined">warning</span>
        </div>
        <h3>Reset all settings?</h3>
        <p>
          This will revert all network, BitTorrent, and appearance
          preferences to their original values. Your download history
          and files will not be affected.
        </p>
        <div class="reset-confirm-actions">
          <button class="btn btn-ghost" onclick={() => (showResetConfirm = false)}>
            Cancel
          </button>
          <button class="btn btn-primary" onclick={() => { handleResetDefaults(); showResetConfirm = false; }}>
            <span class="material-symbols-outlined" style="font-size: 16px">restart_alt</span>
            Reset Everything
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
