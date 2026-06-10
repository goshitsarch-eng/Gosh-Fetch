<script lang="ts">
  import { api } from '../lib/api/commands';
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
        : rule.days.map((d) => DAYS.indexOf(d as typeof DAYS[number])).filter((i) => i >= 0);

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

  let grid = $state<Grid>(createEmptyGrid());
  let paintMode = $state<CellMode>('full');
  let isPainting = false;
  let isDirty = $state(false);
  let saving = $state(false);

  let limitSpeed = $state('2048');
  let limitUnit = $state<'KB/s' | 'MB/s'>('KB/s');
  let scheduleEnabled = $state(true);
  let forcePauseManual = $state(false);
  let onCompletion = $state('nothing');
  let forceCloseApps = $state(false);

  // Load data
  $effect(() => {
    const prefs = loadPrefs();
    if (prefs.limitSpeed != null) limitSpeed = String(prefs.limitSpeed);
    if (prefs.limitUnit) limitUnit = prefs.limitUnit;
    if (prefs.scheduleEnabled != null) scheduleEnabled = prefs.scheduleEnabled;
    if (prefs.forcePauseManual != null) forcePauseManual = prefs.forcePauseManual;
    if (prefs.onCompletion) onCompletion = prefs.onCompletion;
    if (prefs.forceCloseApps != null) forceCloseApps = prefs.forceCloseApps;

    api.getScheduleRules().then((rules: ScheduleRule[]) => {
      if (rules && rules.length > 0) {
        grid = rulesToGrid(rules);
      }
    }).catch(() => {});
  });

  // Stop painting on mouseup anywhere
  $effect(() => {
    const stop = () => { isPainting = false; };
    document.addEventListener('mouseup', stop);
    document.addEventListener('touchend', stop);
    return () => {
      document.removeEventListener('mouseup', stop);
      document.removeEventListener('touchend', stop);
    };
  });

  function paintCell(day: number, hour: number) {
    if (grid[day][hour] !== paintMode) {
      grid[day][hour] = paintMode;
    }
    isDirty = true;
  }

  function handleMouseDown(day: number, hour: number, e: MouseEvent) {
    e.preventDefault();
    isPainting = true;
    paintCell(day, hour);
  }

  function handleMouseEnter(day: number, hour: number) {
    if (isPainting) paintCell(day, hour);
  }

  function handleTouchStart(day: number, hour: number, e: TouchEvent) {
    e.preventDefault();
    isPainting = true;
    paintCell(day, hour);
  }

  function handleTouchMove(e: TouchEvent) {
    if (!isPainting) return;
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (el && el.hasAttribute('data-cell')) {
      const [d, h] = el.getAttribute('data-cell')!.split(',').map(Number);
      paintCell(d, h);
    }
  }

  function clearGrid() {
    grid = createEmptyGrid();
    isDirty = true;
  }

  function getLimitBytes(): number {
    const num = parseInt(limitSpeed, 10) || 0;
    return limitUnit === 'MB/s' ? num * 1048576 : num * 1024;
  }

  async function handleSave() {
    saving = true;
    try {
      const rules = scheduleEnabled ? gridToRules(grid, getLimitBytes()) : [];
      await api.setScheduleRules(rules);
      savePrefs({
        limitSpeed: parseInt(limitSpeed, 10) || 2048,
        limitUnit,
        scheduleEnabled,
        forcePauseManual,
        onCompletion,
        forceCloseApps,
      });
      isDirty = false;
    } catch (e) {
      console.error('Failed to save schedule:', e);
    } finally {
      saving = false;
    }
  }
</script>

