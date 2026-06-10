<script lang="ts">
  import { stats } from '../../stores/stats.svelte';
  import { theme } from '../../stores/theme.svelte';

  // Live throughput oscilloscope: stepped area chart of download (signal)
  // and upload (lime) speeds, sampled from the stats store.
  const N = 170;
  const SAMPLE_MS = 360;
  // Auto-scale floor so an idle scope doesn't amplify noise (bytes/s).
  const MIN_SCALE = 50 * 1024;

  let canvasEl: HTMLCanvasElement | null = $state(null);

  // Plain (non-reactive) ring buffer — drawing is fully imperative.
  const buf: { d: number; u: number }[] = [];

  $effect(() => {
    // Re-run when theme or accent changes so colors are re-read from CSS.
    void theme.theme;
    void theme.accent;

    if (buf.length === 0) {
      for (let i = 0; i < N; i++) buf.push({ d: 0, u: 0 });
    }

    const cssVar = (n: string, fb: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
    const withA = (c: string, a: number) =>
      c.startsWith('#')
        ? c +
          Math.round(a * 255)
            .toString(16)
            .padStart(2, '0')
        : c.replace(/\)\s*$/, ` / ${a})`);

    const C = {
      sig: cssVar('--signal', '#ff5a1f'),
      lime: cssVar('--lime', '#c4f000'),
      grid: cssVar('--grid-line', 'rgba(0,0,0,.05)'),
    };

    const draw = () => {
      const canvas = canvasEl;
      if (!canvas) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const pad = 4;
      const maxV = Math.max(MIN_SCALE, ...buf.map((p) => Math.max(p.d, p.u))) * 1.18;
      const stepX = w / (buf.length - 1);
      const yOf = (v: number) => h - pad - (v / maxV) * (h - pad * 2);

      // horizontal grid
      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 3; i++) {
        const y = pad + ((h - pad * 2) / 3) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      // vertical ticks
      for (let i = 0; i < buf.length; i += 10) {
        const x = i * stepX;
        ctx.beginPath();
        ctx.moveTo(x, h - pad);
        ctx.lineTo(x, h - pad - 4);
        ctx.stroke();
      }

      // stepped area / line
      const area = (key: 'd' | 'u', color: string, fillArea: boolean) => {
        ctx.beginPath();
        ctx.moveTo(0, yOf(buf[0][key]));
        for (let i = 1; i < buf.length; i++) {
          const x = i * stepX;
          ctx.lineTo(x, yOf(buf[i - 1][key]));
          ctx.lineTo(x, yOf(buf[i][key]));
        }
        if (fillArea) {
          ctx.lineTo(w, h - pad);
          ctx.lineTo(0, h - pad);
          ctx.closePath();
          const g = ctx.createLinearGradient(0, 0, 0, h);
          g.addColorStop(0, withA(color, 0.3));
          g.addColorStop(1, withA(color, 0.02));
          ctx.fillStyle = g;
          ctx.fill();
        } else {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      };
      area('d', C.sig, true);
      area('d', C.sig, false);
      area('u', C.lime, false);

      // leading dot
      const lastD = buf[buf.length - 1].d;
      ctx.fillStyle = C.sig;
      ctx.fillRect(w - 3, yOf(lastD) - 1.5, 3, 3);
    };

    // Reading stats inside the interval callback keeps the effect itself
    // free of reactive deps on the speeds (we sample, not subscribe).
    const sample = setInterval(() => {
      buf.push({ d: stats.downloadSpeed, u: stats.uploadSpeed });
      if (buf.length > N) buf.shift();
      draw();
    }, SAMPLE_MS);

    draw();
    const ro = new ResizeObserver(draw);
    if (canvasEl) ro.observe(canvasEl);
    window.addEventListener('resize', draw);

    return () => {
      clearInterval(sample);
      ro.disconnect();
      window.removeEventListener('resize', draw);
    };
  });
</script>

<canvas bind:this={canvasEl} class="scope-canvas"></canvas>

<style>
  .scope-canvas {
    flex: 1;
    width: 100%;
    min-height: 0;
    display: block;
  }
</style>
