// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
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

  it('renders the wordmark, three choices and no more in the header\'s row, the theme switch and the footer credits', () => {
    render(
      <AppFrame>
        <p>hello</p>
      </AppFrame>,
    );
    expect(screen.getByRole('link', { name: /Earthrise/ }).getAttribute('href')).toBe('/');
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    // One row at every width: three short names fit a phone.
    expect(nav.className).not.toMatch(/\bgrid\b/);
    const links = [...nav.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      ['Known sites', '/sites'],
      ['Your own site', '/explore?own=1'],
      ['Compare', '/compare'],
    ]);
    // Besides the wordmark, the header's only links are those three: How it works, Accuracy and Plan a landing are not in it.
    const header = screen.getByRole('banner');
    expect(within(header).getAllByRole('link')).toHaveLength(4);
    expect(header.textContent).not.toMatch(/How it works|Accuracy|Plan a landing/);
    expect(screen.getByRole('button', { name: /Switch to the (light|dark) theme/ })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Audience' })).toBeNull();
    const footer = screen.getByRole('contentinfo');
    expect(footer.textContent).toMatch(/NASA Lunar Reconnaissance Orbiter/);
    // Who made it comes first, and that it is not a NASA product.
    expect(footer.firstElementChild?.firstElementChild?.textContent).toMatch(/^Made by team Astroy\/Ed for NASA Space Apps 2026/);
    expect(footer.textContent).toMatch(/Not an official NASA product\./);
    expect(footer.textContent).toMatch(/CLPS: NASA's Commercial Lunar Payload Services/);
    expect(screen.getByText('hello')).toBeTruthy();
  });

  it('keeps How it works and Accuracy reachable on every page, out of the way: the About menu at the header\'s right, and the footer', () => {
    render(
      <AppFrame>
        <p>hello</p>
      </AppFrame>,
    );
    const header = screen.getByRole('banner');
    const about = within(header).getByRole('button', { name: 'About Earthrise' });
    // Closed at first, before Luna and the theme switch.
    expect(about.getAttribute('aria-expanded')).toBe('false');
    expect(about.compareDocumentPosition(within(header).getByRole('button', { name: /^Luna/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(about);
    expect(about.getAttribute('aria-expanded')).toBe('true');
    const menu = within(header).getByRole('list', { name: 'About Earthrise' });
    expect(within(menu).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['How it works', '/learn'],
      ['Accuracy', '/validate'],
    ]);
    // Escape closes it and hands the focus back to its button; so does a press outside it.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(about.getAttribute('aria-expanded')).toBe('false');
    expect(within(header).queryByRole('list')).toBeNull();
    expect(document.activeElement).toBe(about);
    fireEvent.click(about);
    fireEvent.pointerDown(document.body);
    expect(about.getAttribute('aria-expanded')).toBe('false');
    // The footer has the same two links, with who the app is for.
    const footer = within(screen.getByRole('contentinfo')).getByRole('navigation', { name: 'About Earthrise' });
    expect(footer.textContent).toMatch(/^For planners of NASA's commercial Moon landers, teachers and anyone curious\./);
    expect(within(footer).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['How it works', '/learn'],
      ['Accuracy', '/validate'],
    ]);
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

  it('has Luna’s toggle in the header, before the theme switch, off at first (spec 22)', () => {
    render(
      <AppFrame>
        <p>page</p>
      </AppFrame>,
    );
    const header = screen.getByRole('banner');
    const luna = within(header).getByRole('button', { name: /^Luna/ });
    expect(luna.getAttribute('aria-pressed')).toBe('false');
    expect(luna.compareDocumentPosition(within(header).getByRole('button', { name: /Switch to the (light|dark) theme/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
