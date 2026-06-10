export type Theme = 'dark' | 'light' | 'system';

const STORAGE_KEY = 'gosh-fetch-theme';
const ACCENT_KEY = 'gosh-fetch-accent';

/** Signal-color hues for the accent picker (sets --sig-h). */
export const ACCENTS = [
  { v: '18', name: 'Signal Orange' },
  { v: '8', name: 'Red' },
  { v: '320', name: 'Magenta' },
  { v: '265', name: 'Violet' },
  { v: '210', name: 'Blue' },
  { v: '168', name: 'Teal' },
] as const;

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

function applyAccent(hue: string): void {
  document.documentElement.style.setProperty('--sig-h', hue);
}

class ThemeStore {
  theme = $state<Theme>((localStorage.getItem(STORAGE_KEY) as Theme) || 'dark');
  accent = $state<string>(localStorage.getItem(ACCENT_KEY) || '18');

  constructor() {
    // Apply at module init so every window (main + tray popup) is styled
    // before first paint, without each entry point having to remember to.
    applyEffectiveTheme(this.theme);
    applyAccent(this.accent);
  }

  setTheme(theme: Theme) {
    this.theme = theme;
    applyEffectiveTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }

  toggleTheme() {
    this.setTheme(getEffectiveTheme(this.theme) === 'dark' ? 'light' : 'dark');
  }

  setAccent(hue: string) {
    this.accent = hue;
    applyAccent(hue);
    localStorage.setItem(ACCENT_KEY, hue);
  }

  applySystemTheme() {
    if (this.theme === 'system') {
      applyEffectiveTheme('system');
    }
  }
}

export const theme = new ThemeStore();
