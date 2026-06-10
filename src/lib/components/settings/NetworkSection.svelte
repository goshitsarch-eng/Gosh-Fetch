<script lang="ts">
  import type { SettingsFormState } from '../../../routes/Settings.svelte';
  import Stepper from '../ui/Stepper.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import Switch from '../ui/Switch.svelte';

  let {
    form,
    updateField,
    userAgentPresets,
  }: {
    form: SettingsFormState;
    updateField: <K extends keyof SettingsFormState>(key: K, value: SettingsFormState[K]) => void;
    userAgentPresets: [string, string][];
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

<div class="card card-pad">
  <div class="set-row">
    <div class="set-info">
      <div class="t">Concurrent downloads</div>
      <div class="d">Maximum simultaneous downloads (1–20)</div>
    </div>
    <div class="set-control">
      <Stepper value={form.maxConcurrent} min={1} max={20} onChange={(v) => updateField('maxConcurrent', v)} label="Concurrent downloads" />
    </div>
  </div>

  <div class="set-row">
    <div class="set-info">
      <div class="t">Connections per server</div>
      <div class="d">Parallel connections to a single host (1–64)</div>
    </div>
    <div class="set-control">
      <Stepper value={form.maxConnections} min={1} max={64} onChange={(v) => updateField('maxConnections', v)} label="Connections per server" />
    </div>
  </div>

  <div class="set-row">
    <div class="set-info">
      <div class="t">Segments per download</div>
      <div class="d">Split each file into N parallel parts (1–128)</div>
    </div>
    <div class="set-control">
      <Stepper value={form.splitCount} min={1} max={128} onChange={(v) => updateField('splitCount', v)} label="Segments per download" />
    </div>
  </div>

  <div class="set-row">
    <div class="set-info">
      <div class="t">Retry attempts</div>
      <div class="d">Auto-retry failed downloads before giving up (0–20)</div>
    </div>
    <div class="set-control">
      <Stepper value={form.maxRetries} min={0} max={20} onChange={(v) => updateField('maxRetries', v)} label="Retry attempts" />
    </div>
  </div>

  <div class="set-row">
    <div class="set-info">
      <div class="t">Download speed limit</div>
      <div class="d">Cap incoming traffic across all downloads</div>
    </div>
    <div class="set-control limit-control">
      {#if form.downloadLimitEnabled}
        <div class="input-group limit-input">
          <input
            class="input mono"
            type="text"
            value={bytesToDisplay(form.downloadSpeedLimit, dlUnit)}
            oninput={(e) => updateField('downloadSpeedLimit', displayToBytes(e.currentTarget.value, dlUnit))}
            aria-label="Download speed limit"
          />
          <select
            class="addon addon-select"
            value={dlUnit}
            onchange={(e) => (dlUnit = e.currentTarget.value as 'MB/s' | 'KB/s')}
            aria-label="Download limit unit"
          >
            <option value="MB/s">↓ MB/s</option>
            <option value="KB/s">↓ KB/s</option>
          </select>
        </div>
      {/if}
      <Switch on={form.downloadLimitEnabled} onToggle={() => updateField('downloadLimitEnabled', !form.downloadLimitEnabled)} label="Enable download speed limit" />
    </div>
  </div>

  <div class="set-row">
    <div class="set-info">
      <div class="t">Upload speed limit</div>
      <div class="d">Cap outgoing traffic (seeding)</div>
    </div>
    <div class="set-control limit-control">
      {#if form.uploadLimitEnabled}
        <div class="input-group limit-input">
          <input
            class="input mono"
            type="text"
            value={bytesToDisplay(form.uploadSpeedLimit, ulUnit)}
            oninput={(e) => updateField('uploadSpeedLimit', displayToBytes(e.currentTarget.value, ulUnit))}
            aria-label="Upload speed limit"
          />
          <select
            class="addon addon-select"
            value={ulUnit}
            onchange={(e) => (ulUnit = e.currentTarget.value as 'MB/s' | 'KB/s')}
            aria-label="Upload limit unit"
          >
            <option value="KB/s">↑ KB/s</option>
            <option value="MB/s">↑ MB/s</option>
          </select>
        </div>
      {/if}
      <Switch on={form.uploadLimitEnabled} onToggle={() => updateField('uploadLimitEnabled', !form.uploadLimitEnabled)} label="Enable upload speed limit" />
    </div>
  </div>

  <div class="set-row">
    <div class="set-info">
      <div class="t">Proxy</div>
      <div class="d">Route traffic through an HTTP, HTTPS, or SOCKS5 proxy</div>
    </div>
    <div class="set-control">
      <Segmented
        value={form.proxyType}
        options={[
          { v: 'none', l: 'None' },
          { v: 'http', l: 'HTTP' },
          { v: 'https', l: 'HTTPS' },
          { v: 'socks5', l: 'SOCKS5' },
        ]}
        onChange={(v) => updateField('proxyType', v)}
        label="Proxy type"
      />
    </div>
  </div>

  {#if form.proxyType !== 'none'}
    <div class="proxy-detail">
      <div class="proxy-grid">
        <div class="field">
          <label for="proxy-host">Host / IP</label>
          <input
            id="proxy-host"
            class="input mono"
            type="text"
            value={form.proxyHost}
            oninput={(e) => updateField('proxyHost', e.currentTarget.value)}
            placeholder="192.168.1.50"
          />
        </div>
        <div class="field">
          <label for="proxy-port">Port</label>
          <input
            id="proxy-port"
            class="input mono"
            type="number"
            value={form.proxyPort}
            oninput={(e) => updateField('proxyPort', e.currentTarget.value)}
            placeholder="1080"
          />
        </div>
      </div>
      <div class="set-row" style="border: none; padding-bottom: 0">
        <div class="set-info">
          <div class="t" style="font-size: 13px">Proxy authentication</div>
        </div>
        <Switch on={form.proxyAuthEnabled} onToggle={() => updateField('proxyAuthEnabled', !form.proxyAuthEnabled)} label="Proxy authentication" />
      </div>
      {#if form.proxyAuthEnabled}
        <div class="proxy-grid">
          <div class="field">
            <label for="proxy-user">Username</label>
            <input
              id="proxy-user"
              class="input mono"
              type="text"
              value={form.proxyUsername}
              oninput={(e) => updateField('proxyUsername', e.currentTarget.value)}
              placeholder="Optional"
            />
          </div>
          <div class="field">
            <label for="proxy-pass">Password</label>
            <input
              id="proxy-pass"
              class="input mono"
              type="password"
              value={form.proxyPassword}
              oninput={(e) => updateField('proxyPassword', e.currentTarget.value)}
              placeholder="Optional"
            />
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <div class="set-row">
    <div class="set-info">
      <div class="t">User agent</div>
      <div class="d">Identify as a specific browser or tool</div>
    </div>
    <div class="set-control">
      <select
        class="select"
        style="width: 180px"
        value={form.userAgent}
        onchange={(e) => updateField('userAgent', e.currentTarget.value)}
        aria-label="User agent"
      >
        {#each userAgentPresets as [name, value] (value)}
          <option {value}>{name}</option>
        {/each}
      </select>
    </div>
  </div>

  <div class="set-row">
    <div class="set-info">
      <div class="t">Connect timeout</div>
      <div class="d">Seconds to wait for a connection (5–120)</div>
    </div>
    <div class="set-control range-control">
      <input
        class="range"
        type="range"
        min="5"
        max="120"
        value={form.connectTimeout}
        oninput={(e) => updateField('connectTimeout', Number(e.currentTarget.value))}
        aria-label="Connect timeout"
      />
      <span class="range-val">{form.connectTimeout}s</span>
    </div>
  </div>

  <div class="set-row">
    <div class="set-info">
      <div class="t">Read timeout</div>
      <div class="d">Seconds to wait for data (10–300)</div>
    </div>
    <div class="set-control range-control">
      <input
        class="range"
        type="range"
        min="10"
        max="300"
        value={form.readTimeout}
        oninput={(e) => updateField('readTimeout', Number(e.currentTarget.value))}
        aria-label="Read timeout"
      />
      <span class="range-val">{form.readTimeout}s</span>
    </div>
  </div>

  <div class="set-row">
    <div class="set-info">
      <div class="t">File allocation</div>
      <div class="d">How disk space is reserved before download</div>
    </div>
    <div class="set-control">
      <Segmented
        value={form.allocationMode}
        options={[
          { v: 'none', l: 'None' },
          { v: 'sparse', l: 'Sparse' },
          { v: 'full', l: 'Full' },
        ]}
        onChange={(v) => updateField('allocationMode', v)}
        label="File allocation mode"
      />
    </div>
  </div>
</div>
