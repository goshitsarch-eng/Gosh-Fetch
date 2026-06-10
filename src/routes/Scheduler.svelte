<script lang="ts">
  import { api } from '../lib/api/commands';
  import Icon from '../lib/components/ui/Icon.svelte';
  import Switch from '../lib/components/ui/Switch.svelte';
  import Segmented from '../lib/components/ui/Segmented.svelte';
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

<div class="content page-fade">
  <div class="content-inner" style="max-width: 980px">
    <!-- Save bar -->
    <div class="sched-savebar">
      <span class="tag-label">Bandwidth schedule · weekly grid</span>
      <div class="toolbar-spacer"></div>
      {#if isDirty}
        <span class="sched-dirty">● Unsaved changes</span>
      {/if}
      <button class="btn btn-primary" onclick={handleSave} disabled={saving || !isDirty}>
        <Icon name="save" size={16} />
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>

    <!-- Grid card -->
    <div class="card">
      <div class="sched-toolbar">
        <span class="tag-label">Paint mode</span>
        <div class="chips">
          <button class="chip" class:active={paintMode === 'full'} onclick={() => (paintMode = 'full')}>
            <Icon name="bolt" size={14} /> Full speed
          </button>
          <button class="chip" class:active={paintMode === 'limited'} onclick={() => (paintMode = 'limited')}>
            <Icon name="speed" size={14} /> Limited
          </button>
          <button class="chip" class:active={paintMode === 'paused'} onclick={() => (paintMode = 'paused')}>
            <Icon name="pause" size={14} /> Paused
          </button>
        </div>
        <div class="toolbar-spacer"></div>
        <div class="sched-legend">
          <span><i class="cell-swatch full"></i>Full</span>
          <span><i class="cell-swatch limited"></i>Limited</span>
          <span><i class="cell-swatch paused"></i>Paused</span>
        </div>
        <button class="icon-btn" onclick={clearGrid} title="Clear grid" style="width: 32px; height: 32px">
          <Icon name="delete_sweep" size={17} />
        </button>
      </div>

      <div class="sched-grid-area" ontouchmove={handleTouchMove}>
        <div class="sched-time-labels">
          {#each TIME_LABELS as t (t)}
            <span>{t}</span>
          {/each}
        </div>
        {#each DAYS as day, dayIdx (day)}
          <div class="sched-day-row">
            <span class="sched-day-label">{day}</span>
            <div class="sched-cells">
              {#each Array.from({ length: 24 }, (_, h) => h) as hour (hour)}
                <div
                  class="sched-cell {grid[dayIdx][hour]}"
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

    <!-- Config -->
    <div class="section-h">Schedule configuration</div>
    <div class="card card-pad">
      <div class="set-row">
        <div class="set-info">
          <div class="t">Scheduled limit speed</div>
          <div class="d">Maximum download speed during "Limited" blocks</div>
        </div>
        <div class="set-control sched-limit">
          <div class="input-group" style="width: 130px">
            <input
              class="input mono"
              type="text"
              inputmode="numeric"
              value={limitSpeed}
              oninput={(e) => { limitSpeed = e.currentTarget.value; isDirty = true; }}
              aria-label="Scheduled limit speed"
            />
          </div>
          <Segmented
            value={limitUnit}
            options={[
              { v: 'KB/s', l: 'KB/s' },
              { v: 'MB/s', l: 'MB/s' },
            ]}
            onChange={(v) => { limitUnit = v as 'KB/s' | 'MB/s'; isDirty = true; }}
            label="Limit unit"
          />
        </div>
      </div>

      <div class="set-row">
        <div class="set-info">
          <div class="t">Start / stop based on schedule</div>
          <div class="d">Apply the weekly grid to all downloads</div>
        </div>
        <Switch
          on={scheduleEnabled}
          onToggle={() => { scheduleEnabled = !scheduleEnabled; isDirty = true; }}
          label="Enable schedule"
        />
      </div>

      <div class="set-row" class:row-disabled={!scheduleEnabled}>
        <div class="set-info">
          <div class="t">Force pause manual downloads</div>
          <div class="d">Paused blocks also pause downloads you started by hand</div>
        </div>
        <Switch
          on={forcePauseManual}
          onToggle={() => { if (scheduleEnabled) { forcePauseManual = !forcePauseManual; isDirty = true; } }}
          label="Force pause manual downloads"
        />
      </div>

      <div class="set-row" class:row-disabled={!scheduleEnabled}>
        <div class="set-info">
          <div class="t">On completion</div>
          <div class="d">Action when all scheduled downloads finish</div>
        </div>
        <div class="set-control">
          <select
            class="select"
            style="width: 190px"
            value={onCompletion}
            disabled={!scheduleEnabled}
            onchange={(e) => { onCompletion = e.currentTarget.value; isDirty = true; }}
            aria-label="On completion action"
          >
            <option value="nothing">Do nothing</option>
            <option value="close">Close Gosh-Fetch</option>
            <option value="sleep">Sleep computer</option>
            <option value="shutdown">Shutdown computer</option>
          </select>
        </div>
      </div>

      <div class="set-row" class:row-disabled={!scheduleEnabled}>
        <div class="set-info">
          <div class="t">Force close blocking apps</div>
          <div class="d">When shutting down, close apps that prevent it</div>
        </div>
        <Switch
          on={forceCloseApps}
          onToggle={() => { if (scheduleEnabled) { forceCloseApps = !forceCloseApps; isDirty = true; } }}
          label="Force close blocking apps"
        />
      </div>
    </div>

    <div class="sched-hint">
      <Icon name="lightbulb" fill size={19} style="color: var(--accent-strong); margin-top: 1px" />
      <div>
        Drag across the grid to paint rules. Rules apply globally across all active
        downloads. A "Limited" block uses the scheduled limit speed; a "Paused" block
        stops transfers entirely.
      </div>
    </div>
  </div>
</div>
