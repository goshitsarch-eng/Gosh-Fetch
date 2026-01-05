let theme = $state<'dark' | 'light'>('dark');

export function getTheme() {
  return theme;
}

export function setTheme(newTheme: 'dark' | 'light') {
  theme = newTheme;
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('gosh-fetch-theme', newTheme);
}

export function toggleTheme() {
  setTheme(theme === 'dark' ? 'light' : 'dark');
}

export function initTheme() {
  const saved = localStorage.getItem('gosh-fetch-theme') as 'dark' | 'light' | null;
  setTheme(saved ?? 'dark');
}
