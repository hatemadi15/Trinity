// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShadowPicture } from '@/lib/engine/shadow-handler';
import { ShadowMap } from './ShadowMap';

const picture = (siteLit: boolean): ShadowPicture => ({ id: 1, type: 'picture', key: 'k', width: 4, height: 4, pixels: new Uint8Array(16).fill(100), siteLit });

function show(extra: Partial<Parameters<typeof ShadowMap>[0]> = {}) {
  render(<ShadowMap picture={picture(true)} widthKm={20.48} siteName="de Gerlache Rim 2" lon={-64.31} sunAz={30} sunEl={2.4} earthAz={64} earthEl={-1.2} when="1 Jan 2027, 00:00 UTC" {...extra} />);
}

describe('ShadowMap', () => {
  // jsdom has no 2D canvas: the picture is painted only in a browser.
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  it('draws the ground from above for the hour, and says whether the site is in sunlight', () => {
    show();
    expect(screen.getByRole('img', { name: 'Shadows at 1 Jan 2027, 00:00 UTC. The site is in sunlight.' })).toBeTruthy();
    cleanup();
    show({ picture: picture(false) });
    expect(screen.getByRole('img', { name: 'Shadows at 1 Jan 2027, 00:00 UTC. The site is in shadow.' })).toBeTruthy();
  });

  it('says it is working out the shadows until the first picture arrives', () => {
    show({ picture: null });
    expect(screen.getByRole('img', { name: 'Shadows at 1 Jan 2027, 00:00 UTC: being worked out.' })).toBeTruthy();
    expect(screen.getByText('Working out the shadows…')).toBeTruthy();
  });

  it('marks the site, gives a scale, and points to the Sun and to Earth with their heights', () => {
    show();
    expect(screen.getByText('de Gerlache Rim 2')).toBeTruthy();
    expect(screen.getByText('5 km')).toBeTruthy();
    expect(screen.getByText('Sun 2° up')).toBeTruthy();
    expect(screen.getByText('Earth below the horizon')).toBeTruthy();
  });

  it("turns the arrows with the site: the Sun's map bearing is its azimuth plus the longitude", () => {
    show({ lon: 0, sunAz: 90 });
    const sun = document.querySelector<SVGLineElement>('[data-arrow="sun"]')!;
    expect(Number(sun.getAttribute('x2'))).toBeGreaterThan(Number(sun.getAttribute('x1')));
    expect(Number(sun.getAttribute('y2'))).toBeCloseTo(Number(sun.getAttribute('y1')), 6);
  });
});
