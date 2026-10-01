// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { exploreStore } from '@/lib/store/explore';
import { AppFrame } from './AppFrame';

describe('AppFrame', () => {
  it('renders the wordmark, the four sections in plain words, the theme switch and the footer credits', () => {
    render(
      <AppFrame>
        <p>hello</p>
      </AppFrame>,
    );
    expect(screen.getByRole('link', { name: /Earthrise/ }).getAttribute('href')).toBe('/');
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    const links = [...nav.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      ['Explore a site', '/explore'],
      ['Compare sites', '/compare'],
      ['How it works', '/learn'],
      ['Accuracy', '/validate'],
    ]);
    expect(screen.getByRole('group', { name: 'Theme' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Audience' })).toBeNull();
    const footer = screen.getByRole('contentinfo');
    expect(footer.textContent).toMatch(/NASA Lunar Reconnaissance Orbiter/);
    // Who made it comes first, and that it is not a NASA product.
    expect(footer.firstElementChild?.firstElementChild?.textContent).toMatch(/^Made by team Astroy\/Ed for NASA Space Apps 2026/);
    expect(footer.textContent).toMatch(/Not an official NASA product\./);
    expect(footer.textContent).toMatch(/CLPS: NASA's Commercial Lunar Payload Services/);
    expect(screen.getByText('hello')).toBeTruthy();
  });

  it('keeps instrument names out of the header', () => {
    render(
      <AppFrame>
        <p>x</p>
      </AppFrame>,
    );
    expect(screen.getByRole('banner').textContent).not.toMatch(/LOLA|DE440|CLPS|Horizons/);
  });
});

describe('AppFrame demo gate', () => {
  it('reads ?demo=1 on any page and switches the shared store to rehearsed answers', () => {
    window.sessionStorage.clear();
    exploreStore.getState().setAiMode('live');
    window.history.pushState({}, '', '/?demo=1');
    render(
      <AppFrame>
        <p>x</p>
      </AppFrame>,
    );
    expect(exploreStore.getState().aiMode).toBe('cached');
    window.history.pushState({}, '', '/');
    window.sessionStorage.clear();
    exploreStore.getState().setAiMode('live');
  });
});
