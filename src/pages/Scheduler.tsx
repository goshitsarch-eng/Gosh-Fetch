import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import './Scheduler.css';

type CellMode = 'full' | 'limited' | 'paused';
type Grid = CellMode[][];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const TIME_LABELS = ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00', '24:00'];

// chrono Weekday serializes as full name
const DAY_TO_CHRONO: Record<string, string> = {
  Mon: 'Mon', Tue: 'Tue', Wed: 'Wed', Thu: 'Thu', Fri: 'Fri', Sat: 'Sat', Sun: 'Sun',
};

interface ScheduleRule {
  start_hour: number;
  end_hour: number;
  days: string[];
  download_limit: number | null;
  upload_limit: number | null;
}

function createEmptyGrid(): Grid {
  return Array.from({ length: 7 }, () => Array(24).fill('full'));
}

function rulesToGrid(rules: ScheduleRule[]): Grid {
  const grid = createEmptyGrid();
  for (const rule of rules) {
    const targetDays = rule.days.length === 0
      ? [0, 1, 2, 3, 4, 5, 6]
      : rule.days.map(d => DAYS.indexOf(d as typeof DAYS[number])).filter(i => i >= 0);

    let mode: CellMode = 'full';
    if (rule.download_limit === 0) mode = 'paused';
    else if (rule.download_limit != null && rule.download_limit > 0) mode = 'limited';

    for (const dayIdx of targetDays) {
      if (rule.start_hour <= rule.end_hour) {
        for (let h = rule.start_hour; h <= rule.end_hour; h++) {
          grid[dayIdx][h] = mode;
        }
      } else {
        for (let h = rule.start_hour; h < 24; h++) grid[dayIdx][h] = mode;
        for (let h = 0; h <= rule.end_hour; h++) grid[dayIdx][h] = mode;
      }
    }
  }
  return grid;
}

function gridToRules(grid: Grid, limitBytes: number): ScheduleRule[] {
  const rules: ScheduleRule[] = [];
  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    let h = 0;
    while (h < 24) {
      const mode = grid[dayIdx][h];
      if (mode === 'full') { h++; continue; }
      const start = h;
      while (h < 24 && grid[dayIdx][h] === mode) h++;
      const end = h - 1;
      rules.push({
        start_hour: start,
        end_hour: end,
        days: [DAY_TO_CHRONO[DAYS[dayIdx]]],
        download_limit: mode === 'paused' ? 0 : limitBytes,
        upload_limit: null,
      });
    }
  }
  return rules;
}

