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
