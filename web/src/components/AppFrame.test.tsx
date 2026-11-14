// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { exploreStore } from '@/lib/store/explore';
import { AppFrame } from './AppFrame';

describe('AppFrame', () => {
  it('has no tagline in the header: the page title and the home headline say what Earthrise is', () => {
    render(
      <AppFrame>
        <p>hello</p>
      </AppFrame>,
    );
    const header = screen.getByRole('banner');
    expect(header.textContent).not.toMatch(/forecast for the Moon/);
    expect(header.textContent).toMatch(/^Earthrise/);
  });

  it('renders the wordmark, the planning and learning sections in plain words, the theme switch and the footer credits', () => {
    render(
      <AppFrame>
        <p>hello</p>
      </AppFrame>,
    );
    expect(screen.getByRole('link', { name: /Earthrise/ }).getAttribute('href')).toBe('/');
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(nav.className).toMatch(/\bmax-sm:grid\b.*\bmax-sm:grid-cols-2\b/); // two by two on a phone, none alone on a line
    const links = [...nav.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      ['Plan a landing', '/plan'],
      ['Choose a site', '/sites'],
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

  it('puts faint stars behind the header, first in the frame so the header and the page paint over them', () => {
    const { container } = render(<AppFrame>page</AppFrame>);
    const frame = container.firstElementChild as HTMLElement;
    const band = frame.firstElementChild as HTMLElement;
    expect(band.tagName).toBe('CANVAS');
    expect(band.getAttribute('aria-hidden')).toBe('true');
    expect(frame.className).toMatch(/\brelative\b/);
    expect(frame.querySelector('header')!.className).toMatch(/\brelative\b/);
    expect(frame.querySelector('header')!.className).not.toMatch(/\bbg-page\b/);
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
