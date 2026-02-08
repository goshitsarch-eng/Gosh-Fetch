import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from './store';

type Theme = 'dark' | 'light' | 'system';

interface ThemeState {
  theme: Theme;
}

function getEffectiveTheme(theme: Theme): 'dark' | 'light' {
  if (theme !== 'system') return theme;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
}

function applyEffectiveTheme(theme: Theme): void {
  const effective = getEffectiveTheme(theme);
  document.documentElement.setAttribute('data-theme', effective);
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
      applyEffectiveTheme(action.payload);
      localStorage.setItem('gosh-fetch-theme', action.payload);
    },
    toggleTheme: (state) => {
      const newTheme = state.theme === 'dark' ? 'light' : 'dark';
      state.theme = newTheme;
      applyEffectiveTheme(newTheme);
      localStorage.setItem('gosh-fetch-theme', newTheme);
    },
    applySystemTheme: (state) => {
      if (state.theme === 'system') {
        applyEffectiveTheme('system');
      }
    },
  },
});

export const { setTheme, toggleTheme, applySystemTheme } = themeSlice.actions;
export const selectTheme = (state: RootState) => state.theme.theme;
export { getEffectiveTheme };
export type { Theme };
export default themeSlice.reducer;
