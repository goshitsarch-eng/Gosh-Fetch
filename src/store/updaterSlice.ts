import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from './store';

type UpdaterPhase = 'idle' | 'available' | 'downloading' | 'downloaded';

interface UpdaterState {
  phase: UpdaterPhase;
  version: string | null;
  releaseName: string | null;
  releaseNotes: string;
  releaseDate: string | null;
  total: number;
  transferred: number;
  percent: number;
  bytesPerSecond: number;
  dismissed: boolean;
}

const initialState: UpdaterState = {
  phase: 'idle',
  version: null,
  releaseName: null,
  releaseNotes: '',
  releaseDate: null,
  total: 0,
  transferred: 0,
  percent: 0,
  bytesPerSecond: 0,
  dismissed: false,
};

const updaterSlice = createSlice({
  name: 'updater',
  initialState,
  reducers: {
    setUpdateAvailable(state, action: PayloadAction<{
      version: string;
      releaseName: string | null;
      releaseNotes: string;
      releaseDate: string;
    }>) {
      state.phase = 'available';
      state.version = action.payload.version;
      state.releaseName = action.payload.releaseName;
      state.releaseNotes = action.payload.releaseNotes;
      state.releaseDate = action.payload.releaseDate;
      state.dismissed = false;
    },
    setDownloading(state) {
      state.phase = 'downloading';
    },
    setDownloadProgress(state, action: PayloadAction<{
      total: number;
      transferred: number;
      percent: number;
      bytesPerSecond: number;
    }>) {
      state.total = action.payload.total;
      state.transferred = action.payload.transferred;
      state.percent = action.payload.percent;
      state.bytesPerSecond = action.payload.bytesPerSecond;
    },
    setUpdateDownloaded(state) {
      state.phase = 'downloaded';
      state.percent = 100;
    },
    dismissUpdate(state) {
      state.dismissed = true;
    },
  },
});

export const {
  setUpdateAvailable,
  setDownloading,
  setDownloadProgress,
  setUpdateDownloaded,
  dismissUpdate,
} = updaterSlice.actions;

export const selectUpdaterPhase = (s: RootState) => s.updater.phase;
export const selectUpdaterVersion = (s: RootState) => s.updater.version;
export const selectUpdaterReleaseNotes = (s: RootState) => s.updater.releaseNotes;
export const selectUpdaterProgress = (s: RootState) => ({
  total: s.updater.total,
  transferred: s.updater.transferred,
  percent: s.updater.percent,
  bytesPerSecond: s.updater.bytesPerSecond,
});
export const selectUpdaterDismissed = (s: RootState) => s.updater.dismissed;

export default updaterSlice.reducer;
