// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEME_KEY } from '@/lib/theme';
import { ThemeSwitch } from './ThemeSwitch';

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeSwitch', () => {
  it('is one switch named for the theme it turns on, and switches the page both ways (spec 23)', () => {
    // A visitor who chose light before: dark is the default now (spec 6), so the page is light only by their choice.
    window.localStorage.setItem(THEME_KEY, 'light');
    document.documentElement.setAttribute('data-theme', 'light');
    render(<ThemeSwitch />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to the dark theme' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');
    fireEvent.click(screen.getByRole('button', { name: 'Switch to the light theme' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('light');
  });

  it('cross-fades the colours where the browser has no view transitions, and lets the fade go after it', () => {
    vi.useFakeTimers();
    document.documentElement.setAttribute('data-theme', 'dark');
    render(<ThemeSwitch />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to the light theme' }));
    expect(document.documentElement.classList.contains('theme-fading')).toBe(true);
    vi.advanceTimersByTime(600);
    expect(document.documentElement.classList.contains('theme-fading')).toBe(false);
    vi.useRealTimers();
  });

  it('re-applies a stored theme after mount (React resets <html> attributes on the Strict Mode remount in development)', () => {
    window.localStorage.setItem(THEME_KEY, 'dark');
    render(<ThemeSwitch />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
