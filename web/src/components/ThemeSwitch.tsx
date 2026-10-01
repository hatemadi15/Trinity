'use client';
import { useLayoutEffect, useSyncExternalStore } from 'react';
import { applyTheme, currentTheme, DEFAULT_THEME, storedTheme, subscribeTheme, type Theme } from '@/lib/theme';

const OPTIONS: [Theme, string][] = [
  ['light', 'Light'],
  ['dark', 'Dark'],
];

/** Light or dark, in the header. The inline script in <head> sets the theme before paint; this shows and changes it. */
export function ThemeSwitch() {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => DEFAULT_THEME);
  // React clears attributes it does not manage on <html> when Strict Mode remounts in development: put the theme back before paint.
  useLayoutEffect(() => {
    const wanted = storedTheme();
    if (currentTheme() !== wanted || !document.documentElement.hasAttribute('data-theme')) applyTheme(wanted, false);
  }, []);
  return (
    <div role="group" aria-label="Theme" className="flex h-10 overflow-hidden rounded-[10px] border border-line-strong text-sm">
      {OPTIONS.map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={theme === value}
          onClick={() => applyTheme(value)}
          className={`px-3 ${theme === value ? 'bg-ink font-semibold text-page' : 'text-ink-2 hover:bg-surface-2'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
