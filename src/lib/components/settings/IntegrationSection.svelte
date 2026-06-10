<script lang="ts">
  import {
    setMagnetHandler,
    isMagnetHandler as checkMagnetHandler,
    setRunAtStartup,
    getRunAtStartup,
  } from '../../api/system';
  import type { SettingsFormState } from '../../../routes/Settings.svelte';
  import Switch from '../ui/Switch.svelte';

  let {
    form,
    updateField,
  }: {
    form: SettingsFormState;
    updateField: <K extends keyof SettingsFormState>(key: K, value: SettingsFormState[K]) => void;
  } = $props();

  let isMagnetHandler = $state(false);
  let runAtStartup = $state(false);

  $effect(() => {
    checkMagnetHandler()
      .then((v) => (isMagnetHandler = v))
      .catch(() => {});
    getRunAtStartup()
      .then((v) => (runAtStartup = v))
      .catch(() => {});
  });

  async function handleMagnetToggle() {
    const enabled = !isMagnetHandler;
    try {
      // On macOS protocol registration is install-time; this may fail silently.
      await setMagnetHandler(enabled);
      isMagnetHandler = enabled;
    } catch (e) {
      console.error('Failed to toggle magnet handler:', e);
    }
  }

  async function handleStartupToggle() {
    const enabled = !runAtStartup;
    try {
      await setRunAtStartup(enabled);
      runAtStartup = enabled;
    } catch (e) {
      console.error('Failed to toggle run at startup:', e);
    }
  }
</script>

<div class="card card-pad">
  <div class="set-row">
    <div class="set-info">
      <div class="t">Desktop notifications</div>
      <div class="d">Alert when downloads complete or fail</div>
    </div>
    <Switch on={form.enableNotifications} onToggle={() => updateField('enableNotifications', !form.enableNotifications)} label="Desktop notifications" />
  </div>

  <div class="set-row">
    <div class="set-info">
      <div class="t">Minimize to tray on close</div>
      <div class="d">Keep running in the background instead of quitting</div>
    </div>
    <Switch on={form.closeToTray} onToggle={() => updateField('closeToTray', !form.closeToTray)} label="Minimize to tray on close" />
  </div>

  <div class="set-row">
    <div class="set-info">
      <div class="t">Handle magnet links</div>
      <div class="d">Register as the default torrent application</div>
    </div>
    <Switch on={isMagnetHandler} onToggle={handleMagnetToggle} label="Handle magnet links" />
  </div>

  <div class="set-row">
    <div class="set-info">
      <div class="t">Launch at startup</div>
      <div class="d">Start Gosh-Fetch when you log in</div>
    </div>
    <Switch on={runAtStartup} onToggle={handleStartupToggle} label="Launch at startup" />
  </div>
</div>
