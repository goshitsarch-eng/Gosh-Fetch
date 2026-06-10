<script lang="ts">
  import Icon from '../lib/components/ui/Icon.svelte';
  import Segmented from '../lib/components/ui/Segmented.svelte';
  import { stats } from '../lib/stores/stats.svelte';
  import { downloads } from '../lib/stores/downloads.svelte';
  import { formatBytes, formatSpeed } from '../lib/utils/format';
  import './Statistics.css';

  // Types
  interface SpeedSample {
    time: number;
    download: number;
    upload: number;
  }

  type ChartPeriod = '5m' | '30m' | 'session';
  type VolumePeriod = '7d' | '14d' | '30d';

  interface DomainStat {
    domain: string;
    totalBytes: number;
    count: number;
  }

  // Helpers
  function formatUptime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  function getNiceMax(value: number): number {
    if (value <= 0) return 1024; // 1 KB/s minimum
    const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    const normalized = value / magnitude;
    if (normalized <= 1) return magnitude;
    if (normalized <= 2) return 2 * magnitude;
    if (normalized <= 5) return 5 * magnitude;
    return 10 * magnitude;
  }

  function catmullRomToBezierPath(points: { x: number; y: number }[]): string {
    if (points.length < 2) return '';
    if (points.length === 2) {
      return `M${points[0].x},${points[0].y}L${points[1].x},${points[1].y}`;
    }

    let d = `M${points[0].x},${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  }

  // Chart constants
  const CHART_W = 800;
  const CHART_H = 280;
  const PLOT_LEFT = 60;
  const PLOT_TOP = 10;
  const PLOT_WIDTH = 720;
  const PLOT_HEIGHT = 230;
  const PLOT_BOTTOM = PLOT_TOP + PLOT_HEIGHT;

  // Session tracking (non-reactive sample buffer + version counter)
  const sessionStartTime = Date.now();
  const speedSamples: SpeedSample[] = [];
  let renderTick = $state(0);
  let chartPeriod = $state<ChartPeriod>('5m');
  let volumePeriod = $state<VolumePeriod>('14d');
  let peakDownloadSpeed = $state(0);
  let totalUploadedBytes = $state(0);
  let speedSumForAvg = $state(0);
  let speedSampleCount = $state(0);

  // Load persisted history and sync live downloads while statistics page is open
  $effect(() => {
    void downloads.loadCompletedHistory();
    void downloads.fetchDownloads();
    const interval = setInterval(() => {
      void downloads.fetchDownloads();
      void downloads.loadCompletedHistory();
    }, 30000);
    return () => clearInterval(interval);
  });

  // Sample speed every 3 seconds
  $effect(() => {
    const interval = setInterval(() => {
      const downloadSpeed = stats.downloadSpeed;
      const uploadSpeed = stats.uploadSpeed;
      const now = Date.now();

      speedSamples.push({ time: now, download: downloadSpeed, upload: uploadSpeed });

      // Track peak
      if (downloadSpeed > peakDownloadSpeed) {
        peakDownloadSpeed = downloadSpeed;
      }

      // Accumulate upload bytes (3s of upload at current speed)
      totalUploadedBytes += uploadSpeed * 3;

      // Track average
      speedSumForAvg += downloadSpeed;
      speedSampleCount += 1;

      // Prune samples older than 2 hours
      const twoHoursAgo = now - 2 * 60 * 60 * 1000;
      while (speedSamples.length > 0 && speedSamples[0].time < twoHoursAgo) {
        speedSamples.shift();
      }

      renderTick += 1;
    }, 3000);

    return () => clearInterval(interval);
  });

  // Derived: total downloaded from history
  const totalDownloaded = $derived(
    downloads.completed.reduce((sum, d) => sum + (d.completedSize || d.totalSize), 0)
  );

  // Derived: weekly comparison
  const weeklyComparison = $derived.by(() => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun
    const startOfThisWeek = new Date(now);
    startOfThisWeek.setDate(now.getDate() - dayOfWeek);
    startOfThisWeek.setHours(0, 0, 0, 0);

    const startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

    let thisWeek = 0;
    let lastWeek = 0;
    for (const d of downloads.completed) {
      const completed = new Date(d.completedAt || d.createdAt);
      if (completed >= startOfThisWeek) {
        thisWeek += d.completedSize || d.totalSize;
      } else if (completed >= startOfLastWeek) {
        lastWeek += d.completedSize || d.totalSize;
      }
    }

    if (lastWeek === 0) return null;
    return Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
  });

  // Derived: top domains
  const topDomains = $derived.by((): DomainStat[] => {
    const map = new Map<string, DomainStat>();
    for (const d of downloads.completed) {
      let domain = 'unknown';
      if (d.url) {
        try { domain = new URL(d.url).hostname; } catch { /* ignore */ }
      } else if (d.downloadType === 'magnet' || d.downloadType === 'torrent') {
        domain = 'torrent';
      }
      const existing = map.get(domain) || { domain, totalBytes: 0, count: 0 };
      existing.totalBytes += d.completedSize || d.totalSize;
      existing.count += 1;
      map.set(domain, existing);
    }
    return Array.from(map.values())
      .sort((a, b) => b.totalBytes - a.totalBytes)
      .slice(0, 5);
  });

  // Derived: per-day download volume buckets
  const volumeDays = $derived(volumePeriod === '7d' ? 7 : volumePeriod === '14d' ? 14 : 30);

  const volumeBars = $derived.by(() => {
    const days = volumeDays;
    const buckets: { label: string; bytes: number }[] = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(now);
      day.setDate(now.getDate() - i);
      buckets.push({
        label: day.toLocaleDateString(undefined, { weekday: 'narrow' }),
        bytes: 0,
      });
    }
    for (const d of downloads.completed) {
      const completed = new Date(d.completedAt || d.createdAt);
      completed.setHours(0, 0, 0, 0);
      const diff = Math.round((now.getTime() - completed.getTime()) / 86400000);
      if (diff >= 0 && diff < days) {
        buckets[days - 1 - diff].bytes += d.completedSize || d.totalSize;
      }
    }
    return buckets;
  });

  const maxVolumeBytes = $derived(Math.max(1, ...volumeBars.map((b) => b.bytes)));

  // Derived: protocol split (http vs bittorrent bytes)
  const protocolSplit = $derived.by(() => {
    let http = 0;
    let bt = 0;
    for (const d of downloads.completed) {
      const bytes = d.completedSize || d.totalSize;
      if (d.downloadType === 'http') http += bytes;
      else bt += bytes;
    }
    const total = http + bt;
    return { http, bt, httpPct: total > 0 ? Math.round((http / total) * 100) : 0 };
  });

  // Session average speed
  const avgSpeed = $derived(speedSampleCount > 0 ? speedSumForAvg / speedSampleCount : 0);

  // Uptime re-evaluates every sampling tick
  const uptimeText = $derived.by(() => {
    void renderTick;
    return formatUptime(Date.now() - sessionStartTime);
  });

  const maxDomainBytes = $derived(topDomains.length > 0 ? topDomains[0].totalBytes : 1);

  // ----- Network chart -----
  interface HoverInfo {
    clientX: number;
    clientY: number;
    speed: number;
    time: number;
    svgX: number;
    svgY: number;
  }

  let hoverInfo = $state<HoverInfo | null>(null);
  let bodyEl = $state<HTMLDivElement | null>(null);

  const filteredSamples = $derived.by(() => {
    void renderTick;
    const now = Date.now();
    if (chartPeriod === '5m') return speedSamples.filter((s) => s.time >= now - 5 * 60 * 1000);
    if (chartPeriod === '30m') return speedSamples.filter((s) => s.time >= now - 30 * 60 * 1000);
    return [...speedSamples];
  });

  const maxSpeed = $derived(
    filteredSamples.length === 0 ? 1024 : Math.max(...filteredSamples.map((s) => s.download))
  );

  const niceMax = $derived(getNiceMax(maxSpeed));

  const points = $derived.by(() => {
    if (filteredSamples.length === 0) return [];
    return filteredSamples.map((s, i) => ({
      x: filteredSamples.length <= 1
        ? PLOT_LEFT + PLOT_WIDTH / 2
        : PLOT_LEFT + (i / (filteredSamples.length - 1)) * PLOT_WIDTH,
      y: PLOT_BOTTOM - (s.download / niceMax) * PLOT_HEIGHT,
    }));
  });

  const linePath = $derived(catmullRomToBezierPath(points));
  const fillPath = $derived.by(() => {
    if (points.length < 2) return '';
    return linePath +
      ` L${points[points.length - 1].x.toFixed(1)},${PLOT_BOTTOM}` +
      ` L${points[0].x.toFixed(1)},${PLOT_BOTTOM} Z`;
  });

  const yLabels = $derived(
    [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
      pct,
      y: PLOT_BOTTOM - pct * PLOT_HEIGHT,
      label: formatSpeed(niceMax * pct),
    }))
  );

  const xLabels = $derived.by(() => {
    if (filteredSamples.length < 2) return [];
    const count = Math.min(6, filteredSamples.length);
    const step = Math.max(1, Math.floor((filteredSamples.length - 1) / (count - 1)));
    const labels: { x: number; label: string }[] = [];
    for (let i = 0; i < filteredSamples.length; i += step) {
      const s = filteredSamples[i];
      const x = PLOT_LEFT + (i / (filteredSamples.length - 1)) * PLOT_WIDTH;
      const time = new Date(s.time);
      labels.push({
        x,
        label: `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`,
      });
    }
    return labels;
  });

  function handleMouseMove(e: MouseEvent) {
    if (filteredSamples.length < 2) return;
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const svgX = (relX / rect.width) * CHART_W;
    const dataX = svgX - PLOT_LEFT;
    const ratio = Math.max(0, Math.min(1, dataX / PLOT_WIDTH));
    const idx = Math.round(ratio * (filteredSamples.length - 1));
    const sample = filteredSamples[idx];
    if (!sample) return;
    const px = PLOT_LEFT + (idx / (filteredSamples.length - 1)) * PLOT_WIDTH;
    const py = PLOT_BOTTOM - (sample.download / niceMax) * PLOT_HEIGHT;
    hoverInfo = {
      clientX: e.clientX,
      clientY: e.clientY,
      speed: sample.download,
      time: sample.time,
      svgX: px,
      svgY: py,
    };
  }

  function handleMouseLeave() {
    hoverInfo = null;
  }

  // Compute tooltip position relative to the chart body
  const tooltipStyle = $derived.by(() => {
    if (!hoverInfo || !bodyEl) return undefined;
    const rect = bodyEl.getBoundingClientRect();
    const xPct = hoverInfo.svgX / CHART_W;
    const left = xPct * rect.width;
    const transform = left > rect.width * 0.75 ? 'translateX(-100%)' : 'translateX(0)';
    return `left: ${left}px; top: 8px; transform: ${transform}`;
  });
</script>

{#snippet statCard(icon: string, label: string, value: string, comparison?: number | null, subtitle?: string)}
  <div class="stat">
    {#if comparison != null}
      <div class="stat-trend {comparison >= 0 ? 'up' : 'down'}">
        <Icon name={comparison >= 0 ? 'trending_up' : 'trending_down'} size={15} />
        {Math.abs(comparison)}%
      </div>
    {/if}
    <div class="stat-ico"><Icon name={icon} fill size={18} /></div>
    <div class="stat-val">{value}</div>
    <div class="stat-key">{label}{subtitle ? ` · ${subtitle}` : ''}</div>
  </div>
{/snippet}

<div class="content page-fade">
  <div class="content-inner">
    <!-- Stat cards -->
    <div class="stat-grid">
      {@render statCard('download', 'Total downloaded', formatBytes(totalDownloaded), weeklyComparison, 'vs last week')}
      {@render statCard('upload', 'Session uploaded', formatBytes(totalUploadedBytes), null, 'this session')}
      {@render statCard('speed', 'Average speed', formatSpeed(avgSpeed), null, 'this session')}
      {@render statCard('bolt', 'Peak speed', formatSpeed(peakDownloadSpeed), null, 'this session')}
    </div>

    <!-- Network Activity Chart -->
    <div class="section-h">Network activity</div>
    <div class="card card-pad">
      <div class="stats-chart-header">
        <div>
          <b class="panel-title">Download throughput</b>
          <div class="panel-sub">Session uptime {uptimeText} · {stats.isConnected ? 'engine online' : 'engine offline'}</div>
        </div>
        <Segmented
          value={chartPeriod}
          options={[
            { v: '5m', l: '5 min' },
            { v: '30m', l: '30 min' },
            { v: 'session', l: 'Session' },
          ]}
          onChange={(v) => (chartPeriod = v as ChartPeriod)}
          label="Chart period"
        />
      </div>

      {#if filteredSamples.length < 2}
        <div class="chart-empty">
          <Icon name="show_chart" size={30} />
          <span>Collecting data… speed samples will appear here.</span>
        </div>
      {:else}
        <div class="stats-chart-body" bind:this={bodyEl}>
          <svg class="stats-chart-svg" viewBox="0 0 {CHART_W} {CHART_H}" preserveAspectRatio="xMidYMid meet">
            <defs>
              <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stop-color="var(--signal)" stop-opacity="0.3" />
                <stop offset="100%" stop-color="var(--signal)" stop-opacity="0.02" />
              </linearGradient>
            </defs>

            <!-- Y-axis grid lines and labels -->
            {#each yLabels as { pct, y, label } (pct)}
              <g>
                <line
                  x1={PLOT_LEFT} y1={y} x2={PLOT_LEFT + PLOT_WIDTH} y2={y}
                  stroke="var(--border)" stroke-width="1"
                  stroke-dasharray={pct === 0 ? undefined : '4 4'}
                />
                <text x={PLOT_LEFT - 8} y={y + 4} text-anchor="end" fill="var(--text-3)" font-size="10"
                  font-family="var(--mono)">
                  {label}
                </text>
              </g>
            {/each}

            <!-- X-axis labels -->
            {#each xLabels as { x, label }, i (i)}
              <text {x} y={PLOT_BOTTOM + 20} text-anchor="middle" fill="var(--text-3)"
                font-size="10" font-family="var(--mono)">
                {label}
              </text>
            {/each}

            <!-- Gradient fill -->
            {#if fillPath}
              <path d={fillPath} fill="url(#chartGradient)" />
            {/if}

            <!-- Line -->
            {#if linePath}
              <path d={linePath} fill="none" stroke="var(--signal)" stroke-width="2"
                stroke-linecap="square" stroke-linejoin="miter" />
            {/if}

            <!-- Hover elements -->
            {#if hoverInfo}
              <line
                x1={hoverInfo.svgX} y1={PLOT_TOP} x2={hoverInfo.svgX} y2={PLOT_BOTTOM}
                stroke="var(--text-3)" stroke-width="1" stroke-dasharray="4 4" opacity="0.5"
              />
              <rect x={hoverInfo.svgX - 3} y={hoverInfo.svgY - 3} width="6" height="6" fill="var(--signal)"
                stroke="var(--surface)" stroke-width="1.5" />
            {/if}

            <!-- Invisible hover overlay -->
            <rect
              x={PLOT_LEFT} y={PLOT_TOP} width={PLOT_WIDTH} height={PLOT_HEIGHT}
              fill="transparent" style="cursor: crosshair"
              role="presentation"
              onmousemove={handleMouseMove} onmouseleave={handleMouseLeave}
            />
          </svg>

          {#if hoverInfo && tooltipStyle}
            <div class="chart-tooltip" style={tooltipStyle}>
              <span class="chart-tooltip-speed">{formatSpeed(hoverInfo.speed)}</span>
              <span class="chart-tooltip-time">
                {new Date(hoverInfo.time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Download volume per day -->
    <div class="section-h">Download volume</div>
    <div class="card card-pad">
      <div class="stats-chart-header">
        <div>
          <b class="panel-title">Completed per day</b>
          <div class="panel-sub">From download history</div>
        </div>
        <Segmented
          value={volumePeriod}
          options={[
            { v: '7d', l: '7d' },
            { v: '14d', l: '14d' },
            { v: '30d', l: '30d' },
          ]}
          onChange={(v) => (volumePeriod = v as VolumePeriod)}
          label="Volume period"
        />
      </div>
      <div class="volume-bars" class:dense={volumeDays === 30}>
        {#each volumeBars as bar, i (i)}
          <div class="volume-col">
            <div
              class="volume-bar"
              class:hot={i === volumeBars.length - 1 && bar.bytes > 0}
              style="height: {Math.max(bar.bytes > 0 ? 4 : 1, (bar.bytes / maxVolumeBytes) * 100)}%"
              title="{formatBytes(bar.bytes)}"
            ></div>
            <span class="volume-label">{bar.label}</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- Bottom row -->
    <div class="stats-grid-2">
      <div class="card card-pad">
        <b class="panel-title">Protocol split</b>
        {#if protocolSplit.http + protocolSplit.bt === 0}
          <div class="panel-empty">
            <Icon name="donut_small" size={26} />
            <p>No download history yet.</p>
          </div>
        {:else}
          <div class="proto-split">
            <div class="proto-donut">
              <svg viewBox="0 0 36 36" style="transform: rotate(-90deg)">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--track)" stroke-width="4" />
                <circle
                  cx="18" cy="18" r="15.9" fill="none"
                  stroke="var(--accent)" stroke-width="4"
                  stroke-dasharray="{protocolSplit.httpPct} 100"
                />
              </svg>
              <div class="proto-donut-center">
                <div class="proto-pct">{protocolSplit.httpPct}%</div>
                <div class="proto-pct-label">HTTP</div>
              </div>
            </div>
            <div class="proto-legend">
              <div class="proto-row">
                <span class="proto-dot" style="background: var(--accent)"></span>
                <span class="proto-name">HTTP / HTTPS</span>
                <span class="proto-val mono">{formatBytes(protocolSplit.http)}</span>
              </div>
              <div class="proto-row">
                <span class="proto-dot" style="background: var(--seed)"></span>
                <span class="proto-name">BitTorrent</span>
                <span class="proto-val mono">{formatBytes(protocolSplit.bt)}</span>
              </div>
            </div>
          </div>
        {/if}
      </div>

      <div class="card card-pad">
        <b class="panel-title">Top sources</b>
        {#if topDomains.length === 0}
          <div class="panel-empty">
            <Icon name="language" size={26} />
            <p>No download history yet.</p>
          </div>
        {:else}
          <div class="domain-list">
            {#each topDomains as d (d.domain)}
              <div class="domain-row">
                <div class="domain-head">
                  <span class="domain-name">{d.domain}</span>
                  <span class="domain-size mono">{formatBytes(d.totalBytes)}</span>
                </div>
                <div class="pbar" style="height: 6px">
                  <div class="pfill done" style="width: {(d.totalBytes / maxDomainBytes) * 100}%"></div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
