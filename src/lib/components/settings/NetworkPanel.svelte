<script lang="ts">
  import type { SettingsFormState } from '../../../routes/Settings.svelte';

  let {
    form,
    updateField,
  }: {
    form: SettingsFormState;
    updateField: <K extends keyof SettingsFormState>(key: K, value: SettingsFormState[K]) => void;
  } = $props();

  let dlUnit = $state<'MB/s' | 'KB/s'>('MB/s');
  let ulUnit = $state<'MB/s' | 'KB/s'>('KB/s');

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
</script>

<div class="settings-panel-inner">
  <p class="settings-panel-description">
    Configure connection limits, global bandwidth throttles, proxy servers, and disk allocation strategies to optimize your download performance.
  </p>

  <!-- Throughput & Connections -->
  <section class="settings-section">
    <div class="settings-section-title">
      <span class="material-symbols-outlined">speed</span>
      <h3>Throughput &amp; Connections</h3>
    </div>
    <div class="settings-grid">
      <!-- Concurrent Downloads - full width -->
      <div class="settings-grid-full">
        <div class="settings-card settings-card-padded">
          <div class="slider-with-value">
            <div class="slider-header">
              <div>
                <label>Concurrent Downloads</label>
                <p class="slider-description" style="margin-top: 4px">Maximum number of active downloads allowed at once.</p>
              </div>
              <span class="slider-value-large">{form.maxConcurrent}</span>
            </div>
            <div class="slider-body">
              <input
                type="range" min={1} max={20} value={form.maxConcurrent}
                oninput={(e) => updateField('maxConcurrent', Number(e.currentTarget.value))}
              />
            </div>
            <div class="slider-scale"><span>1</span><span>20</span></div>
          </div>
        </div>
      </div>
      <!-- Connections per Server -->
      <div class="settings-card settings-card-padded">
        <div class="input-group">
          <label>Connections per Server</label>
          <p class="input-description">Max parallel streams per host.</p>
          <div class="input-with-suffix">
            <input
              type="number" min={1} max={64}
              value={form.maxConnections}
              oninput={(e) => updateField('maxConnections', Math.max(1, Math.min(64, Number(e.currentTarget.value))))}
            />
            <span class="input-suffix">CONN</span>
          </div>
        </div>
      </div>
      <!-- Segments per Download -->
      <div class="settings-card settings-card-padded">
        <div class="input-group">
          <label>Segments per Download</label>
          <p class="input-description">Split files into multiple parts.</p>
          <div class="input-with-suffix">
            <input
              type="number" min={1} max={128}
              value={form.splitCount}
              oninput={(e) => updateField('splitCount', Math.max(1, Math.min(128, Number(e.currentTarget.value))))}
            />
            <span class="input-suffix">PARTS</span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Global Speed Limits -->
  <section class="settings-section">
    <div class="settings-section-title">
      <span class="material-symbols-outlined">swap_vert</span>
      <h3>Global Speed Limits</h3>
    </div>
    <div class="settings-grid">
      <!-- Download Limit -->
      <div class="speed-limit-card">
        <div class="speed-limit-header">
          <div class="speed-limit-label">
            <div class="speed-limit-icon download">
              <span class="material-symbols-outlined">download</span>
            </div>
            <div class="speed-limit-label-text">
              <label>Download Limit</label>
              <p>Cap incoming traffic speed.</p>
            </div>
          </div>
          <label class="toggle-switch">
            <input
              type="checkbox" checked={form.downloadLimitEnabled}
              onchange={(e) => updateField('downloadLimitEnabled', e.currentTarget.checked)}
            />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="speed-limit-inputs{!form.downloadLimitEnabled ? ' disabled' : ''}">
          <input
            type="text"
            value={form.downloadLimitEnabled ? bytesToDisplay(form.downloadSpeedLimit, dlUnit) : '0'}
            oninput={(e) => updateField('downloadSpeedLimit', displayToBytes(e.currentTarget.value, dlUnit))}
            disabled={!form.downloadLimitEnabled}
            placeholder="0"
          />
          <select value={dlUnit} onchange={(e) => (dlUnit = e.currentTarget.value as 'MB/s' | 'KB/s')} disabled={!form.downloadLimitEnabled}>
            <option value="MB/s">MB/s</option>
            <option value="KB/s">KB/s</option>
          </select>
        </div>
      </div>
      <!-- Upload Limit -->
      <div class="speed-limit-card">
        <div class="speed-limit-header">
          <div class="speed-limit-label">
            <div class="speed-limit-icon upload">
              <span class="material-symbols-outlined">upload</span>
            </div>
            <div class="speed-limit-label-text">
              <label>Upload Limit</label>
              <p>Cap outgoing traffic speed.</p>
            </div>
          </div>
          <label class="toggle-switch">
            <input
              type="checkbox" checked={form.uploadLimitEnabled}
              onchange={(e) => updateField('uploadLimitEnabled', e.currentTarget.checked)}
            />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="speed-limit-inputs{!form.uploadLimitEnabled ? ' disabled' : ''}">
          <input
            type="text"
            value={form.uploadLimitEnabled ? bytesToDisplay(form.uploadSpeedLimit, ulUnit) : '0'}
            oninput={(e) => updateField('uploadSpeedLimit', displayToBytes(e.currentTarget.value, ulUnit))}
            disabled={!form.uploadLimitEnabled}
            placeholder="0"
          />
          <select value={ulUnit} onchange={(e) => (ulUnit = e.currentTarget.value as 'MB/s' | 'KB/s')} disabled={!form.uploadLimitEnabled}>
            <option value="KB/s">KB/s</option>
            <option value="MB/s">MB/s</option>
          </select>
        </div>
      </div>
    </div>
  </section>

  <!-- Proxy Settings -->
  <section class="settings-section">
    <div class="settings-section-title">
      <span class="material-symbols-outlined">vpn_lock</span>
      <h3>Proxy Settings</h3>
    </div>
    <div class="settings-card settings-card-padded" style="display: flex; flex-direction: column; gap: var(--space-lg)">
      <!-- Proxy Type -->
      <div class="input-group settings-grid-full">
        <label>Proxy Type</label>
        <select
          value={form.proxyType}
          onchange={(e) => updateField('proxyType', e.currentTarget.value)}
          style="width: 100%"
        >
          <option value="none">None (Direct Connection)</option>
          <option value="http">HTTP</option>
          <option value="https">HTTPS</option>
          <option value="socks5">SOCKS5</option>
        </select>
      </div>

      {#if form.proxyType !== 'none'}
        <!-- Host & Port -->
        <div class="settings-grid">
          <div class="input-group">
            <label>Host / IP</label>
            <div class="input-with-icon">
              <span class="material-symbols-outlined input-icon">dns</span>
              <input
                type="text" value={form.proxyHost}
                oninput={(e) => updateField('proxyHost', e.currentTarget.value)}
                placeholder="192.168.1.50"
              />
            </div>
          </div>
          <div class="input-group">
            <label>Port</label>
            <div class="input-with-icon">
              <span class="material-symbols-outlined input-icon">tag</span>
              <input
                type="number" value={form.proxyPort}
                oninput={(e) => updateField('proxyPort', e.currentTarget.value)}
                placeholder="1080"
              />
            </div>
          </div>
        </div>

        <!-- Authentication -->
        <div class="proxy-auth-card">
          <div class="proxy-auth-header">
            <label>Authentication</label>
            <label class="toggle-switch">
              <input
                type="checkbox" checked={form.proxyAuthEnabled}
                onchange={(e) => updateField('proxyAuthEnabled', e.currentTarget.checked)}
              />
              <span class="toggle-slider"></span>
            </label>
          </div>
          {#if form.proxyAuthEnabled}
            <div class="proxy-auth-fields">
              <div>
                <span class="field-label">Username</span>
                <input
                  type="text" value={form.proxyUsername}
                  oninput={(e) => updateField('proxyUsername', e.currentTarget.value)}
                  placeholder="Optional"
                />
              </div>
              <div>
                <span class="field-label">Password</span>
                <input
                  type="password" value={form.proxyPassword}
                  oninput={(e) => updateField('proxyPassword', e.currentTarget.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </section>

  <!-- Reliability & Disk -->
  <section class="settings-section">
    <div class="settings-section-title">
      <span class="material-symbols-outlined">verified_user</span>
      <h3>Reliability &amp; Disk</h3>
    </div>
    <div class="settings-grid">
      <!-- Auto Retry -->
      <div class="settings-card settings-card-padded">
        <div class="input-group">
          <label>Automatic Retry Attempts</label>
          <p class="input-description">Retries on connection failure.</p>
          <div class="stepper-control">
            <button
              class="stepper-btn"
              onclick={() => updateField('maxRetries', Math.max(0, form.maxRetries - 1))}
            >
              <span class="material-symbols-outlined">remove</span>
            </button>
            <span class="stepper-value">{form.maxRetries}</span>
            <button
              class="stepper-btn"
              onclick={() => updateField('maxRetries', Math.min(20, form.maxRetries + 1))}
            >
              <span class="material-symbols-outlined">add</span>
            </button>
          </div>
        </div>
      </div>
      <!-- Allocation Mode -->
      <div class="settings-card settings-card-padded">
        <div class="input-group">
          <label>File Allocation Mode</label>
          <p class="input-description">How space is reserved on disk.</p>
          <div class="segmented-control">
            {#each ['none', 'sparse', 'full'] as mode (mode)}
              <button
                class="segment{form.allocationMode === mode ? ' active' : ''}"
                onclick={() => updateField('allocationMode', mode)}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            {/each}
          </div>
        </div>
      </div>
      <!-- Connect Timeout -->
      <div class="settings-card settings-card-padded">
        <div class="input-group">
          <label>Connect Timeout</label>
          <p class="input-description">Seconds to wait for connection.</p>
          <div class="range-control-inline">
            <input
              type="range" min={5} max={120} value={form.connectTimeout}
              oninput={(e) => updateField('connectTimeout', Number(e.currentTarget.value))}
            />
            <span class="range-value">{form.connectTimeout}s</span>
          </div>
        </div>
      </div>
      <!-- Read Timeout -->
      <div class="settings-card settings-card-padded">
        <div class="input-group">
          <label>Read Timeout</label>
          <p class="input-description">Seconds to wait for data.</p>
          <div class="range-control-inline">
            <input
              type="range" min={10} max={300} value={form.readTimeout}
              oninput={(e) => updateField('readTimeout', Number(e.currentTarget.value))}
            />
            <span class="range-value">{form.readTimeout}s</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>
