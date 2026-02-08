export type DownloadType = 'http' | 'torrent' | 'magnet';

export type DownloadState = 'active' | 'waiting' | 'paused' | 'complete' | 'error' | 'removed';

export type AppDownloadStateType = 'queued' | 'downloading' | 'stalled' | 'paused' | 'completed' | 'error' | 'retrying';

export type ErrorKind =
  | 'network_error'
  | 'file_error'
  | 'not_found'
  | 'timeout'
  | 'auth_required'
  | 'already_exists'
  | 'resume_not_supported'
  | 'unknown';

export interface AppDownloadState {
  state: AppDownloadStateType;
  kind?: ErrorKind;
  message?: string;
  attempt?: number;
  maxAttempts?: number;
}

export interface Download {
  id: number;
  gid: string;
  name: string;
  url: string | null;
  magnetUri: string | null;
  infoHash: string | null;
  downloadType: DownloadType;
  status: DownloadState;
  appState?: AppDownloadState;
  totalSize: number;
  completedSize: number;
  downloadSpeed: number;
  uploadSpeed: number;
  savePath: string;
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  connections: number;
  seeders: number;
  selectedFiles: number[] | null;
}

export function getStatusText(download: Download): string {
  if (download.appState) {
    switch (download.appState.state) {
      case 'queued': return 'Queued';
      case 'downloading': return 'Downloading';
      case 'stalled': return 'Stalled';
      case 'paused': return 'Paused';
      case 'completed': return 'Completed';
      case 'error': return download.appState.message || 'Error';
      case 'retrying': return `Retrying (${download.appState.attempt}/${download.appState.maxAttempts})`;
      default: return 'Unknown';
    }
  }
  switch (download.status) {
    case 'active': return download.downloadSpeed > 0 ? 'Downloading' : 'Stalled';
    case 'waiting': return 'Queued';
    case 'paused': return 'Paused';
    case 'complete': return 'Completed';
    case 'error': return download.errorMessage || 'Error';
    case 'removed': return 'Removed';
    default: return 'Unknown';
  }
}

export function getStatusColor(download: Download): string {
  const state = download.appState?.state || download.status;
  switch (state) {
    case 'downloading':
    case 'active':
      return 'text-green-500';
    case 'queued':
    case 'waiting':
      return 'text-yellow-500';
    case 'stalled':
      return 'text-orange-500';
    case 'paused':
      return 'text-gray-500';
    case 'completed':
    case 'complete':
      return 'text-blue-500';
    case 'error':
    case 'removed':
      return 'text-red-500';
    case 'retrying':
      return 'text-orange-500';
    default:
      return 'text-gray-400';
  }
}

export interface DownloadOptions {
  dir?: string;
  out?: string;
  split?: string;
  maxConnectionPerServer?: string;
  userAgent?: string;
  referer?: string;
  header?: string[];
  selectFile?: string;
  btTracker?: string;
  seedRatio?: string;
  maxDownloadLimit?: string;
  maxUploadLimit?: string;
  priority?: string;
  checksum?: string;
  mirrors?: string[];
  sequential?: boolean;
}

export interface TorrentFile {
  index: number;
  path: string;
  length: number;
  selected: boolean;
}

export interface TorrentInfo {
  name: string;
  infoHash: string;
  totalSize: number;
  files: TorrentFile[];
  comment: string | null;
  creationDate: number | null;
  announceList: string[];
}

export interface MagnetInfo {
  name: string | null;
  infoHash: string;
  trackers: string[];
}

export interface GlobalStats {
  downloadSpeed: number;
  uploadSpeed: number;
  numActive: number;
  numWaiting: number;
  numStopped: number;
}
