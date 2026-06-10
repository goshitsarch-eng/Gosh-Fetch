// Recursive HTTP directory mirroring types.
// Field names are snake_case because they mirror gosh-dl's serde output.

export interface MirrorOptions {
  max_depth: number;
  same_host_only: boolean;
  allowed_prefix: string | null;
  include_patterns: string[];
  exclude_patterns: string[];
  preserve_paths: boolean;
  overwrite_existing: boolean;
  fail_fast: boolean;
  max_discovery_concurrency: number;
}

export function defaultMirrorOptions(): MirrorOptions {
  return {
    max_depth: 16,
    same_host_only: true,
    allowed_prefix: null,
    include_patterns: [],
    exclude_patterns: [],
    preserve_paths: true,
    overwrite_existing: false,
    fail_fast: false,
    max_discovery_concurrency: 4,
  };
}

export interface MirrorManifestEntry {
  url: string;
  relative_path: string;
  size_hint: number | null;
}

export interface MirrorManifest {
  root_url: string;
  entries: MirrorManifestEntry[];
}

export type MirrorJobState =
  | 'empty'
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'partial';

export interface MirrorJobProgress {
  total_children: number;
  queued_children: number;
  active_children: number;
  paused_children: number;
  completed_children: number;
  failed_children: number;
  missing_children: number;
  completed_size: number;
  total_size: number | null;
}

export interface MirrorTrackedJob {
  id: string;
  root_url: string;
  child_ids: string[];
  created_at: string;
}

export interface MirrorJobStatus {
  root_url: string;
  child_ids: string[];
  state: MirrorJobState;
  progress: MirrorJobProgress;
}

/** `{ job, status }` pair as returned by the backend commands and events. */
export interface MirrorJob {
  job: MirrorTrackedJob;
  status: MirrorJobStatus;
}
