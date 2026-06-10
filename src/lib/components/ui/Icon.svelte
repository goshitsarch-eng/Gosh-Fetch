<script lang="ts">
  interface Props {
    name: string;
    fill?: boolean;
    size?: number;
    style?: string;
    class?: string;
  }

  let { name, fill = false, size, style = '', class: className = '' }: Props = $props();

  const fullStyle = $derived(size ? `font-size: ${size}px; ${style}` : style);
</script>

<span class="ms {fill ? 'fill' : ''} {className}" style={fullStyle}>{name}</span>
