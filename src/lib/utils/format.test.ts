import { describe, it, expect } from 'vitest';
import { formatBytes, formatSpeed, formatProgress, formatEta, getStatusColor, getStatusText } from './format';

describe('formatBytes', () => {
  it('returns "0 B" for zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats bytes correctly', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  it('formats kilobytes correctly', () => {
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(1536)).toBe('1.50 KB');
  });

  it('formats megabytes correctly', () => {
    expect(formatBytes(1048576)).toBe('1.00 MB');
    expect(formatBytes(1572864)).toBe('1.50 MB');
  });

  it('formats gigabytes correctly', () => {
    expect(formatBytes(1073741824)).toBe('1.00 GB');
  });

  it('formats terabytes correctly', () => {
    expect(formatBytes(1099511627776)).toBe('1.00 TB');
  });
});

describe('formatSpeed', () => {
  it('returns "0 B/s" for zero speed', () => {
    expect(formatSpeed(0)).toBe('0 B/s');
  });

  it('formats bytes per second', () => {
    expect(formatSpeed(500)).toBe('500 B/s');
  });

  it('formats kilobytes per second', () => {
    expect(formatSpeed(1024)).toBe('1.0 KB/s');
  });

  it('formats megabytes per second', () => {
    expect(formatSpeed(1048576)).toBe('1.0 MB/s');
  });

  it('formats gigabytes per second', () => {
    expect(formatSpeed(1073741824)).toBe('1.0 GB/s');
  });
});

describe('formatProgress', () => {
  it('returns 0 when total is 0', () => {
    expect(formatProgress(0, 0)).toBe(0);
  });

  it('returns 0 when completed is 0', () => {
    expect(formatProgress(0, 1000)).toBe(0);
  });

  it('returns 100 when completed equals total', () => {
    expect(formatProgress(1000, 1000)).toBe(100);
  });

  it('returns rounded percentage', () => {
    expect(formatProgress(500, 1000)).toBe(50);
    expect(formatProgress(333, 1000)).toBe(33);
    expect(formatProgress(667, 1000)).toBe(67);
  });
});

describe('formatEta', () => {
  it('returns "--" when speed is 0', () => {
    expect(formatEta(1000, 0)).toBe('--');
  });

  it('returns "--" when bytes remaining is 0', () => {
    expect(formatEta(0, 1000)).toBe('--');
  });

  it('formats seconds', () => {
    expect(formatEta(30, 1)).toBe('30s');
  });

  it('formats minutes and seconds', () => {
    expect(formatEta(90, 1)).toBe('1m 30s');
  });

  it('formats hours and minutes', () => {
    expect(formatEta(3661, 1)).toBe('1h 1m');
  });

  it('formats days and hours', () => {
    expect(formatEta(90000, 1)).toBe('1d 1h');
  });
});

describe('getStatusColor', () => {
  it('returns success color for active status', () => {
    expect(getStatusColor('active')).toBe('var(--color-success)');
  });

  it('returns success color for downloading status', () => {
    expect(getStatusColor('downloading')).toBe('var(--color-success)');
  });

  it('returns info color for queued status', () => {
    expect(getStatusColor('queued')).toBe('var(--color-info)');
  });

  it('returns info color for waiting status', () => {
    expect(getStatusColor('waiting')).toBe('var(--color-info)');
  });

  it('returns warning color for paused status', () => {
    expect(getStatusColor('paused')).toBe('var(--color-warning)');
  });

  it('returns warning color for stalled status', () => {
    expect(getStatusColor('stalled')).toBe('var(--color-warning)');
  });

  it('returns warning color for retrying status', () => {
    expect(getStatusColor('retrying')).toBe('var(--color-warning)');
  });

  it('returns success color for completed status', () => {
    expect(getStatusColor('complete')).toBe('var(--color-success)');
    expect(getStatusColor('completed')).toBe('var(--color-success)');
  });

  it('returns destructive color for error status', () => {
    expect(getStatusColor('error')).toBe('var(--color-destructive)');
  });

  it('returns destructive color for removed status', () => {
    expect(getStatusColor('removed')).toBe('var(--color-destructive)');
  });

  it('returns muted color for unknown status', () => {
    expect(getStatusColor('unknown')).toBe('var(--text-muted)');
  });
});

describe('getStatusText', () => {
  it('returns "Downloading" for active status with speed', () => {
    expect(getStatusText('active', 1000)).toBe('Downloading');
  });

  it('returns "Stalled" for active status without speed', () => {
    expect(getStatusText('active', 0)).toBe('Stalled');
    expect(getStatusText('active')).toBe('Stalled');
  });

  it('returns "Queued" for waiting status', () => {
    expect(getStatusText('waiting')).toBe('Queued');
  });

  it('returns "Paused" for paused status', () => {
    expect(getStatusText('paused')).toBe('Paused');
  });

  it('returns "Completed" for complete status', () => {
    expect(getStatusText('complete')).toBe('Completed');
    expect(getStatusText('completed')).toBe('Completed');
  });

  it('returns "Error" for error status', () => {
    expect(getStatusText('error')).toBe('Error');
  });

  it('returns "Removed" for removed status', () => {
    expect(getStatusText('removed')).toBe('Removed');
  });

  it('returns "Downloading" for downloading status', () => {
    expect(getStatusText('downloading')).toBe('Downloading');
  });

  it('returns "Queued" for queued status', () => {
    expect(getStatusText('queued')).toBe('Queued');
  });

  it('returns "Stalled" for stalled status', () => {
    expect(getStatusText('stalled')).toBe('Stalled');
  });

  it('returns "Retrying" for retrying status', () => {
    expect(getStatusText('retrying')).toBe('Retrying');
  });

  it('capitalizes unknown status', () => {
    expect(getStatusText('something')).toBe('Something');
  });
});
