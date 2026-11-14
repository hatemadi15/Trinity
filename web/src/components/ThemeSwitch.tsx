'use client';
import { useId, useLayoutEffect, useSyncExternalStore } from 'react';
import { applyTheme, currentTheme, DEFAULT_THEME, storedTheme, subscribeTheme, transitionTheme } from '@/lib/theme';

/**
 * Light or dark, in the header: one round switch (spec 23). It shows the theme it would switch to, a Sun on the dark
 * page and a Moon on the light one, and the change opens from it as a circle (transitionTheme). The inline script in
 * <head> sets the theme before paint; this shows and changes it.
 */
export function ThemeSwitch() {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => DEFAULT_THEME);
  // React clears attributes it does not manage on <html> when Strict Mode remounts in development: put the theme back before paint.
  useLayoutEffect(() => {
    const wanted = storedTheme();
    if (currentTheme() !== wanted || !document.documentElement.hasAttribute('data-theme')) applyTheme(wanted, false);
  }, []);
  const dark = theme === 'dark';
  const cut = `theme-cut-${useId().replace(/:/g, '')}`;
  return (
    <button
      type="button"
      aria-label={dark ? 'Switch to the light theme' : 'Switch to the dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        transitionTheme(dark ? 'light' : 'dark', { x: r.left + r.width / 2, y: r.top + r.height / 2 });
      }}
      className="group relative grid h-11 w-11 cursor-pointer place-items-center rounded-full border border-line-strong text-ink-2 transition-[border-color,box-shadow,color] duration-300 hover:border-accent hover:text-ink hover:shadow-[0_0_22px_-6px_rgb(var(--glow)/var(--glow-strength))]"
    >
      <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true" className="overflow-visible">
        {/* The disc: a full Sun on the dark page; on the light page a crescent, cut by the circle that slides over it. */}
        <mask id={cut}>
          <rect x="-4" y="-4" width="32" height="32" fill="white" />
          <circle cx={dark ? 30 : 16} cy={dark ? -6 : 8} r="7" fill="black" className="transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]" />
        </mask>
        <circle cx="12" cy="12" r={dark ? 4.5 : 8} fill="currentColor" stroke="none" mask={`url(#${cut})`} className="transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]" />
        <g className={`origin-center transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:rotate-45 ${dark ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}>
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <line key={a} x1="12" y1="2.5" x2="12" y2="4.8" transform={`rotate(${a} 12 12)`} />
          ))}
        </g>
      </svg>
    </button>
  );
}
