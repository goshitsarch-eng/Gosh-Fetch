<script lang="ts">
  import Icon from './Icon.svelte';

  let {
    value,
    min,
    max,
    step = 1,
    onChange,
    label,
  }: {
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (v: number) => void;
    label?: string;
  } = $props();
</script>

<div class="stepper" role="group" aria-label={label}>
  <button onclick={() => onChange(Math.max(min, value - step))} aria-label="Decrease">
    <Icon name="remove" size={17} />
  </button>
  <span class="val">{value}</span>
  <button onclick={() => onChange(Math.min(max, value + step))} aria-label="Increase">
    <Icon name="add" size={17} />
  </button>
</div>
