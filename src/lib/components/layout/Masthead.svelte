<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import ThroughputScope from './ThroughputScope.svelte';
  import { api } from '../../api/commands';
  import { stats } from '../../stores/stats.svelte';
  import { formatBytes, formatSpeed } from '../../utils/format';
  import './Masthead.css';

  let diskSpace = $state<{ total: number; free: number } | null>(null);

  $effect(() => {
    async function loadDiskSpace() {
      try {
        diskSpace = await api.getDiskSpace();
      } catch {
        /* ignore */
      }
    }
    loadDiskSpace();
    const interval = setInterval(loadDiskSpace, 30000);
    return () => clearInterval(interval);
  });

  const diskUsedPercent = $derived(
    diskSpace ? Math.round(((diskSpace.total - diskSpace.free) / diskSpace.total) * 100) : 0
  );

  const pad2 = (n: number) => String(n).padStart(2, '0');
</script>

<header class="masthead">
  <div class="mh-brand">
    <div class="mh-brand-row">
      <div class="brand-mark"><Icon name="download" fill size={19} /></div>
      <div>
        <div class="brand-name">Gosh<span>·</span>Fetch</div>
        <div class="brand-sub">gosh-dl engine</div>
      </div>
    </div>
    <div class="mh-live">
      <span class="dotlive" class:offline={!stats.isConnected}></span>
      <span class="tag-label">
        transfer console · {stats.isConnected ? 'online' : 'reconnecting'}
      </span>
    </div>
  </div>

  <div class="mh-scope">
    <div class="mh-scope-head">
      <span class="tag-label">Throughput / live</span>
      <div class="mh-legend">
        <span><i style="background: var(--signal)"></i>DOWN</span>
        <span><i style="background: var(--lime)"></i>UP</span>
      </div>
    </div>
    <ThroughputScope />
  </div>

  <div class="mh-readout">
    <div class="mh-cell">
      <span class="k">↓ Down</span>
      <span class="v down">{formatSpeed(stats.downloadSpeed)}</span>
    </div>
    <div class="mh-cell">
      <span class="k">↑ Up</span>
      <span class="v up">{formatSpeed(stats.uploadSpeed)}</span>
    </div>
    <div class="mh-cell mh-split">
      <div><span class="k">Active</span><span class="v sm">{pad2(stats.numActive)}</span></div>
      <div><span class="k">Queue</span><span class="v sm">{pad2(stats.numWaiting)}</span></div>
    </div>
    {#if diskSpace}
      <div class="mh-cell mh-disk">
        <span class="k">Disk</span>
        <div class="mh-disk-bar"><div class="mh-disk-fill" style="width: {diskUsedPercent}%"></div></div>
        <span class="mh-disk-sub">{formatBytes(diskSpace.free)} free / {formatBytes(diskSpace.total)}</span>
      </div>
    {/if}
  </div>
</header>
