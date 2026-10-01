// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { THEME_KEY } from '@/lib/theme';
import { ThemeSwitch } from './ThemeSwitch';

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeSwitch', () => {
  it('shows which theme is on and switches the page', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    render(<ThemeSwitch />);
    const group = screen.getByRole('group', { name: 'Theme' });
    const light = screen.getByRole('button', { name: 'Light' });
    const dark = screen.getByRole('button', { name: 'Dark' });
    expect(group.contains(light)).toBe(true);
    expect(light.getAttribute('aria-pressed')).toBe('true');
    expect(dark.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(dark);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(dark.getAttribute('aria-pressed')).toBe('true');
  });

  it('re-applies a stored theme after mount (React resets <html> attributes on the Strict Mode remount in development)', () => {
    window.localStorage.setItem(THEME_KEY, 'dark');
    render(<ThemeSwitch />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