<div class="page">
  <!-- Header bar -->
  <div class="scheduler-header-bar">
    <h2>Download Scheduler</h2>
    <button
      class="scheduler-save-btn"
      onclick={handleSave}
      disabled={saving || !isDirty}
    >
      <span class="material-symbols-outlined">save</span>
      {saving ? 'Saving...' : 'Save Changes'}
    </button>
  </div>

  <div class="scheduler-content">
    <!-- Description + Legend -->
    <div class="scheduler-description">
      <div>
        <h3>Weekly Grid</h3>
        <p>
          Drag across the grid to set download rules. Blue blocks indicate full speed,
          striped blocks are speed-limited, and dark blocks pause all downloads.
        </p>
      </div>
      <div class="scheduler-legend">
        <div class="legend-pill">
          <div class="legend-dot full"></div>
          <span>Full Speed</span>
        </div>
        <div class="legend-pill">
          <div class="legend-dot limited"></div>
          <span>Limited</span>
        </div>
        <div class="legend-pill">
          <div class="legend-dot paused"></div>
          <span>Paused</span>
        </div>
      </div>
    </div>

    <!-- Grid Container -->
    <div class="scheduler-grid-container">
      <!-- Toolbar -->
      <div class="scheduler-toolbar">
        <div class="scheduler-toolbar-left">
          <span>Paint Mode:</span>
          <div class="paint-mode-group">
            <button
              class="paint-btn{paintMode === 'full' ? ' active' : ''}"
              onclick={() => (paintMode = 'full')}
            >
              <span class="material-symbols-outlined">bolt</span>
              Full Speed
            </button>
            <button
              class="paint-btn{paintMode === 'limited' ? ' active' : ''}"
              onclick={() => (paintMode = 'limited')}
            >
              <span class="material-symbols-outlined">speed</span>
              Limited
            </button>
            <button
              class="paint-btn{paintMode === 'paused' ? ' active' : ''}"
              onclick={() => (paintMode = 'paused')}
            >
              <span class="material-symbols-outlined">pause</span>
              Paused
            </button>
          </div>
        </div>
        <button class="clear-grid-btn" onclick={clearGrid} title="Clear Grid">
          <span class="material-symbols-outlined">delete_sweep</span>
        </button>
      </div>

      <!-- Grid -->
      <div class="scheduler-grid-area" ontouchmove={handleTouchMove}>
        <div class="scheduler-grid-inner">
          <div class="scheduler-time-labels">
            {#each TIME_LABELS as t (t)}
              <span>{t}</span>
            {/each}
          </div>
          <div class="scheduler-days">
            {#each DAYS as day, dayIdx (day)}
              <div class="scheduler-day-row">
                <span class="scheduler-day-label">{day}</span>
                <div class="scheduler-cells">
                  {#each Array.from({ length: 24 }, (_, h) => h) as hour (hour)}
                    <div
                      class="scheduler-cell {grid[dayIdx][hour]}"
                      data-cell="{dayIdx},{hour}"
                      role="presentation"
                      onmousedown={(e) => handleMouseDown(dayIdx, hour, e)}
                      onmouseenter={() => handleMouseEnter(dayIdx, hour)}
                      ontouchstart={(e) => handleTouchStart(dayIdx, hour, e)}
                    ></div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>

    <!-- Config Cards -->
    <div class="scheduler-config-grid">
      <!-- Scheduled Limit Speed -->
      <div class="scheduler-config-card">
        <div class="scheduler-config-card-inner">
          <div class="scheduler-config-icon">
            <span class="material-symbols-outlined">speed</span>
          </div>
          <div class="scheduler-config-body">
            <h4>Scheduled Limit Speed</h4>
            <p>Maximum download speed applied during "Limited" blocks.</p>
            <div class="speed-input-row">
              <div class="speed-input-wrapper">
                <input
                  type="text"
                  value={limitSpeed}
                  oninput={(e) => { limitSpeed = e.currentTarget.value; isDirty = true; }}
                  inputmode="numeric"
                />
                <span class="speed-input-suffix">{limitUnit}</span>
              </div>
              <div class="speed-unit-group">
                <button
                  class="speed-unit-btn{limitUnit === 'KB/s' ? ' active' : ''}"
                  onclick={() => { limitUnit = 'KB/s'; isDirty = true; }}
                >KB/s</button>
                <button
                  class="speed-unit-btn{limitUnit === 'MB/s' ? ' active' : ''}"
                  onclick={() => { limitUnit = 'MB/s'; isDirty = true; }}
                >MB/s</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Schedule Logic -->
      <div class="scheduler-config-card">
        <div class="scheduler-config-card-inner">
          <div class="scheduler-config-icon">
            <span class="material-symbols-outlined">toggle_on</span>
          </div>
          <div class="scheduler-config-body">
            <h4>Schedule Logic</h4>
            <p>Control how the scheduler interacts with manual actions.</p>
            <div class="scheduler-toggle-row">
              <span>Start/Stop based on schedule</span>
              <label class="scheduler-toggle">
                <input
                  type="checkbox"
                  checked={scheduleEnabled}
                  onchange={(e) => { scheduleEnabled = e.currentTarget.checked; isDirty = true; }}
                />
                <div class="toggle-track"></div>
                <div class="toggle-thumb"></div>
              </label>
            </div>
            <div class="scheduler-toggle-row{!scheduleEnabled ? ' disabled' : ''}">
              <span>Force pause manual downloads</span>
              <label class="scheduler-toggle">
                <input
                  type="checkbox"
                  checked={forcePauseManual}
                  disabled={!scheduleEnabled}
                  onchange={(e) => { forcePauseManual = e.currentTarget.checked; isDirty = true; }}
                />
                <div class="toggle-track"></div>
                <div class="toggle-thumb"></div>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- On Completion -->
      <div class="scheduler-config-card">
        <div class="scheduler-config-card-inner">
          <div class="scheduler-config-icon">
            <span class="material-symbols-outlined">power_settings_new</span>
          </div>
          <div class="scheduler-config-body">
            <h4>On Completion</h4>
            <p>Action to perform when all scheduled downloads finish.</p>
            <div class="scheduler-select-wrapper">
              <select
                value={onCompletion}
                disabled={!scheduleEnabled}
                onchange={(e) => { onCompletion = e.currentTarget.value; isDirty = true; }}
              >
                <option value="nothing">Do nothing</option>
                <option value="close">Close Gosh-Fetch</option>
                <option value="sleep">Sleep Computer</option>
                <option value="shutdown">Shutdown Computer</option>
              </select>
              <div class="scheduler-select-chevron">
                <span class="material-symbols-outlined">expand_more</span>
              </div>
            </div>
            <div class="scheduler-checkbox-row">
              <input
                type="checkbox"
                id="force-close"
                checked={forceCloseApps}
                disabled={!scheduleEnabled}
                onchange={(e) => { forceCloseApps = e.currentTarget.checked; isDirty = true; }}
              />
              <label for="force-close">Force close blocking apps</label>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
