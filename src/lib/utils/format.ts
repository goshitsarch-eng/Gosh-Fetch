const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;
const TB = GB * 1024;

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes >= TB) return `${(bytes / TB).toFixed(2)} TB`;
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(2)} MB`;
  if (bytes >= KB) return `${(bytes / KB).toFixed(2)} KB`;
  return `${bytes} B`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec === 0) return '0 B/s';
  if (bytesPerSec >= GB) return `${(bytesPerSec / GB).toFixed(1)} GB/s`;
  if (bytesPerSec >= MB) return `${(bytesPerSec / MB).toFixed(1)} MB/s`;
  if (bytesPerSec >= KB) return `${(bytesPerSec / KB).toFixed(1)} KB/s`;
  return `${bytesPerSec} B/s`;
}

export function formatProgress(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

export function formatEta(bytesRemaining: number, speed: number): string {
  if (speed === 0 || bytesRemaining === 0) return '--';
  const seconds = Math.floor(bytesRemaining / speed);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return `${days}d ${hours}h`;
}

export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length < 2) return '';
  return parts[parts.length - 1].toLowerCase();
}

export function getDownloadTypeIcon(type: string): string {
  switch (type) {
    case 'torrent':
    case 'magnet':
      return 'magnet';
    case 'ftp':
      return 'folder';
    default:
      return 'download';
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'downloading': return 'var(--color-success)';
    case 'queued': return 'var(--color-info)';
    case 'stalled': return 'var(--color-warning)';
    case 'retrying': return 'var(--color-warning)';
    case 'active': return 'var(--color-success)';
    case 'waiting': return 'var(--color-info)';
    case 'paused': return 'var(--color-warning)';
    case 'completed':
    case 'complete': return 'var(--color-success)';
    case 'error':
    case 'removed': return 'var(--color-destructive)';
    default: return 'var(--text-muted)';
  }
}

export function getStatusText(status: string, downloadSpeed?: number): string {
  switch (status) {
    case 'active': return downloadSpeed && downloadSpeed > 0 ? 'Downloading' : 'Stalled';
    case 'waiting': return 'Queued';
    case 'paused': return 'Paused';
    case 'complete':
    case 'completed': return 'Completed';
    case 'error': return 'Error';
    case 'removed': return 'Removed';
    case 'downloading': return 'Downloading';
    case 'queued': return 'Queued';
    case 'stalled': return 'Stalled';
    case 'retrying': return 'Retrying';
    default: return status.charAt(0).toUpperCase() + status.slice(1);
  }
}
