<script lang="ts">
  // Console status tag: square dot + tracked uppercase label.
  // Variants map to the .pill classes in App.css.
  export type PillVariant = 'active' | 'seed' | 'paused' | 'queued' | 'done' | 'error';

  let { variant, label }: { variant: PillVariant; label: string } = $props();
</script>

<span class="pill {variant}">
  <span class="pill-dot"></span>
  {label}
</span>
