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
</script>

<script lang="ts">
  import { router } from 'svelte-spa-router';
  import { getVersion } from '@tauri-apps/api/app';
  import { theme, ACCENTS, type Theme } from '../lib/stores/theme.svelte';
  import { updater } from '../lib/stores/updater.svelte';
  import { api } from '../lib/api/commands';
  import type { Settings as SettingsType } from '../lib/types/settings';
  import { selectDirectory } from '../lib/api/system';
  import Icon from '../lib/components/ui/Icon.svelte';
  import Segmented from '../lib/components/ui/Segmented.svelte';
  import Switch from '../lib/components/ui/Switch.svelte';
  import NetworkSection from '../lib/components/settings/NetworkSection.svelte';
  import BitTorrentSection from '../lib/components/settings/BitTorrentSection.svelte';
  import IntegrationSection from '../lib/components/settings/IntegrationSection.svelte';
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

  let form = $state<SettingsFormState>({ ...defaultForm });
  let userAgentPresets = $state<[string, string][]>([]);
  let isSaving = $state(false);
  let saveMessage = $state<string | null>(null);
  let showResetConfirm = $state(false);
  let savedSnapshot = $state('');
  let appVersion = $state('');
  let appInfo = $state<{ repository?: string; engine?: { name?: string; version?: string } } | null>(null);
  let updateChecked = $state(false);

  let isDirty = $derived(savedSnapshot ? JSON.stringify($state.snapshot(form)) !== savedSnapshot : false);

  function updateField<K extends keyof SettingsFormState>(key: K, value: SettingsFormState[K]) {
    form[key] = value;
  }

  // ?tab= deep links (e.g. from the tray popup) scroll to the matching section
  $effect(() => {
    const tab = new URLSearchParams(router.querystring ?? '').get('tab');
    if (!tab) return;
    const target = document.getElementById(`settings-${tab}`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // Load settings on mount
  $effect(() => {
    (async () => {
      try {
        appVersion = await getVersion();
      } catch {
        /* not running under Tauri */
      }
      try {
        appInfo = await api.getAppInfo();
      } catch {
        /* ignore */
      }
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
      saveMessage = 'Settings saved';
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

  async function handleUpdateTrackers() {
    try {
      const trackers = await api.updateTrackerList();
      saveMessage = `Updated ${trackers.length} trackers`;
    } catch (e) {
      saveMessage = `Failed to update trackers: ${e}`;
    }
  }

  async function handleCheckUpdates() {
    updateChecked = false;
    await updater.checkForUpdates();
    updateChecked = true;
  }
</script>

<div class="content page-fade">
  <div class="content-inner" style="max-width: 760px">
    <!-- Save bar -->
    <div class="settings-savebar">
      <span class="tag-label">Engine configuration</span>
      <div class="toolbar-spacer"></div>
      {#if isDirty}
        <span class="save-flag dirty">● Unsaved changes</span>
      {/if}
      {#if saveMessage}
        <span class="save-flag {saveMessage.startsWith('Failed') ? 'err' : 'ok'}">{saveMessage}</span>
      {/if}
      <button class="btn btn-ghost" onclick={() => (showResetConfirm = true)}>Reset</button>
      <button class="btn btn-primary" onclick={handleSave} disabled={isSaving}>
        <Icon name="save" size={16} />
        {isSaving ? 'Saving…' : 'Save'}
      </button>
    </div>

    <!-- Appearance -->
    <div class="section-h" id="settings-appearance">Appearance</div>
    <div class="card card-pad">
      <div class="set-row">
        <div class="set-info">
          <div class="t">Theme</div>
          <div class="d">Paper (light), Console (dark), or follow the system</div>
        </div>
        <div class="set-control">
          <Segmented
            value={theme.theme}
            options={[
              { v: 'light', l: 'Paper' },
              { v: 'dark', l: 'Console' },
              { v: 'system', l: 'Auto' },
            ]}
            onChange={(v) => theme.setTheme(v as Theme)}
            label="Theme"
          />
        </div>
      </div>
      <div class="set-row">
        <div class="set-info">
          <div class="t">Signal color</div>
          <div class="d">Active / download highlight color</div>
        </div>
        <div class="set-control accent-swatches">
          {#each ACCENTS as a (a.v)}
            <button
              class="accent-swatch"
              class:on={theme.accent === a.v}
              style="background: hsl({a.v} 100% 50%)"
              title={a.name}
              aria-label={a.name}
              aria-pressed={theme.accent === a.v}
              onclick={() => theme.setAccent(a.v)}
            ></button>
          {/each}
        </div>
      </div>
    </div>

    <!-- Storage -->
    <div class="section-h" id="settings-general">Storage</div>
    <div class="card card-pad">
      <div class="set-row">
        <div class="set-info">
          <div class="t">Download location</div>
          <div class="d">Where downloaded files are saved</div>
        </div>
        <div class="set-control">
          <div class="input-group" style="width: 280px">
            <input class="input mono" type="text" value={form.downloadPath} readonly aria-label="Download location" />
            <button class="addon addon-btn" onclick={handleBrowseDownloadPath} title="Browse">
              <Icon name="folder" size={17} />
            </button>
          </div>
        </div>
      </div>
      <div class="set-row">
        <div class="set-info">
          <div class="t">Delete files on remove</div>
          <div class="d">Also delete downloaded files when removing a task</div>
        </div>
        <Switch on={form.deleteFilesOnRemove} onToggle={() => updateField('deleteFilesOnRemove', !form.deleteFilesOnRemove)} label="Delete files on remove" />
      </div>
    </div>

    <!-- Network & Reliability -->
    <div class="section-h" id="settings-network">Network &amp; Reliability</div>
    <NetworkSection {form} {updateField} {userAgentPresets} />

    <!-- BitTorrent -->
    <div class="section-h" id="settings-bittorrent">BitTorrent</div>
    <BitTorrentSection {form} {updateField} onUpdateTrackers={handleUpdateTrackers} {saveMessage} />

    <!-- Desktop Integration -->
    <div class="section-h" id="settings-integration">Desktop Integration</div>
    <IntegrationSection {form} {updateField} />

    <!-- About -->
    <div class="section-h" id="settings-about">About</div>
    <div class="card card-pad about-card">
      <div class="brand-mark about-mark"><Icon name="downloading" fill size={28} /></div>
      <div class="about-info">
        <div class="about-name">
          Gosh-Fetch
          {#if appVersion}<span class="about-version">v{appVersion}</span>{/if}
        </div>
        <div class="about-desc">
          Cross-platform download manager · powered by the
          {appInfo?.engine?.name ?? 'gosh-dl'}
          {#if appInfo?.engine?.version}v{appInfo.engine.version}{/if} Rust engine
        </div>
        {#if appInfo?.repository}
          <div class="about-links">
            <a href={appInfo.repository} target="_blank" rel="noopener noreferrer">
              <Icon name="code" size={14} /> Source
            </a>
            <a href="{appInfo.repository}/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">
              <Icon name="gavel" size={14} /> AGPL-3.0
            </a>
            <a href="{appInfo.repository}/issues/new" target="_blank" rel="noopener noreferrer">
              <Icon name="bug_report" size={14} /> Report issue
            </a>
          </div>
        {/if}
        {#if updateChecked && updater.phase === 'idle'}
          <div class="about-update-msg">You're on the latest version.</div>
        {/if}
      </div>
      <button class="btn btn-ghost" onclick={handleCheckUpdates}>
        <Icon name="update" size={18} /> Check for updates
      </button>
    </div>
  </div>

  {#if showResetConfirm}
    <div
      class="scrim"
      onclick={(e) => e.target === e.currentTarget && (showResetConfirm = false)}
      onkeydown={(e) => e.key === 'Escape' && (showResetConfirm = false)}
      role="presentation"
    >
      <div class="modal" style="max-width: 440px" role="dialog" aria-modal="true" aria-labelledby="reset-confirm-title">
        <div class="modal-head">
          <div class="dl-icon"><Icon name="warning" size={19} /></div>
          <div style="flex: 1">
            <div class="ttl" id="reset-confirm-title">Reset all settings?</div>
          </div>
          <button class="icon-btn" onclick={() => (showResetConfirm = false)} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div class="modal-body">
          <p style="margin: 0; font-size: 13px; line-height: 1.55">
            This reverts all network, BitTorrent, and appearance preferences to
            their original values. Your download history and files are not affected.
          </p>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" onclick={() => (showResetConfirm = false)}>Cancel</button>
          <div class="sp"></div>
          <button class="btn btn-primary" onclick={() => { handleResetDefaults(); showResetConfirm = false; }}>
            <Icon name="restart_alt" size={16} /> Reset everything
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
