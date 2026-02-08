import { configureStore } from '@reduxjs/toolkit';
import downloadReducer from './downloadSlice';
import statsReducer from './statsSlice';
import themeReducer from './themeSlice';
import orderReducer from './orderSlice';
import notificationReducer from './notificationSlice';
import updaterReducer from './updaterSlice';

export const store = configureStore({
  reducer: {
    downloads: downloadReducer,
    stats: statsReducer,
    theme: themeReducer,
    order: orderReducer,
    notifications: notificationReducer,
    updater: updaterReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
