import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from './store';

type Theme = 'dark' | 'light';

interface ThemeState {
  theme: Theme;
}

const initialState: ThemeState = {
  theme: (localStorage.getItem('gosh-fetch-theme') as Theme) || 'dark',
};

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    setTheme: (state, action: PayloadAction<Theme>) => {
      state.theme = action.payload;
      document.documentElement.setAttribute('data-theme', action.payload);
      localStorage.setItem('gosh-fetch-theme', action.payload);
    },
    toggleTheme: (state) => {
      const newTheme = state.theme === 'dark' ? 'light' : 'dark';
      state.theme = newTheme;
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('gosh-fetch-theme', newTheme);
    },
  },
});

export const { setTheme, toggleTheme } = themeSlice.actions;
export const selectTheme = (state: RootState) => state.theme.theme;
export default themeSlice.reducer;
