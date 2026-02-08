import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { selectStats, selectIsConnected } from '../store/statsSlice';
import { selectCompletedHistory, loadCompletedHistory } from '../store/downloadSlice';
import { formatBytes, formatSpeed } from '../lib/utils/format';
import type { AppDispatch } from '../store/store';
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

// Sub-components
function StatCard({ icon, label, value, comparison, subtitle }: {
  icon: string;
  label: string;
  value: string;
  comparison?: number | null;
  subtitle?: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-card-ghost-icon">
        <span className="material-symbols-outlined">{icon}</span>
      </div>
      <span className="stat-card-label">{label}</span>
      <span className="stat-card-value">{value}</span>
      {comparison != null && (
        <span className={`stat-card-badge ${comparison >= 0 ? 'positive' : 'negative'}`}>
          <span className="material-symbols-outlined">
            {comparison >= 0 ? 'trending_up' : 'trending_down'}
          </span>
          {Math.abs(comparison)}% vs last week
        </span>
      )}
      {subtitle && <span className="stat-card-subtitle">{subtitle}</span>}
    </div>
  );
}

function SessionInfoRow({ icon, iconClass, label, value }: {
  icon: string;
  iconClass: string;
  label: string;
  value: string;
}) {
  return (
    <div className="session-info-row">
      <span className={`material-symbols-outlined session-info-icon ${iconClass}`}>{icon}</span>
      <div className="session-info-body">
        <span className="session-info-label">{label}</span>
        <span className="session-info-value">{value}</span>
      </div>
    </div>
  );
}

