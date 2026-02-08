import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { fetchDownloads } from './downloadSlice';
import type { RootState } from './store';

const STORAGE_KEY = 'gosh-fetch-queue-order';

function loadOrder(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveOrder(order: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
}

interface OrderState {
  gidOrder: string[];
  isDragging: boolean;
}

const initialState: OrderState = {
  gidOrder: loadOrder(),
  isDragging: false,
};

const orderSlice = createSlice({
  name: 'order',
  initialState,
  reducers: {
    setOrder(state, action: PayloadAction<string[]>) {
      state.gidOrder = action.payload;
      saveOrder(action.payload);
    },
    setDragging(state, action: PayloadAction<boolean>) {
      state.isDragging = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchDownloads.fulfilled, (state, action) => {
      if (state.isDragging) return;

      const currentGids = new Set(action.payload.map(d => d.gid));
      // Remove GIDs that no longer exist
      const filtered = state.gidOrder.filter(gid => currentGids.has(gid));
      // Append new GIDs not yet in the order
      const ordered = new Set(filtered);
      for (const d of action.payload) {
        if (!ordered.has(d.gid)) {
          filtered.push(d.gid);
        }
      }
      state.gidOrder = filtered;
      saveOrder(filtered);
    });
  },
});

export const { setOrder, setDragging } = orderSlice.actions;

export const selectGidOrder = (state: RootState) => state.order.gidOrder;
export const selectIsDragging = (state: RootState) => state.order.isDragging;

export default orderSlice.reducer;
