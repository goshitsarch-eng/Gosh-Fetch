import { configureStore } from '@reduxjs/toolkit';
import downloadReducer from './downloadSlice';
import statsReducer from './statsSlice';
import themeReducer from './themeSlice';

export const store = configureStore({
  reducer: {
    downloads: downloadReducer,
    stats: statsReducer,
    theme: themeReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