const NetworkChart = React.memo(function NetworkChart({ samples, period }: {
  samples: SpeedSample[];
  period: ChartPeriod;
}) {
  const [hoverInfo, setHoverInfo] = useState<{
    clientX: number;
    clientY: number;
    speed: number;
    time: number;
    svgX: number;
    svgY: number;
  } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const filteredSamples = useMemo(() => {
    const now = Date.now();
    if (period === '5m') return samples.filter(s => s.time >= now - 5 * 60 * 1000);
    if (period === '30m') return samples.filter(s => s.time >= now - 30 * 60 * 1000);
    return samples;
  }, [samples, period]);

  const maxSpeed = useMemo(() => {
    if (filteredSamples.length === 0) return 1024;
    return Math.max(...filteredSamples.map(s => s.download));
  }, [filteredSamples]);

  const niceMax = getNiceMax(maxSpeed);

  const points = useMemo(() => {
    if (filteredSamples.length === 0) return [];
    return filteredSamples.map((s, i) => ({
      x: filteredSamples.length <= 1
        ? PLOT_LEFT + PLOT_WIDTH / 2
        : PLOT_LEFT + (i / (filteredSamples.length - 1)) * PLOT_WIDTH,
      y: PLOT_BOTTOM - (s.download / niceMax) * PLOT_HEIGHT,
    }));
  }, [filteredSamples, niceMax]);

  const linePath = useMemo(() => catmullRomToBezierPath(points), [points]);
  const fillPath = useMemo(() => {
    if (points.length < 2) return '';
    return linePath +
      ` L${points[points.length - 1].x.toFixed(1)},${PLOT_BOTTOM}` +
      ` L${points[0].x.toFixed(1)},${PLOT_BOTTOM} Z`;
  }, [linePath, points]);

  const yLabels = useMemo(() => {
    return [0, 0.25, 0.5, 0.75, 1].map(pct => ({
      pct,
      y: PLOT_BOTTOM - pct * PLOT_HEIGHT,
      label: formatSpeed(niceMax * pct),
    }));
  }, [niceMax]);

  const xLabels = useMemo(() => {
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
  }, [filteredSamples]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGRectElement>) => {
    if (filteredSamples.length < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const svgX = (relX / rect.width) * CHART_W;
    const dataX = svgX - PLOT_LEFT;
    const ratio = Math.max(0, Math.min(1, dataX / PLOT_WIDTH));
    const idx = Math.round(ratio * (filteredSamples.length - 1));
    const sample = filteredSamples[idx];
    if (!sample) return;
    const px = PLOT_LEFT + (idx / (filteredSamples.length - 1)) * PLOT_WIDTH;
    const py = PLOT_BOTTOM - (sample.download / niceMax) * PLOT_HEIGHT;
    setHoverInfo({
      clientX: e.clientX,
      clientY: e.clientY,
      speed: sample.download,
      time: sample.time,
      svgX: px,
      svgY: py,
    });
  }, [filteredSamples, niceMax]);

  const handleMouseLeave = useCallback(() => setHoverInfo(null), []);

  // Compute tooltip position relative to bodyRef
  const tooltipStyle = useMemo(() => {
    if (!hoverInfo || !bodyRef.current) return undefined;
    const rect = bodyRef.current.getBoundingClientRect();
    const xPct = (hoverInfo.svgX / CHART_W);
    const left = xPct * rect.width;
    return {
      left: `${left}px`,
      top: '8px',
      transform: left > rect.width * 0.75 ? 'translateX(-100%)' : 'translateX(0)',
    };
  }, [hoverInfo]);

  if (filteredSamples.length < 2) {
    return (
      <div className="stats-chart-body">
        <div className="chart-empty">
          <span className="material-symbols-outlined">show_chart</span>
          <span>Collecting data... Speed samples will appear here.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="stats-chart-body" ref={bodyRef}>
      <svg className="stats-chart-svg" viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Y-axis grid lines and labels */}
        {yLabels.map(({ pct, y, label }) => (
          <g key={pct}>
            <line
              x1={PLOT_LEFT} y1={y} x2={PLOT_LEFT + PLOT_WIDTH} y2={y}
              stroke="var(--border-primary)" strokeWidth="1"
              strokeDasharray={pct === 0 ? undefined : '4 4'}
            />
            <text x={PLOT_LEFT - 8} y={y + 4} textAnchor="end" fill="var(--text-muted)" fontSize="10"
              fontFamily="var(--font-mono)">
              {label}
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {xLabels.map(({ x, label }, i) => (
          <text key={i} x={x} y={PLOT_BOTTOM + 20} textAnchor="middle" fill="var(--text-muted)"
            fontSize="10" fontFamily="var(--font-mono)">
            {label}
          </text>
        ))}

        {/* Gradient fill */}
        {fillPath && <path d={fillPath} fill="url(#chartGradient)" />}

        {/* Line */}
        {linePath && (
          <path d={linePath} fill="none" stroke="var(--color-primary)" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" />
        )}

        {/* Hover elements */}
        {hoverInfo && (
          <>
            <line
              x1={hoverInfo.svgX} y1={PLOT_TOP} x2={hoverInfo.svgX} y2={PLOT_BOTTOM}
              stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="4 4" opacity="0.5"
            />
            <circle cx={hoverInfo.svgX} cy={hoverInfo.svgY} r="5" fill="var(--color-primary)"
              stroke="var(--bg-secondary)" strokeWidth="2" />
          </>
        )}

        {/* Invisible hover overlay */}
        <rect
          x={PLOT_LEFT} y={PLOT_TOP} width={PLOT_WIDTH} height={PLOT_HEIGHT}
          fill="transparent" style={{ cursor: 'crosshair' }}
          onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}
        />
      </svg>

      {hoverInfo && tooltipStyle && (
        <div className="chart-tooltip" style={tooltipStyle}>
          <span className="chart-tooltip-speed">{formatSpeed(hoverInfo.speed)}</span>
          <span className="chart-tooltip-time">
            {new Date(hoverInfo.time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
      )}
    </div>
  );
});

function TopDomainsPanel({ domains }: { domains: DomainStat[] }) {
  const maxBytes = domains.length > 0 ? domains[0].totalBytes : 1;

  return (
    <div className="stats-domains-panel">
      <h3>Top Domains</h3>
      {domains.length === 0 ? (
        <div className="stats-domains-empty">
          <span className="material-symbols-outlined">language</span>
          <p>No download history yet.</p>
        </div>
      ) : (
        <div className="stats-domains-list">
          {domains.map((d, i) => (
            <div key={d.domain} className="domain-row">
              <div className="domain-info">
                <span className="domain-name">{d.domain}</span>
                <span className="domain-size">{formatBytes(d.totalBytes)}</span>
              </div>
              <div className="domain-bar-track">
                <div
                  className="domain-bar-fill"
                  style={{
                    width: `${(d.totalBytes / maxBytes) * 100}%`,
                    backgroundColor: DOMAIN_COLORS[i % DOMAIN_COLORS.length],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Main component
export default function Statistics() {
  const dispatch = useDispatch<AppDispatch>();
  const stats = useSelector(selectStats);
  const isConnected = useSelector(selectIsConnected);
  const completedHistory = useSelector(selectCompletedHistory);

  const [renderTick, setRenderTick] = useState(0);
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('5m');

  // Session tracking refs
  const sessionStartTime = useRef(Date.now());
  const speedSamples = useRef<SpeedSample[]>([]);
  const peakDownloadSpeed = useRef(0);
  const totalUploadedBytes = useRef(0);
  const speedSumForAvg = useRef(0);
  const speedSampleCount = useRef(0);

  // Keep a ref to current stats to avoid stale closure
  const statsRef = useRef(stats);
  statsRef.current = stats;

  // Load completed history on mount
  useEffect(() => {
    dispatch(loadCompletedHistory());
  }, [dispatch]);

  // Sample speed every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const { downloadSpeed, uploadSpeed } = statsRef.current;
      const now = Date.now();

      speedSamples.current.push({ time: now, download: downloadSpeed, upload: uploadSpeed });

      // Track peak
      if (downloadSpeed > peakDownloadSpeed.current) {
        peakDownloadSpeed.current = downloadSpeed;
      }

      // Accumulate upload bytes (3s of upload at current speed)
      totalUploadedBytes.current += uploadSpeed * 3;

      // Track average
      speedSumForAvg.current += downloadSpeed;
      speedSampleCount.current += 1;

      // Prune samples older than 2 hours
      const twoHoursAgo = now - 2 * 60 * 60 * 1000;
      while (speedSamples.current.length > 0 && speedSamples.current[0].time < twoHoursAgo) {
        speedSamples.current.shift();
      }

      setRenderTick(t => t + 1);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // Derived: total downloaded from history
  const totalDownloaded = useMemo(() => {
    return completedHistory.reduce((sum, d) => sum + (d.completedSize || d.totalSize), 0);
  }, [completedHistory]);

  // Derived: weekly comparison
  const weeklyComparison = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun
    const startOfThisWeek = new Date(now);
    startOfThisWeek.setDate(now.getDate() - dayOfWeek);
    startOfThisWeek.setHours(0, 0, 0, 0);

    const startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

    let thisWeek = 0;
    let lastWeek = 0;
    for (const d of completedHistory) {
      const completed = new Date(d.completedAt || d.createdAt);
      if (completed >= startOfThisWeek) {
        thisWeek += d.completedSize || d.totalSize;
      } else if (completed >= startOfLastWeek) {
        lastWeek += d.completedSize || d.totalSize;
      }
    }

    if (lastWeek === 0) return null;
    return Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
  }, [completedHistory]);

  // Derived: top domains
  const topDomains = useMemo((): DomainStat[] => {
    const map = new Map<string, DomainStat>();
    for (const d of completedHistory) {
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
  }, [completedHistory]);

  // Session average speed
  const avgSpeed = speedSampleCount.current > 0
    ? speedSumForAvg.current / speedSampleCount.current
    : 0;

  // Force re-read on renderTick (these use refs so we read them in render)
  void renderTick;

  return (
    <div className="page">
      <div className="stats-header-bar">
        <div>
          <h2>Bandwidth Statistics</h2>
        </div>
        <span className="stats-subtitle">
          Session: {formatUptime(Date.now() - sessionStartTime.current)}
        </span>
      </div>

      <div className="stats-content">
        {/* Stat Cards */}
        <div className="stats-cards-row">
          <StatCard
            icon="download"
            label="Total Downloaded"
            value={formatBytes(totalDownloaded)}
            comparison={weeklyComparison}
          />
          <StatCard
            icon="upload"
            label="Session Uploaded"
            value={formatBytes(totalUploadedBytes.current)}
            subtitle="This session only"
          />
          <StatCard
            icon="speed"
            label="Average Speed"
            value={formatSpeed(avgSpeed)}
            subtitle="This session only"
          />
        </div>

        {/* Network Activity Chart */}
        <div className="stats-chart-panel">
          <div className="stats-chart-header">
            <div className="stats-chart-header-left">
              <h3>Network Activity</h3>
              <p>Download throughput over time</p>
            </div>
            <div className="stats-chart-period-toggle">
              {(['5m', '30m', 'session'] as ChartPeriod[]).map(p => (
                <button
                  key={p}
                  className={`period-btn${chartPeriod === p ? ' active' : ''}`}
                  onClick={() => setChartPeriod(p)}
                >
                  {p === '5m' ? '5 min' : p === '30m' ? '30 min' : 'Session'}
                </button>
              ))}
            </div>
          </div>
          <NetworkChart samples={[...speedSamples.current]} period={chartPeriod} />
        </div>

        {/* Bottom Row: Session Info + Top Domains */}
        <div className="stats-bottom-row">
          <div className="stats-session-panel">
            <h3>Session Info</h3>
            <div className="session-info-grid">
              <SessionInfoRow
                icon="schedule"
                iconClass="primary"
                label="Uptime"
                value={formatUptime(Date.now() - sessionStartTime.current)}
              />
              <SessionInfoRow
                icon="dynamic_feed"
                iconClass="success"
                label="Active Threads"
                value={`${stats.numActive} Active`}
              />
              <SessionInfoRow
                icon="bolt"
                iconClass="warning"
                label="Peak Speed"
                value={formatSpeed(peakDownloadSpeed.current)}
              />
              <div className="session-info-row">
                <span className="material-symbols-outlined session-info-icon primary">wifi</span>
                <div className="session-info-body">
                  <span className="session-info-label">Connection</span>
                  <div className="session-info-health">
                    <div className={`connection-indicator ${isConnected ? 'connected' : 'disconnected'}`} />
                    <span className="session-info-value">{isConnected ? 'Connected' : 'Disconnected'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <TopDomainsPanel domains={topDomains} />
        </div>
      </div>
    </div>
  );
}
