import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from './store';

interface StatsState {
  downloadSpeed: number;
  uploadSpeed: number;
  numActive: number;
  numWaiting: number;
  numStopped: number;
  isConnected: boolean;
}

const initialState: StatsState = {
  downloadSpeed: 0,
  uploadSpeed: 0,
  numActive: 0,
  numWaiting: 0,
  numStopped: 0,
  isConnected: false,
};

const statsSlice = createSlice({
  name: 'stats',
  initialState,
  reducers: {
    updateStats: (state, action: PayloadAction<{
      downloadSpeed: number;
      uploadSpeed: number;
      numActive: number;
      numWaiting: number;
      numStopped: number;
    }>) => {
      state.downloadSpeed = action.payload.downloadSpeed;
      state.uploadSpeed = action.payload.uploadSpeed;
      state.numActive = action.payload.numActive;
      state.numWaiting = action.payload.numWaiting;
      state.numStopped = action.payload.numStopped;
      state.isConnected = true;
    },
    setDisconnected: (state) => {
      state.isConnected = false;
    },
  },
});

export const { updateStats, setDisconnected } = statsSlice.actions;

export const selectStats = (state: RootState) => state.stats;
export const selectIsConnected = (state: RootState) => state.stats.isConnected;

export default statsSlice.reducer;
