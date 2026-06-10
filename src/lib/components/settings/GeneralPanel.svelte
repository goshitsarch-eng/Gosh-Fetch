<script lang="ts">
  import type { SettingsFormState } from '../../../routes/Settings.svelte';

  let {
    form,
    updateField,
    userAgentPresets,
    onBrowseDownloadPath,
  }: {
    form: SettingsFormState;
    updateField: <K extends keyof SettingsFormState>(key: K, value: SettingsFormState[K]) => void;
    userAgentPresets: [string, string][];
    onBrowseDownloadPath: () => void;
  } = $props();
</script>

<div class="settings-panel-inner">
  <!-- Downloads -->
  <section class="settings-section">
    <div class="settings-section-title">
      <span class="material-symbols-outlined">folder</span>
      <h3>Downloads</h3>
    </div>
    <div class="settings-card settings-card-divided">
      <div class="general-setting-row">
        <div class="general-setting-info">
          <label>Download Location</label>
          <p>Where downloaded files will be saved</p>
        </div>
        <div class="file-control">
          <input type="text" value={form.downloadPath} readonly />
          <button class="btn btn-secondary" onclick={onBrowseDownloadPath}>Browse</button>
        </div>
      </div>
      <div class="general-setting-row">
        <div class="general-setting-info">
          <label>Delete Files on Remove</label>
          <p>Delete downloaded files when removing a task</p>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" checked={form.deleteFilesOnRemove} onchange={(e) => updateField('deleteFilesOnRemove', e.currentTarget.checked)} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
  </section>

  <!-- Application -->
  <section class="settings-section">
    <div class="settings-section-title">
      <span class="material-symbols-outlined">settings</span>
      <h3>Application</h3>
    </div>
    <div class="settings-card settings-card-divided">
      <div class="general-setting-row">
        <div class="general-setting-info">
          <label>Notifications</label>
          <p>Show notification when downloads complete</p>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" checked={form.enableNotifications} onchange={(e) => updateField('enableNotifications', e.currentTarget.checked)} />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="general-setting-row">
        <div class="general-setting-info">
          <label>Close to Tray</label>
          <p>Minimize to system tray instead of quitting</p>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" checked={form.closeToTray} onchange={(e) => updateField('closeToTray', e.currentTarget.checked)} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
  </section>

  <!-- User Agent -->
  <section class="settings-section">
    <div class="settings-section-title">
      <span class="material-symbols-outlined">person</span>
      <h3>User Agent</h3>
    </div>
    <div class="settings-card settings-card-padded">
      <div class="input-group">
        <label>HTTP Client Identification</label>
        <p class="input-description">Identify as a different client when downloading</p>
        <select
          class="user-agent-select"
          value={form.userAgent}
          onchange={(e) => updateField('userAgent', e.currentTarget.value)}
        >
          {#each userAgentPresets as [name, value] (value)}
            <option {value}>{name}</option>
          {/each}
        </select>
      </div>
    </div>
  </section>
</div>
