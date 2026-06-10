<script lang="ts">
  import { stats } from '../../stores/stats.svelte';
  import { formatSpeed } from '../../utils/format';
  import './StatusBar.css';
</script>

<footer class="status-bar">
  <div class="status-left">
    <div class="status-speed download">
      <span class="material-symbols-outlined">download</span>
      <span class="status-speed-value">{formatSpeed(stats.downloadSpeed)}</span>
    </div>
    <div class="status-speed upload">
      <span class="material-symbols-outlined">upload</span>
      <span class="status-speed-value">{formatSpeed(stats.uploadSpeed)}</span>
    </div>
  </div>
  <div class="status-right">
    <div class="status-connection {stats.isConnected ? 'online' : 'offline'}">
      <span class="connection-dot"></span>
      <span>{stats.isConnected ? 'Online' : 'Offline'}</span>
    </div>
  </div>
</footer>
