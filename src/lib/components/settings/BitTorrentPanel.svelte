<script lang="ts">
  import { api } from '../../api/commands';
  import { setMagnetHandler, isMagnetHandler as checkMagnetHandler } from '../../api/system';
  import type { SettingsFormState } from '../../../routes/Settings.svelte';

  let {
    form,
    updateField,
    onUpdateTrackers,
    saveMessage,
  }: {
    form: SettingsFormState;
    updateField: <K extends keyof SettingsFormState>(key: K, value: SettingsFormState[K]) => void;
    onUpdateTrackers: () => void;
    saveMessage: string | null;
  } = $props();

  let trackerText = $state('');
  let isMagnetHandler = $state(false);

  $effect(() => {
    (async () => {
      try {
        const trackers = await api.getTrackerList();
        trackerText = trackers.join('\n');
      } catch {
        // tracker list may not be available
      }
      try {
        isMagnetHandler = await checkMagnetHandler();
      } catch {
        // may not be available in dev
      }
    })();
  });

  let lineCount = $derived(trackerText.split('\n').filter((l) => l.trim()).length);

  async function handleMagnetToggle(enabled: boolean) {
    try {
      // On macOS protocol registration is install-time; this may fail silently.
      await setMagnetHandler(enabled);
      isMagnetHandler = enabled;
    } catch (e) {
      console.error('Failed to toggle magnet handler:', e);
    }
  }
</script>

<div class="settings-panel-inner">
  <!-- Protocol -->
  <section class="settings-section">
    <div class="settings-section-title">
      <span class="material-symbols-outlined">hub</span>
      <h3>Protocol</h3>
    </div>
    <div class="settings-card settings-card-divided">
      <div class="toggle-row">
        <div class="toggle-row-info">
          <span class="toggle-label">Enable DHT (Distributed Hash Table)</span>
          <span class="toggle-description">Allows finding peers without a tracker. Essential for magnet links.</span>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" checked={form.btEnableDht} onchange={(e) => updateField('btEnableDht', e.currentTarget.checked)} />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="toggle-row">
        <div class="toggle-row-info">
          <span class="toggle-label">Enable PEX (Peer Exchange)</span>
          <span class="toggle-description">Exchanges peer lists with currently connected peers.</span>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" checked={form.btEnablePex} onchange={(e) => updateField('btEnablePex', e.currentTarget.checked)} />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="toggle-row">
        <div class="toggle-row-info">
          <span class="toggle-label">Enable LPD (Local Peer Discovery)</span>
          <span class="toggle-description">Finds peers on your local network (LAN).</span>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" checked={form.btEnableLpd} onchange={(e) => updateField('btEnableLpd', e.currentTarget.checked)} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
  </section>

  <!-- Transfer -->
  <section class="settings-section">
    <div class="settings-section-title">
      <span class="material-symbols-outlined">swap_vert</span>
      <h3>Transfer</h3>
    </div>
    <div class="settings-card settings-card-padded" style="display: flex; flex-direction: column; gap: var(--space-lg)">
      <!-- Seed Ratio -->
      <div class="slider-with-value">
        <div class="slider-header">
          <label>Auto-Seed Ratio</label>
          <span class="slider-value-badge">{form.btSeedRatio.toFixed(2)}</span>
        </div>
        <div class="slider-body">
          <input
            type="range" min={0} max={5} step={0.1}
            value={form.btSeedRatio}
            oninput={(e) => updateField('btSeedRatio', Number(e.currentTarget.value))}
          />
        </div>
        <div class="slider-scale">
          <span>0.0</span><span>1.0</span><span>2.0</span><span>3.0</span><span>4.0</span><span>5.0</span>
        </div>
        <p class="slider-description">Stop seeding automatically when the upload/download ratio reaches this value.</p>
      </div>

      <div style="border-top: 1px solid var(--border-primary); margin: 0 calc(var(--space-lg) * -1); padding: 0 var(--space-lg)"></div>

      <!-- Max Peers -->
      <div class="input-group">
        <label>Max Peers per Torrent</label>
        <p class="input-description">Maximum number of peers to connect to per torrent.</p>
        <div class="input-with-suffix" style="max-width: 200px">
          <input
            type="number" min={1} max={500}
            value={form.btMaxPeers}
            oninput={(e) => updateField('btMaxPeers', Math.max(1, Math.min(500, Number(e.currentTarget.value))))}
          />
          <span class="input-suffix">PEERS</span>
        </div>
      </div>
    </div>
  </section>

  <!-- Trackers -->
  <section class="settings-section">
    <div class="settings-section-title">
      <span class="material-symbols-outlined">radar</span>
      <h3>Trackers</h3>
    </div>
    <div class="settings-card settings-card-padded" style="display: flex; flex-direction: column; gap: var(--space-md)">
      <div class="tracker-header">
        <div class="tracker-header-info">
          <span class="tracker-title">Custom Tracker List</span>
          <span class="tracker-description">These trackers will be automatically added to all new downloads.</span>
        </div>
        <button class="tracker-update-btn" onclick={onUpdateTrackers}>
          <span class="material-symbols-outlined" style="font-size: 16px">refresh</span>
          Update from Source
        </button>
      </div>
      <div class="tracker-textarea-wrapper">
        <textarea
          bind:value={trackerText}
          placeholder={'udp://tracker.opentrackr.org:1337/announce\nudp://open.stealth.si:80/announce'}
          rows={6}
        ></textarea>
        <span class="tracker-line-count">{lineCount} lines</span>
      </div>
      <p class="tracker-footer-note">Enter one URL per line. Supports UDP and HTTP trackers.</p>
      {#if saveMessage && saveMessage.includes('tracker')}
        <p style="font-size: 12px; color: var(--color-success)">{saveMessage}</p>
      {/if}
    </div>
  </section>

  <!-- System Integration -->
  <section class="settings-section">
    <div class="settings-section-title">
      <span class="material-symbols-outlined">terminal</span>
      <h3>System Integration</h3>
    </div>
    <div class="settings-card settings-card-divided">
      <div class="integration-row">
        <div class="integration-row-left">
          <div class="integration-icon magnet">
            <span class="material-symbols-outlined" style="font-size: 22px">link</span>
          </div>
          <div class="toggle-row-info">
            <span class="toggle-label">Handle magnet: links</span>
            <span class="toggle-description">Capture magnet links from web browsers.</span>
          </div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" checked={isMagnetHandler} onchange={(e) => handleMagnetToggle(e.currentTarget.checked)} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
  </section>
</div>
