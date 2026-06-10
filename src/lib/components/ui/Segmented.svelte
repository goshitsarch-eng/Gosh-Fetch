<script lang="ts">
  interface Option {
    v: string;
    l: string;
  }

  let {
    value,
    options,
    onChange,
    label,
  }: {
    value: string;
    options: Option[];
    onChange: (v: string) => void;
    label?: string;
  } = $props();
</script>

<div class="seg-ctrl" role="group" aria-label={label}>
  {#each options as o (o.v)}
    <button class:on={value === o.v} onclick={() => onChange(o.v)}>{o.l}</button>
  {/each}
</div>
