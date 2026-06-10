export type Theme = 'dark' | 'light' | 'system';

const STORAGE_KEY = 'gosh-fetch-theme';

export function getEffectiveTheme(theme: Theme): 'dark' | 'light' {
  if (theme !== 'system') return theme;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
}

function applyEffectiveTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', getEffectiveTheme(theme));
}

class ThemeStore {
  theme = $state<Theme>((localStorage.getItem(STORAGE_KEY) as Theme) || 'dark');

  setTheme(theme: Theme) {
    this.theme = theme;
    applyEffectiveTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }

  toggleTheme() {
    this.setTheme(this.theme === 'dark' ? 'light' : 'dark');
  }

  applySystemTheme() {
    if (this.theme === 'system') {
      applyEffectiveTheme('system');
    }
  }
}

export const theme = new ThemeStore();
