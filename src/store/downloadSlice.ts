import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { Download, DownloadOptions } from '../lib/types/download';
import { api } from '../lib/api';
import type { RootState } from './store';

interface DownloadState {
  downloads: Download[];
  completedHistory: Download[];
  isLoading: boolean;
  error: string | null;
}

const initialState: DownloadState = {
  downloads: [],
  completedHistory: [],
  isLoading: false,
  error: null,
};

export const fetchDownloads = createAsyncThunk(
  'downloads/fetchAll',
  async () => {
    const downloads = await api.getAllDownloads();
    // Save all downloads to DB for persistence
    for (const d of downloads) {
      try {
        await api.dbSaveDownload(d);
      } catch {
        // Ignore save errors during polling
      }
    }
    return downloads;
  }
);

export const loadCompletedHistory = createAsyncThunk(
  'downloads/loadHistory',
  async () => {
    return await api.dbGetCompletedHistory();
  }
);

export const addDownload = createAsyncThunk(
  'downloads/add',
  async ({ url, options }: { url: string; options?: DownloadOptions }) => {
    return await api.addDownload(url, options);
  }
);

export const addMagnet = createAsyncThunk(
  'downloads/addMagnet',
  async ({ magnetUri, options }: { magnetUri: string; options?: DownloadOptions }) => {
    return await api.addMagnet(magnetUri, options);
  }
);

export const addUrls = createAsyncThunk(
  'downloads/addUrls',
  async ({ urls, options }: { urls: string[]; options?: DownloadOptions }) => {
    return await api.addUrls(urls, options);
  }
);

export const addTorrentFile = createAsyncThunk(
  'downloads/addTorrent',
  async ({ filePath, options }: { filePath: string; options?: DownloadOptions }) => {
    return await api.addTorrentFile(filePath, options);
  }
);

export const pauseDownload = createAsyncThunk(
  'downloads/pause',
  async (gid: string) => {
    await api.pauseDownload(gid);
  }
);

export const resumeDownload = createAsyncThunk(
  'downloads/resume',
  async (gid: string) => {
    await api.resumeDownload(gid);
  }
);

export const removeDownload = createAsyncThunk(
  'downloads/remove',
  async ({ gid, deleteFiles }: { gid: string; deleteFiles: boolean }) => {
    await api.removeDownload(gid, deleteFiles);
    try {
      await api.dbRemoveDownload(gid);
    } catch {
      // Ignore
    }
    return gid;
  }
);

export const pauseAll = createAsyncThunk(
  'downloads/pauseAll',
  async () => {
    await api.pauseAll();
  }
);

export const resumeAll = createAsyncThunk(
  'downloads/resumeAll',
  async () => {
    await api.resumeAll();
  }
);

export const clearHistory = createAsyncThunk(
  'downloads/clearHistory',
  async () => {
    await api.dbClearHistory();
  }
);

// Maps position in queue to a priority bucket, then calls setPriority only for changed items
export const syncPriorities = createAsyncThunk(
  'downloads/syncPriorities',
  async (gidOrder: string[], { getState }) => {
    const total = gidOrder.length;
    if (total === 0) return;

    function getBucket(index: number): string {
      const ratio = total === 1 ? 0 : index / (total - 1);
      if (ratio <= 0.10) return 'critical';
      if (ratio <= 0.35) return 'high';
      if (ratio <= 0.75) return 'normal';
      return 'low';
    }

    for (let i = 0; i < total; i++) {
      const gid = gidOrder[i];
      const bucket = getBucket(i);
      try {
        await api.setPriority(gid, bucket);
      } catch {
        // Download may have been removed between reorder and sync
      }
    }
  }
);

export const restoreIncomplete = createAsyncThunk(
  'downloads/restoreIncomplete',
  async () => {
    const incompleteDownloads = await api.dbLoadIncomplete();
    for (const download of incompleteDownloads) {
      try {
        if (download.downloadType === 'magnet' && download.magnetUri) {
          await api.addMagnet(download.magnetUri);
        } else if (download.downloadType === 'torrent' && download.magnetUri) {
          await api.addMagnet(download.magnetUri);
        } else if (download.url) {
          await api.addDownload(download.url);
        }
        await api.dbRemoveDownload(download.gid);
      } catch (e) {
        console.error(`Failed to restore download ${download.name}:`, e);
      }
    }
  }
);

const downloadSlice = createSlice({
  name: 'downloads',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchDownloads.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchDownloads.fulfilled, (state, action: PayloadAction<Download[]>) => {
        state.downloads = action.payload;
        state.isLoading = false;
      })
      .addCase(fetchDownloads.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to fetch downloads';
        state.isLoading = false;
      })
      .addCase(loadCompletedHistory.fulfilled, (state, action: PayloadAction<Download[]>) => {
        state.completedHistory = action.payload;
      })
      .addCase(clearHistory.fulfilled, (state) => {
        state.completedHistory = [];
      })
      .addCase(removeDownload.fulfilled, (state, action: PayloadAction<string>) => {
        state.completedHistory = state.completedHistory.filter(d => d.gid !== action.payload);
      });
  },
});

// Selectors
export const selectDownloads = (state: RootState) => state.downloads.downloads;
export const selectCompletedHistory = (state: RootState) => state.downloads.completedHistory;
export const selectIsLoading = (state: RootState) => state.downloads.isLoading;
export const selectError = (state: RootState) => state.downloads.error;

export const selectActiveDownloads = (state: RootState) =>
  state.downloads.downloads.filter(d => d.status === 'active' || d.status === 'waiting');

export const selectPausedDownloads = (state: RootState) =>
  state.downloads.downloads.filter(d => d.status === 'paused');

export const selectErrorDownloads = (state: RootState) =>
  state.downloads.downloads.filter(d => d.status === 'error');

export const selectCompletedDownloads = (state: RootState) => {
  const engineCompleted = state.downloads.downloads.filter(d => d.status === 'complete');
  const engineGids = new Set(engineCompleted.map(d => d.gid));
  const historyOnly = state.downloads.completedHistory.filter(d => !engineGids.has(d.gid));
  return [...engineCompleted, ...historyOnly];
};

export default downloadSlice.reducer;
