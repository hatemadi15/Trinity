// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, currentTheme, DEFAULT_THEME, parseTheme, resolveTheme, subscribeTheme, THEME_KEY, THEME_SCRIPT, THEME_VISIT_KEY } from './theme';

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  window.history.pushState({}, '', '/');
  vi.restoreAllMocks();
});

describe('resolveTheme', () => {
  it('prefers the URL, then the visit, then the stored choice, then dark (spec 6: dark by default)', () => {
    expect(DEFAULT_THEME).toBe('dark');
    expect(resolveTheme('', null, null)).toBe('dark');
    expect(resolveTheme('', null, 'dark')).toBe('dark');
    expect(resolveTheme('', 'light', 'dark')).toBe('light');
    expect(resolveTheme('?theme=dark', 'light', 'light')).toBe('dark');
  });

  it('keeps a returning visitor’s light theme: a stored choice or the address wins over the new default', () => {
    expect(resolveTheme('', null, 'light')).toBe('light');
    expect(resolveTheme('?theme=light', null, null)).toBe('light');
    expect(resolveTheme('', 'light', null)).toBe('light');
  });

  it('ignores anything that is not light or dark', () => {
    expect(parseTheme('banana')).toBeNull();
    expect(parseTheme(null)).toBeNull();
    expect(resolveTheme('?theme=banana', 'purple', 'DARK')).toBe('dark');
    expect(resolveTheme('?theme=banana', null, 'light')).toBe('light');
  });
});

describe('THEME_SCRIPT', () => {
  const run = () => new Function(THEME_SCRIPT)();

  it('sets data-theme by the same rule as resolveTheme', () => {
    const cases: [string, string | null, string | null][] = [
      ['/', null, null],
      ['/', null, 'dark'],
      ['/?theme=dark', null, 'light'],
      ['/?theme=banana', null, 'dark'],
      ['/', 'dark', 'light'],
    ];
    for (const [url, visit, stored] of cases) {
      window.localStorage.clear();
      window.sessionStorage.clear();
      if (stored) window.localStorage.setItem(THEME_KEY, stored);
      if (visit) window.sessionStorage.setItem(THEME_VISIT_KEY, visit);
      window.history.pushState({}, '', url);
      run();
      expect(document.documentElement.getAttribute('data-theme'), `${url} ${visit} ${stored}`).toBe(resolveTheme(window.location.search, visit, stored));
    }
  });

  it('remembers a theme from the URL for the rest of the visit', () => {
    window.history.pushState({}, '', '/?theme=dark');
    run();
    expect(window.sessionStorage.getItem(THEME_VISIT_KEY)).toBe('dark');
  });

  it('still sets the default when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    run();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});

describe('applyTheme', () => {
  it('sets the attribute, stores the choice, clears the visit override and tells subscribers', () => {
    window.sessionStorage.setItem(THEME_VISIT_KEY, 'light');
    const seen: string[] = [];
    const off = subscribeTheme(() => seen.push(currentTheme()));
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(window.sessionStorage.getItem(THEME_VISIT_KEY)).toBeNull();
    expect(seen).toEqual(['dark']);
    off();
    applyTheme('light');
    expect(seen).toEqual(['dark']);
  });

  it('still switches the page when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    applyTheme('dark');
    expect(currentTheme()).toBe('dark');
  });
});
