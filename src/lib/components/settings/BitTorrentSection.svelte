<script lang="ts">
  import { api } from '../../api/commands';
  import type { SettingsFormState } from '../../../routes/Settings.svelte';
  import Icon from '../ui/Icon.svelte';
  import Switch from '../ui/Switch.svelte';
  import Stepper from '../ui/Stepper.svelte';

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

  $effect(() => {
    api.getTrackerList()
      .then((trackers) => (trackerText = trackers.join('\n')))
      .catch(() => {
        /* tracker list may not be available */
      });
  });

  let lineCount = $derived(trackerText.split('\n').filter((l) => l.trim()).length);
</script>

<div class="card card-pad">
  <div class="set-row">
    <div class="set-info">
      <div class="t">DHT — Distributed Hash Table</div>
      <div class="d">Find peers without a tracker. Essential for magnet links</div>
    </div>
    <Switch on={form.btEnableDht} onToggle={() => updateField('btEnableDht', !form.btEnableDht)} label="Enable DHT" />
  </div>

  <div class="set-row">
    <div class="set-info">
      <div class="t">PEX — Peer Exchange</div>
      <div class="d">Exchange peer lists with currently connected peers</div>
    </div>
    <Switch on={form.btEnablePex} onToggle={() => updateField('btEnablePex', !form.btEnablePex)} label="Enable PEX" />
  </div>

  <div class="set-row">
    <div class="set-info">
      <div class="t">LPD — Local Peer Discovery</div>
      <div class="d">Find peers on your local network</div>
    </div>
    <Switch on={form.btEnableLpd} onToggle={() => updateField('btEnableLpd', !form.btEnableLpd)} label="Enable LPD" />
  </div>

  <div class="set-row">
    <div class="set-info">
      <div class="t">Auto-seed ratio</div>
      <div class="d">Stop seeding when the upload/download ratio reaches this value</div>
    </div>
    <div class="set-control range-control">
      <input
        class="range"
        type="range"
        min="0"
        max="5"
        step="0.1"
        value={form.btSeedRatio}
        oninput={(e) => updateField('btSeedRatio', Number(e.currentTarget.value))}
        aria-label="Auto-seed ratio"
      />
      <span class="range-val">{form.btSeedRatio.toFixed(2)}</span>
    </div>
  </div>

  <div class="set-row">
    <div class="set-info">
      <div class="t">Max peers per torrent</div>
      <div class="d">Maximum peers to connect to per torrent (1–500)</div>
    </div>
    <div class="set-control">
      <Stepper value={form.btMaxPeers} min={1} max={500} step={5} onChange={(v) => updateField('btMaxPeers', v)} label="Max peers per torrent" />
    </div>
  </div>

  <div class="set-row">
    <div class="set-info">
      <div class="t">Auto-update trackers</div>
      <div class="d">Refresh the public tracker list automatically</div>
    </div>
    <Switch on={form.autoUpdateTrackers} onToggle={() => updateField('autoUpdateTrackers', !form.autoUpdateTrackers)} label="Auto-update trackers" />
  </div>

  <div class="tracker-block">
    <div class="tracker-block-head">
      <div class="set-info">
        <div class="t">Tracker list</div>
        <div class="d">Added to all new torrent downloads · one URL per line · {lineCount} entries</div>
      </div>
      <button class="btn btn-ghost" onclick={onUpdateTrackers}>
        <Icon name="refresh" size={16} /> Update now
      </button>
    </div>
    <textarea
      class="input mono tracker-textarea"
      bind:value={trackerText}
      placeholder={'udp://tracker.opentrackr.org:1337/announce\nudp://open.stealth.si:80/announce'}
      rows="6"
      aria-label="Tracker list"
    ></textarea>
    {#if saveMessage && saveMessage.includes('tracker')}
      <p class="tracker-msg">{saveMessage}</p>
    {/if}
  </div>
</div>