const STORAGE_KEY = 'gosh-fetch-scheduler-prefs';

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function savePrefs(prefs: Record<string, any>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export default function Scheduler() {
  const [grid, setGrid] = useState<Grid>(createEmptyGrid);
  const [paintMode, setPaintMode] = useState<CellMode>('full');
  const isPainting = useRef(false);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [limitSpeed, setLimitSpeed] = useState('2048');
  const [limitUnit, setLimitUnit] = useState<'KB/s' | 'MB/s'>('KB/s');
  const [scheduleEnabled, setScheduleEnabled] = useState(true);
  const [forcePauseManual, setForcePauseManual] = useState(false);
  const [onCompletion, setOnCompletion] = useState('nothing');
  const [forceCloseApps, setForceCloseApps] = useState(false);

  // Load data
  useEffect(() => {
    const prefs = loadPrefs();
    if (prefs.limitSpeed != null) setLimitSpeed(String(prefs.limitSpeed));
    if (prefs.limitUnit) setLimitUnit(prefs.limitUnit);
    if (prefs.scheduleEnabled != null) setScheduleEnabled(prefs.scheduleEnabled);
    if (prefs.forcePauseManual != null) setForcePauseManual(prefs.forcePauseManual);
    if (prefs.onCompletion) setOnCompletion(prefs.onCompletion);
    if (prefs.forceCloseApps != null) setForceCloseApps(prefs.forceCloseApps);

    api.getScheduleRules().then((rules: ScheduleRule[]) => {
      if (rules && rules.length > 0) {
        setGrid(rulesToGrid(rules));
      }
    }).catch(() => {});
  }, []);

  // Stop painting on mouseup anywhere
  useEffect(() => {
    const stop = () => { isPainting.current = false; };
    document.addEventListener('mouseup', stop);
    document.addEventListener('touchend', stop);
    return () => {
      document.removeEventListener('mouseup', stop);
      document.removeEventListener('touchend', stop);
    };
  }, []);

  const paintCell = useCallback((day: number, hour: number) => {
    setGrid(prev => {
      if (prev[day][hour] === paintMode) return prev;
      const next = prev.map(row => [...row]);
      next[day][hour] = paintMode;
      return next;
    });
    setIsDirty(true);
  }, [paintMode]);

  function handleMouseDown(day: number, hour: number, e: React.MouseEvent) {
    e.preventDefault();
    isPainting.current = true;
    paintCell(day, hour);
  }

  function handleMouseEnter(day: number, hour: number) {
    if (isPainting.current) paintCell(day, hour);
  }

  function handleTouchStart(day: number, hour: number, e: React.TouchEvent) {
    e.preventDefault();
    isPainting.current = true;
    paintCell(day, hour);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!isPainting.current) return;
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (el && el.hasAttribute('data-cell')) {
      const [d, h] = el.getAttribute('data-cell')!.split(',').map(Number);
      paintCell(d, h);
    }
  }

  function clearGrid() {
    setGrid(createEmptyGrid());
    setIsDirty(true);
  }

  function getLimitBytes(): number {
    const num = parseInt(limitSpeed, 10) || 0;
    return limitUnit === 'MB/s' ? num * 1048576 : num * 1024;
  }

  async function handleSave() {
    setSaving(true);
    try {
      const rules = gridToRules(grid, getLimitBytes());
      await api.setScheduleRules(rules);
      savePrefs({
        limitSpeed: parseInt(limitSpeed, 10) || 2048,
        limitUnit,
        scheduleEnabled,
        forcePauseManual,
        onCompletion,
        forceCloseApps,
      });
      setIsDirty(false);
    } catch (e) {
      console.error('Failed to save schedule:', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      {/* Header bar */}
      <div className="scheduler-header-bar">
        <h2>Download Scheduler</h2>
        <button
          className="scheduler-save-btn"
          onClick={handleSave}
          disabled={saving || !isDirty}
        >
          <span className="material-symbols-outlined">save</span>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="scheduler-content">
        {/* Description + Legend */}
        <div className="scheduler-description">
          <div>
            <h3>Weekly Grid</h3>
            <p>
              Drag across the grid to set download rules. Blue blocks indicate full speed,
              striped blocks are speed-limited, and dark blocks pause all downloads.
            </p>
          </div>
          <div className="scheduler-legend">
            <div className="legend-pill">
              <div className="legend-dot full" />
              <span>Full Speed</span>
            </div>
            <div className="legend-pill">
              <div className="legend-dot limited" />
              <span>Limited</span>
            </div>
            <div className="legend-pill">
              <div className="legend-dot paused" />
              <span>Paused</span>
            </div>
          </div>
        </div>

        {/* Grid Container */}
        <div className="scheduler-grid-container">
          {/* Toolbar */}
          <div className="scheduler-toolbar">
            <div className="scheduler-toolbar-left">
              <span>Paint Mode:</span>
              <div className="paint-mode-group">
                <button
                  className={`paint-btn${paintMode === 'full' ? ' active' : ''}`}
                  onClick={() => setPaintMode('full')}
                >
                  <span className="material-symbols-outlined">bolt</span>
                  Full Speed
                </button>
                <button
                  className={`paint-btn${paintMode === 'limited' ? ' active' : ''}`}
                  onClick={() => setPaintMode('limited')}
                >
                  <span className="material-symbols-outlined">speed</span>
                  Limited
                </button>
                <button
                  className={`paint-btn${paintMode === 'paused' ? ' active' : ''}`}
                  onClick={() => setPaintMode('paused')}
                >
                  <span className="material-symbols-outlined">pause</span>
                  Paused
                </button>
              </div>
            </div>
            <button className="clear-grid-btn" onClick={clearGrid} title="Clear Grid">
              <span className="material-symbols-outlined">delete_sweep</span>
            </button>
          </div>

          {/* Grid */}
          <div className="scheduler-grid-area" onTouchMove={handleTouchMove}>
            <div className="scheduler-grid-inner">
              <div className="scheduler-time-labels">
                {TIME_LABELS.map(t => <span key={t}>{t}</span>)}
              </div>
              <div className="scheduler-days">
                {DAYS.map((day, dayIdx) => (
                  <div className="scheduler-day-row" key={day}>
                    <span className="scheduler-day-label">{day}</span>
                    <div className="scheduler-cells">
                      {Array.from({ length: 24 }, (_, hour) => (
                        <div
                          key={hour}
                          className={`scheduler-cell ${grid[dayIdx][hour]}`}
                          data-cell={`${dayIdx},${hour}`}
                          onMouseDown={(e) => handleMouseDown(dayIdx, hour, e)}
                          onMouseEnter={() => handleMouseEnter(dayIdx, hour)}
                          onTouchStart={(e) => handleTouchStart(dayIdx, hour, e)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Config Cards */}
        <div className="scheduler-config-grid">
          {/* Scheduled Limit Speed */}
          <div className="scheduler-config-card">
            <div className="scheduler-config-card-inner">
              <div className="scheduler-config-icon">
                <span className="material-symbols-outlined">speed</span>
              </div>
              <div className="scheduler-config-body">
                <h4>Scheduled Limit Speed</h4>
                <p>Maximum download speed applied during "Limited" blocks.</p>
                <div className="speed-input-row">
                  <div className="speed-input-wrapper">
                    <input
                      type="text"
                      value={limitSpeed}
                      onChange={(e) => { setLimitSpeed(e.target.value); setIsDirty(true); }}
                      inputMode="numeric"
                    />
                    <span className="speed-input-suffix">{limitUnit}</span>
                  </div>
                  <div className="speed-unit-group">
                    <button
                      className={`speed-unit-btn${limitUnit === 'KB/s' ? ' active' : ''}`}
                      onClick={() => { setLimitUnit('KB/s'); setIsDirty(true); }}
                    >KB/s</button>
                    <button
                      className={`speed-unit-btn${limitUnit === 'MB/s' ? ' active' : ''}`}
                      onClick={() => { setLimitUnit('MB/s'); setIsDirty(true); }}
                    >MB/s</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Schedule Logic */}
          <div className="scheduler-config-card">
            <div className="scheduler-config-card-inner">
              <div className="scheduler-config-icon">
                <span className="material-symbols-outlined">toggle_on</span>
              </div>
              <div className="scheduler-config-body">
                <h4>Schedule Logic</h4>
                <p>Control how the scheduler interacts with manual actions.</p>
                <div className="scheduler-toggle-row">
                  <span>Start/Stop based on schedule</span>
                  <label className="scheduler-toggle">
                    <input
                      type="checkbox"
                      checked={scheduleEnabled}
                      onChange={(e) => { setScheduleEnabled(e.target.checked); setIsDirty(true); }}
                    />
                    <div className="toggle-track" />
                    <div className="toggle-thumb" />
                  </label>
                </div>
                <div className={`scheduler-toggle-row${!forcePauseManual ? ' disabled' : ''}`}>
                  <span>Force pause manual downloads</span>
                  <label className="scheduler-toggle">
                    <input
                      type="checkbox"
                      checked={forcePauseManual}
                      onChange={(e) => { setForcePauseManual(e.target.checked); setIsDirty(true); }}
                    />
                    <div className="toggle-track" />
                    <div className="toggle-thumb" />
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* On Completion */}
          <div className="scheduler-config-card">
            <div className="scheduler-config-card-inner">
              <div className="scheduler-config-icon">
                <span className="material-symbols-outlined">power_settings_new</span>
              </div>
              <div className="scheduler-config-body">
                <h4>On Completion</h4>
                <p>Action to perform when all scheduled downloads finish.</p>
                <div className="scheduler-select-wrapper">
                  <select
                    value={onCompletion}
                    onChange={(e) => { setOnCompletion(e.target.value); setIsDirty(true); }}
                  >
                    <option value="nothing">Do nothing</option>
                    <option value="close">Close Gosh-Fetch</option>
                    <option value="sleep">Sleep Computer</option>
                    <option value="shutdown">Shutdown Computer</option>
                  </select>
                  <div className="scheduler-select-chevron">
                    <span className="material-symbols-outlined">expand_more</span>
                  </div>
                </div>
                <div className="scheduler-checkbox-row">
                  <input
                    type="checkbox"
                    id="force-close"
                    checked={forceCloseApps}
                    onChange={(e) => { setForceCloseApps(e.target.checked); setIsDirty(true); }}
                  />
                  <label htmlFor="force-close">Force close blocking apps</label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
