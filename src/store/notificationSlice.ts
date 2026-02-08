import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from './store';

export interface AppNotification {
  id: string;
  type: 'completed' | 'failed' | 'added' | 'paused' | 'resumed';
  downloadName: string;
  timestamp: number;
  read: boolean;
}

interface NotificationState {
  items: AppNotification[];
}

const MAX_NOTIFICATIONS = 50;

const initialState: NotificationState = {
  items: [],
};

const notificationSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    addNotification: (state, action: PayloadAction<Omit<AppNotification, 'id' | 'read' | 'timestamp'>>) => {
      const notification: AppNotification = {
        ...action.payload,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        read: false,
      };
      state.items.unshift(notification);
      if (state.items.length > MAX_NOTIFICATIONS) {
        state.items = state.items.slice(0, MAX_NOTIFICATIONS);
      }
    },
    markAllRead: (state) => {
      for (const item of state.items) {
        item.read = true;
      }
    },
    removeNotification: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter(n => n.id !== action.payload);
    },
    clearAll: (state) => {
      state.items = [];
    },
  },
});

export const { addNotification, markAllRead, removeNotification, clearAll } = notificationSlice.actions;

export const selectNotifications = (state: RootState) => state.notifications.items;
export const selectUnreadCount = (state: RootState) => state.notifications.items.filter(n => !n.read).length;

export default notificationSlice.reducer;
