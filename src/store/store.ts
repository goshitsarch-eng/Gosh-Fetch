import { configureStore } from '@reduxjs/toolkit';
import downloadReducer from './downloadSlice';
import statsReducer from './statsSlice';
import themeReducer from './themeSlice';
import orderReducer from './orderSlice';

export const store = configureStore({
  reducer: {
    downloads: downloadReducer,
    stats: statsReducer,
    theme: themeReducer,
    order: orderReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
