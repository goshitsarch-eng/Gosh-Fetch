<script lang="ts">
  let {
    on,
    onToggle,
    label,
  }: {
    on: boolean;
    onToggle: () => void;
    label?: string;
  } = $props();
</script>

<button class="switch" class:on onclick={onToggle} aria-pressed={on} aria-label={label}>
  <i></i>
</button>
