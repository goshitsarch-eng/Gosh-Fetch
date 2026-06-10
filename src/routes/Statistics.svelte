<script lang="ts">
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

  const DOMAIN_COLORS = ['#137fec', '#a855f7', '#10b981', '#f97316', '#ec4899'];

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

  const PERIODS: ChartPeriod[] = ['5m', '30m', 'session'];

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
  <div class="stat-card">
    <div class="stat-card-ghost-icon">
      <span class="material-symbols-outlined">{icon}</span>
    </div>
    <span class="stat-card-label">{label}</span>
    <span class="stat-card-value">{value}</span>
    {#if comparison != null}
      <span class="stat-card-badge {comparison >= 0 ? 'positive' : 'negative'}">
        <span class="material-symbols-outlined">
          {comparison >= 0 ? 'trending_up' : 'trending_down'}
        </span>
        {Math.abs(comparison)}% vs last week
      </span>
    {/if}
    {#if subtitle}
      <span class="stat-card-subtitle">{subtitle}</span>
    {/if}
  </div>
{/snippet}

{#snippet sessionInfoRow(icon: string, iconClass: string, label: string, value: string)}
  <div class="session-info-row">
    <span class="material-symbols-outlined session-info-icon {iconClass}">{icon}</span>
    <div class="session-info-body">
      <span class="session-info-label">{label}</span>
      <span class="session-info-value">{value}</span>
    </div>
  </div>
{/snippet}

<div class="page">
  <div class="stats-header-bar">
    <div>
      <h2>Bandwidth Statistics</h2>
    </div>
    <span class="stats-subtitle">
      Session: {uptimeText}
    </span>
  </div>

  <div class="stats-content">
    <!-- Stat Cards -->
    <div class="stats-cards-row">
      {@render statCard('download', 'Total Downloaded', formatBytes(totalDownloaded), weeklyComparison)}
      {@render statCard('upload', 'Session Uploaded', formatBytes(totalUploadedBytes), null, 'This session only')}
      {@render statCard('speed', 'Average Speed', formatSpeed(avgSpeed), null, 'This session only')}
    </div>

    <!-- Network Activity Chart -->
    <div class="stats-chart-panel">
      <div class="stats-chart-header">
        <div class="stats-chart-header-left">
          <h3>Network Activity</h3>
          <p>Download throughput over time</p>
        </div>
        <div class="stats-chart-period-toggle">
          {#each PERIODS as p (p)}
            <button
              class="period-btn{chartPeriod === p ? ' active' : ''}"
              onclick={() => (chartPeriod = p)}
            >
              {p === '5m' ? '5 min' : p === '30m' ? '30 min' : 'Session'}
            </button>
          {/each}
        </div>
      </div>

      {#if filteredSamples.length < 2}
        <div class="stats-chart-body">
          <div class="chart-empty">
            <span class="material-symbols-outlined">show_chart</span>
            <span>Collecting data... Speed samples will appear here.</span>
          </div>
        </div>
      {:else}
        <div class="stats-chart-body" bind:this={bodyEl}>
          <svg class="stats-chart-svg" viewBox="0 0 {CHART_W} {CHART_H}" preserveAspectRatio="xMidYMid meet">
            <defs>
              <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stop-color="var(--color-primary)" stop-opacity="0.3" />
                <stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0.02" />
              </linearGradient>
            </defs>

            <!-- Y-axis grid lines and labels -->
            {#each yLabels as { pct, y, label } (pct)}
              <g>
                <line
                  x1={PLOT_LEFT} y1={y} x2={PLOT_LEFT + PLOT_WIDTH} y2={y}
                  stroke="var(--border-primary)" stroke-width="1"
                  stroke-dasharray={pct === 0 ? undefined : '4 4'}
                />
                <text x={PLOT_LEFT - 8} y={y + 4} text-anchor="end" fill="var(--text-muted)" font-size="10"
                  font-family="var(--font-mono)">
                  {label}
                </text>
              </g>
            {/each}

            <!-- X-axis labels -->
            {#each xLabels as { x, label }, i (i)}
              <text {x} y={PLOT_BOTTOM + 20} text-anchor="middle" fill="var(--text-muted)"
                font-size="10" font-family="var(--font-mono)">
                {label}
              </text>
            {/each}

            <!-- Gradient fill -->
            {#if fillPath}
              <path d={fillPath} fill="url(#chartGradient)" />
            {/if}

            <!-- Line -->
            {#if linePath}
              <path d={linePath} fill="none" stroke="var(--color-primary)" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round" />
            {/if}

            <!-- Hover elements -->
            {#if hoverInfo}
              <line
                x1={hoverInfo.svgX} y1={PLOT_TOP} x2={hoverInfo.svgX} y2={PLOT_BOTTOM}
                stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="4 4" opacity="0.5"
              />
              <circle cx={hoverInfo.svgX} cy={hoverInfo.svgY} r="5" fill="var(--color-primary)"
                stroke="var(--bg-secondary)" stroke-width="2" />
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

    <!-- Bottom Row: Session Info + Top Domains -->
    <div class="stats-bottom-row">
      <div class="stats-session-panel">
        <h3>Session Info</h3>
        <div class="session-info-grid">
          {@render sessionInfoRow('schedule', 'primary', 'Uptime', uptimeText)}
          {@render sessionInfoRow('dynamic_feed', 'success', 'Active Threads', `${stats.numActive} Active`)}
          {@render sessionInfoRow('bolt', 'warning', 'Peak Speed', formatSpeed(peakDownloadSpeed))}
          <div class="session-info-row">
            <span class="material-symbols-outlined session-info-icon primary">wifi</span>
            <div class="session-info-body">
              <span class="session-info-label">Connection</span>
              <div class="session-info-health">
                <div class="connection-indicator {stats.isConnected ? 'connected' : 'disconnected'}"></div>
                <span class="session-info-value">{stats.isConnected ? 'Connected' : 'Disconnected'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="stats-domains-panel">
        <h3>Top Domains</h3>
        {#if topDomains.length === 0}
          <div class="stats-domains-empty">
            <span class="material-symbols-outlined">language</span>
            <p>No download history yet.</p>
          </div>
        {:else}
          <div class="stats-domains-list">
            {#each topDomains as d, i (d.domain)}
              <div class="domain-row">
                <div class="domain-info">
                  <span class="domain-name">{d.domain}</span>
                  <span class="domain-size">{formatBytes(d.totalBytes)}</span>
                </div>
                <div class="domain-bar-track">
                  <div
                    class="domain-bar-fill"
                    style="width: {(d.totalBytes / maxDomainBytes) * 100}%; background-color: {DOMAIN_COLORS[i % DOMAIN_COLORS.length]}"
                  ></div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
