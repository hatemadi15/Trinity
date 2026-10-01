// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Home from './page';

describe('landing page', () => {
  it('opens on the pitch line and three mission cards that link into Explore with the site and date', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/When is the Sun up, and can Earth hear you\?/);
    const cards = screen.getAllByRole('link', { name: /Open in Explore/ });
    expect(cards.map((c) => c.getAttribute('href'))).toEqual([
      '/explore?site=de_gerlache_rim_2',
      '/explore?site=im2_athena&start=2025-03-06',
      '/explore?site=blue_ghost_m1&start=2025-03-02',
    ]);
    expect(screen.getByText(/de Gerlache Rim 2/)).toBeTruthy();
    expect(screen.getByText(/IM-2/)).toBeTruthy();
    expect(screen.getByText(/Blue Ghost/)).toBeTruthy();
    expect(screen.getByText(/mare site with a flat skyline/)).toBeTruthy();
    // the header section and the hero button share this name until the home page is rebuilt
    expect(screen.getAllByRole('link', { name: /Explore a site/ }).every((a) => a.getAttribute('href') === '/explore')).toBe(true);
  });
});

describe('landing hero', () => {
  it('opens on a real render of the Shackleton rim with the pitch line over it, all three frames eager', () => {
    render(<Home />);
    const hero = screen.getByRole('img', { name: /Shackleton crater rim/ });
    expect(hero.getAttribute('src')).toMatch(/hero/);
    expect(screen.getByTestId('hero').contains(screen.getByRole('heading', { level: 1 }))).toBe(true);
    const frames = screen.getByTestId('hero').querySelectorAll('img');
    expect(frames.length).toBe(3);
    for (const f of frames) expect(f.getAttribute('loading')).not.toBe('lazy'); // the crossfade must never wait for a frame
  });
});
